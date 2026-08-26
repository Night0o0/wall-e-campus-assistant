import { SessionCloseReason } from "@prisma/client";
import {
  attendanceConfig,
  sessionWindowConfig,
} from "../config/attendance.config.js";
import { notificationConfig } from "../config/notification.config.js";
import { AttendanceRepository } from "../repositories/attendance.repository.js";
import { ScheduleRepository } from "../repositories/schedule.repository.js";
import { SessionRepository } from "../repositories/session.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import { parseSemesterNumber } from "../types/schedule.types.js";
import { notFound } from "../utils/AppError.js";
import { occurrencesBetween } from "../utils/occurrence.util.js";
import {
  SessionLifecycleState,
  belongsToOccurrence,
  isStale,
  sameOccurrenceWindow,
  sessionState,
  sessionWindow,
} from "../utils/session-window.js";

/**
 * The attendance lifecycle: what happens to a lecture after everybody has gone
 * home.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The three states, and why they are three different things
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOT_RECORDED — no Session row exists for this occurrence at all. Nobody
 *   opened attendance. This is a statement about the *institution*: we do not
 *   know who was in that room, and we never will. It is derived from the
 *   absence of a row and is stored nowhere, because there is nothing to store
 *   it on.
 *
 * PENDING — a Session row exists, its status is ACTIVE, and the lecture it
 *   belongs to has ended. Attendance was taken but the session was never
 *   closed. This is a statement about the *session*: the record is real but
 *   provisional, students may still be scanning into it, and no conclusion may
 *   be drawn about anyone who has not. Derived from Session.status plus the
 *   clock; also stored nowhere.
 *
 * ABSENT — an Attendance row, status ABSENT, for one named student. This is a
 *   statement about a *person*, and it is the only one of the three that is
 *   written down. It is produced by exactly one code path, `sweepAbsences`
 *   below, which refuses to run against a session that is not CLOSED.
 *
 * The distinction is structural, not conventional. NOT_RECORDED has no Session;
 * PENDING has a Session but cannot have ABSENT rows, because the sweep only
 * selects `status: CLOSED`; ABSENT requires both. There is no way to reach an
 * ABSENT row without an opened-and-closed session behind it, and no amount of
 * time passing turns a NOT_RECORDED occurrence into an absence for anybody.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The order of operations
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `runSweep` closes stale sessions first and calls the roll second, in that
 * order and in the same pass. A session that goes stale at 12:30 is therefore
 * CLOSED with AUTO_STALE and has its absences written before the pass returns —
 * the two halves are not independent jobs that might run in either order.
 *
 * Both halves are idempotent, by construction rather than by convention:
 * closing is a conditional update on `status = ACTIVE`, so the second attempt
 * changes nothing; the roll is guarded by `absencesSweptAt` and backed by the
 * unique constraint on Attendance, so the second attempt inserts nothing.
 */

const MINUTE_MS = 60_000;

export interface StaleCloseResult {
  examined: number;
  closed: number;
}

export interface AbsenceSweepResult {
  examined: number;
  /** Sessions whose roll was called on this pass. */
  swept: number;
  /** ABSENT rows written. */
  absencesCreated: number;
  /** Closed sessions with no lecture behind them — see the note in sweepOne. */
  unlinked: number;
}

/** What one past occurrence of a lecture looks like, after the fact. */
export interface OccurrenceReport {
  occurrenceStartsAt: Date;
  state: SessionLifecycleState | "NOT_RECORDED";
  session: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date | null;
    room: string | null;
    closeReason: SessionCloseReason | null;
    /** False while the roll is still outstanding. */
    absencesSwept: boolean;
    attendanceCount: number;
  } | null;
}

export class AttendanceLifecycleService {
  constructor(
    private readonly sessions = new SessionRepository(),
    private readonly attendances = new AttendanceRepository(),
    private readonly schedules = new ScheduleRepository(),
    private readonly students = new StudentRepository(),
    private readonly timeZone: string = notificationConfig.timeZone
  ) {}

  /**
   * One full pass. This is what the worker calls, and the order is the
   * guarantee: stale sessions are closed, and only then is the roll called —
   * so a session that has just been auto-closed gets its absences in the same
   * pass rather than waiting for the next one.
   */
  async runSweep(now: Date = new Date()) {
    const stale = await this.closeStaleSessions(now);
    const absences = await this.sweepAbsences(now);

    return { stale, absences };
  }

  /* ------------------------- Stale session closure ------------------------- */

  /**
   * Closes sessions that outlived their lecture by more than the grace period.
   *
   * The grace is what makes PENDING a real state rather than an instant: from
   * the moment the lecture ends until the grace expires, the session is open,
   * over, and untouched by this method. An instructor who closes it by hand in
   * that window gets a MANUAL close, which is a different and better record
   * than AUTO_STALE.
   */
  async closeStaleSessions(now: Date = new Date()): Promise<StaleCloseResult> {
    const open = await this.sessions.findOpenForStaleCheck(
      attendanceConfig.batchSize
    );

    let closed = 0;

    for (const session of open) {
      if (!isStale(session, now, sessionWindowConfig)) {
        continue;
      }

      // endTime is when the lecture ended, not when the sweep noticed. A worker
      // that was down overnight must not stamp every forgotten session with
      // this morning's timestamp — the record would then claim attendance was
      // open all night, which is exactly the false conclusion an auditor would
      // draw from it.
      const { endsAt } = sessionWindow(session, sessionWindowConfig);

      const didClose = await this.sessions.closeIfOpen(
        session.id,
        endsAt,
        SessionCloseReason.AUTO_STALE
      );

      if (didClose) {
        closed += 1;
      }
    }

    return { examined: open.length, closed };
  }

  /* ----------------------------- Absence sweep ----------------------------- */

  /**
   * Calls the roll for closed sessions that have not had it called.
   *
   * Only `status: CLOSED` rows are selected, and that is not a convenience: it
   * is the guarantee that an ABSENT row cannot exist for a session anybody can
   * still scan into. A PENDING session is by definition still open, so it is
   * not in this result set, so none of its students can be marked absent.
   */
  async sweepAbsences(now: Date = new Date()): Promise<AbsenceSweepResult> {
    const pending = await this.sessions.findClosedAwaitingSweep(
      attendanceConfig.batchSize
    );

    const result: AbsenceSweepResult = {
      examined: pending.length,
      swept: 0,
      absencesCreated: 0,
      unlinked: 0,
    };

    for (const session of pending) {
      const outcome = await this.sweepOne(session, now);

      result.absencesCreated += outcome.created;
      result.unlinked += outcome.unlinked ? 1 : 0;
      result.swept += outcome.marked ? 1 : 0;
    }

    return result;
  }

  private async sweepOne(
    session: {
      id: string;
      organizationId: string;
      lectureScheduleId: string | null;
      startTime: Date;
      lectureSchedule: {
        organizationId: string;
        faculty: string;
        department: string;
        level: number;
        semester: number;
        section: string;
      } | null;
    },
    now: Date
  ) {
    /**
     * A session with no lecture behind it addresses no cohort, so there is no
     * list of people who should have been there and no absence can be derived.
     *
     * It is still marked swept, because "swept" means the roll has been through
     * this method and nothing further will ever be written for it — which is
     * true, and is the honest record. What it does NOT mean is that everybody
     * turned up: the session simply has no roll to call. That is why the count
     * is reported separately rather than folded into `swept`.
     */
    if (!session.lectureSchedule) {
      const marked = await this.sessions.markAbsencesSwept(session.id, now);
      return { created: 0, unlinked: true, marked };
    }

    const schedule = session.lectureSchedule;

    // Belt and braces over the foreign key: a session and its lecture are
    // written in one organization and cannot drift apart, but an absence is a
    // claim about a named student and is not worth writing on an assumption.
    if (schedule.organizationId !== session.organizationId) {
      return { created: 0, unlinked: false, marked: false };
    }

    const cohort = await this.students.findCohort({
      organizationId: session.organizationId,
      faculty: schedule.faculty,
      department: schedule.department,
      level: schedule.level,
      section: schedule.section,
    });

    // The same semester reader the timetable and the reminder generator use, so
    // the people marked absent from a lecture are exactly the people whose
    // timetable showed it. A profile whose semester cannot be read is not in
    // the cohort and is not marked absent — an unreadable profile is not
    // evidence that somebody skipped a lecture.
    const expected = cohort.filter(
      (profile) =>
        parseSemesterNumber(profile.semester) === schedule.semester &&
        profile.user.organizationId === session.organizationId
    );

    const alreadyRecorded = await this.attendances.findStudentIdsBySession(
      session.id
    );

    /**
     * Anybody who turned up to another session of this same occurrence.
     *
     * Opening two sessions for one lecture occurrence is refused at the door —
     * see SessionService.assertOccurrenceNotAlreadyOpened — but that check is a
     * read followed by a write, so two simultaneous requests can still both get
     * through it, and any duplicate already in the database predates the guard
     * entirely. This is the half that makes the *harm* impossible rather than
     * merely unlikely.
     *
     * Without it the failure is silent and lands on a student: the roll is
     * called separately on each duplicate, `alreadyRecorded` above is scoped to
     * one session, and somebody who scanned into the first has no row on the
     * second — so an ABSENT is written about a person who was sitting in the
     * room. The unique constraint on Attendance cannot catch it, because
     * [studentId, sessionId] is satisfied by two different sessions.
     *
     * Only PRESENT and LATE count as evidence here. An ABSENT row on a sibling
     * is not proof that somebody attended, so it must not suppress an absence
     * on this one.
     */
    const attendedSibling = await this.attendedElsewhereInOccurrence(session);

    const missing = expected
      .map((profile) => profile.user.id)
      .filter(
        (userId) => !alreadyRecorded.has(userId) && !attendedSibling.has(userId)
      );

    const created = await this.attendances.createAbsences(
      session.id,
      missing,
      now
    );

    const marked = await this.sessions.markAbsencesSwept(session.id, now);

    return { created, unlinked: false, marked };
  }

  /**
   * The students who attended a *different* session of the same lecture
   * occurrence as this one.
   *
   * Siblings are found by how near they opened, using the one window definition
   * in utils/session-window.ts — a ±12h band, which for a weekly slot cannot
   * contain a session of any other occurrence. No time zone and no calendar is
   * involved, which is what keeps this testable as arithmetic.
   *
   * Empty for an unlinked session: with no lecture behind it there is no
   * occurrence to be a sibling of.
   */
  private async attendedElsewhereInOccurrence(session: {
    id: string;
    organizationId: string;
    lectureScheduleId: string | null;
    startTime: Date;
  }): Promise<Set<string>> {
    if (!session.lectureScheduleId) {
      return new Set();
    }

    const { from, to } = sameOccurrenceWindow(session.startTime);

    const siblings = await this.sessions.findOpenedForScheduleBetween(
      session.lectureScheduleId,
      session.organizationId,
      from,
      to
    );

    const siblingIds = siblings
      .map((sibling) => sibling.id)
      .filter((id) => id !== session.id);

    if (siblingIds.length === 0) {
      return new Set();
    }

    return this.attendances.findAttendedStudentIdsBySessions(siblingIds);
  }

  /* -------------------------- Reading the lifecycle ------------------------ */

  /**
   * What happened to each of a lecture's recent occurrences.
   *
   * This is the only place NOT_RECORDED can be produced, and the reason is
   * worth stating: every other read in this system starts from a row. To see
   * that attendance was never taken you have to start from the timetable
   * instead — enumerate the occurrences the recurring lecture actually produced
   * and ask which of them have a session. An occurrence with none is
   * NOT_RECORDED, and no row anywhere says so.
   */
  async occurrenceStates(
    lectureScheduleId: string,
    actor: { id: string; role: string; organizationId: string },
    options: { weeks?: number; now?: Date } = {}
  ) {
    const now = options.now ?? new Date();
    const weeks = Math.min(Math.max(options.weeks ?? 4, 1), 26);

    const schedule = await this.schedules.findById(lectureScheduleId);

    // Same answers ScheduleService gives, for the same reasons: a schedule in
    // another university and one that does not exist are indistinguishable, and
    // an instructor sees only their own lectures.
    if (!schedule || schedule.organizationId !== actor.organizationId) {
      throw notFound("Schedule not found");
    }

    if (actor.role === "INSTRUCTOR" && schedule.instructorId !== actor.id) {
      throw notFound("Schedule not found");
    }

    const windowMs = weeks * 7 * 24 * 60 * MINUTE_MS;
    const from = new Date(now.getTime() - windowMs);

    // Occurrences strictly in the past: one that has not happened yet is not
    // "not recorded", it is "not yet".
    const occurrences = occurrencesBetween(
      schedule,
      from,
      windowMs,
      this.timeZone
    ).filter((occurrence) => occurrence <= now);

    const sessions = await this.sessions.findByScheduleBetween(
      lectureScheduleId,
      actor.organizationId,
      from,
      now
    );

    const reports: OccurrenceReport[] = occurrences.map((occurrenceStartsAt) => {
      // The same adjacency rule the duplicate-session guard uses, from the same
      // definition — so "this session belongs to that occurrence" and "these two
      // sessions are the same occurrence" can never disagree. See
      // utils/session-window.ts.
      const match = sessions.find((session) =>
        belongsToOccurrence(session.startTime, occurrenceStartsAt)
      );

      if (!match) {
        return { occurrenceStartsAt, state: "NOT_RECORDED", session: null };
      }

      return {
        occurrenceStartsAt,
        state: sessionState(match, now, sessionWindowConfig),
        session: {
          id: match.id,
          title: match.title,
          startTime: match.startTime,
          endTime: match.endTime,
          room: match.room,
          closeReason: match.closeReason,
          absencesSwept: match.absencesSweptAt !== null,
          attendanceCount: match._count.attendances,
        },
      };
    });

    return {
      lectureScheduleId,
      weeks,
      timeZone: this.timeZone,
      // Every state a past occurrence can be in, so the counts always sum to
      // `occurrences.length`. `upcoming` is unreachable in this projection —
      // only occurrences at or before `now` are enumerated, and only sessions
      // that started before `now` are fetched — but it is counted rather than
      // dropped so the sum stays a check on the classification rather than an
      // assumption about it.
      counts: {
        notRecorded: reports.filter((r) => r.state === "NOT_RECORDED").length,
        upcoming: reports.filter((r) => r.state === "UPCOMING").length,
        inProgress: reports.filter((r) => r.state === "IN_PROGRESS").length,
        pending: reports.filter((r) => r.state === "PENDING").length,
        recorded: reports.filter((r) => r.state === "RECORDED").length,
      },
      occurrences: reports,
    };
  }
}
