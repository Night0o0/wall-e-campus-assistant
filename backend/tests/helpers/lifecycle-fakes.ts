import { AttendanceStatus, SessionCloseReason, SessionStatus } from "@prisma/client";
import { AttendanceRepository } from "../../src/repositories/attendance.repository.js";
import { SessionRepository } from "../../src/repositories/session.repository.js";
import { StudentRepository } from "../../src/repositories/student.repository.js";
import { ORG_A } from "./device-fakes.js";

/**
 * In-memory stand-ins for the attendance lifecycle.
 *
 * The point of these doubles is that they model the *constraints*, not just the
 * data. The unique constraint on [studentId, sessionId], the conditional close
 * on `status = ACTIVE` and the conditional mark on `absencesSweptAt IS NULL`
 * are all reimplemented here, because those three things are exactly what the
 * idempotency claims rest on — a fake that ignored them would let a service
 * with no idempotency at all pass every test below.
 */

let sequence = 0;

export interface SessionSeed {
  id?: string;
  organizationId?: string;
  title?: string;
  status?: "ACTIVE" | "CLOSED";
  /** Minutes before "now" that attendance opened. */
  startedMinutesAgo?: number;
  startTime?: Date;
  endTime?: Date | null;
  room?: string | null;
  closeReason?: SessionCloseReason | null;
  absencesSweptAt?: Date | null;
  /** Null models an ad-hoc session with no timetable entry behind it. */
  lectureSchedule?: {
    id?: string;
    organizationId?: string;
    faculty?: string;
    department?: string;
    level?: number;
    semester?: number;
    section?: string;
    startTime?: string;
    endTime?: string;
  } | null;
}

export interface StoredSession {
  id: string;
  organizationId: string;
  title: string;
  status: "ACTIVE" | "CLOSED";
  startTime: Date;
  endTime: Date | null;
  room: string | null;
  closeReason: SessionCloseReason | null;
  absencesSweptAt: Date | null;
  lectureScheduleId: string | null;
  lectureSchedule: {
    id: string;
    organizationId: string;
    faculty: string;
    department: string;
    level: number;
    semester: number;
    section: string;
    startTime: string;
    endTime: string;
  } | null;
}

export const NOW = new Date("2026-08-13T12:00:00.000Z");

const MINUTE_MS = 60_000;

export const makeSessionRow = (
  seed: SessionSeed = {},
  now: Date = NOW
): StoredSession => {
  const schedule =
    seed.lectureSchedule === null
      ? null
      : {
          id: seed.lectureSchedule?.id ?? "schedule-1",
          organizationId: seed.lectureSchedule?.organizationId ?? ORG_A,
          faculty: seed.lectureSchedule?.faculty ?? "Engineering",
          department: seed.lectureSchedule?.department ?? "Mechatronics",
          level: seed.lectureSchedule?.level ?? 2,
          semester: seed.lectureSchedule?.semester ?? 1,
          section: seed.lectureSchedule?.section ?? "A",
          // Two hours, so "started 150 minutes ago" is 30 minutes past the end.
          startTime: seed.lectureSchedule?.startTime ?? "10:00",
          endTime: seed.lectureSchedule?.endTime ?? "12:00",
        };

  const startTime =
    seed.startTime ??
    new Date(now.getTime() - (seed.startedMinutesAgo ?? 0) * MINUTE_MS);

  return {
    id: seed.id ?? `session-${(sequence += 1)}`,
    organizationId: seed.organizationId ?? ORG_A,
    title: seed.title ?? "Electronics",
    status: seed.status ?? "ACTIVE",
    startTime,
    endTime: seed.endTime ?? null,
    room: seed.room === undefined ? "B-204" : seed.room,
    closeReason: seed.closeReason ?? null,
    absencesSweptAt: seed.absencesSweptAt ?? null,
    lectureScheduleId: schedule?.id ?? null,
    lectureSchedule: schedule,
  };
};

export class LifecycleSessionRepository extends SessionRepository {
  readonly rows = new Map<string, StoredSession>();

  constructor(seed: StoredSession[] = []) {
    super();

    for (const row of seed) {
      this.rows.set(row.id, row);
    }
  }

  override async findOpenForStaleCheck(limit: number) {
    return [...this.rows.values()]
      .filter((row) => row.status === "ACTIVE")
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        startTime: row.startTime,
        status: row.status,
        lectureSchedule: row.lectureSchedule
          ? {
              startTime: row.lectureSchedule.startTime,
              endTime: row.lectureSchedule.endTime,
            }
          : null,
      }));
  }

  /** The conditional update, modelled. A closed session cannot close again. */
  override async closeIfOpen(
    id: string,
    endTime: Date,
    reason: SessionCloseReason
  ) {
    const row = this.rows.get(id);

    if (!row || row.status !== "ACTIVE") {
      return false;
    }

    this.rows.set(id, { ...row, status: "CLOSED", endTime, closeReason: reason });

    return true;
  }

  override async findClosedAwaitingSweep(limit: number) {
    return [...this.rows.values()]
      .filter((row) => row.status === "CLOSED" && row.absencesSweptAt === null)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        lectureScheduleId: row.lectureScheduleId,
        // The anchor the sibling-session lookup measures from.
        startTime: row.startTime,
        lectureSchedule: row.lectureSchedule
          ? {
              id: row.lectureSchedule.id,
              organizationId: row.lectureSchedule.organizationId,
              faculty: row.lectureSchedule.faculty,
              department: row.lectureSchedule.department,
              level: row.lectureSchedule.level,
              semester: row.lectureSchedule.semester,
              section: row.lectureSchedule.section,
            }
          : null,
      }));
  }

  /** Guarded on the column still being null, exactly like the real one. */
  override async markAbsencesSwept(id: string, at: Date) {
    const row = this.rows.get(id);

    if (!row || row.absencesSweptAt !== null) {
      return false;
    }

    this.rows.set(id, { ...row, absencesSweptAt: at });

    return true;
  }

  override async findByScheduleBetween(
    lectureScheduleId: string,
    organizationId: string,
    from: Date,
    to: Date
  ) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.lectureScheduleId === lectureScheduleId &&
          row.organizationId === organizationId &&
          row.startTime >= from &&
          row.startTime < to
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        startTime: row.startTime,
        endTime: row.endTime,
        room: row.room,
        closeReason: row.closeReason,
        absencesSweptAt: row.absencesSweptAt,
        lectureSchedule: row.lectureSchedule
          ? {
              startTime: row.lectureSchedule.startTime,
              endTime: row.lectureSchedule.endTime,
            }
          : null,
        _count: { attendances: 0 },
      }));
  }

  /**
   * The sibling lookup, reimplemented against the same three predicates the
   * real query uses. Stubbing it to nothing would let the duplicate-session
   * absence tests pass against a sweep that never looked for siblings.
   */
  override async findOpenedForScheduleBetween(
    lectureScheduleId: string,
    organizationId: string,
    from: Date,
    to: Date
  ) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.lectureScheduleId === lectureScheduleId &&
          row.organizationId === organizationId &&
          row.startTime >= from &&
          row.startTime < to
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as SessionStatus,
        startTime: row.startTime,
      }));
  }
}

export interface AttendanceRow {
  studentId: string;
  sessionId: string;
  status: AttendanceStatus;
  scanTime: Date;
}

export class LifecycleAttendanceRepository extends AttendanceRepository {
  readonly rows: AttendanceRow[] = [];

  constructor(seed: AttendanceRow[] = []) {
    super();
    this.rows.push(...seed);
  }

  override async findStudentIdsBySession(sessionId: string) {
    return new Set(
      this.rows
        .filter((row) => row.sessionId === sessionId)
        .map((row) => row.studentId)
    );
  }

  /**
   * PRESENT and LATE only — the ABSENT exclusion is the behaviour under test,
   * so it is modelled here rather than assumed. An ABSENT row on a sibling
   * session is not evidence that anybody attended.
   */
  override async findAttendedStudentIdsBySessions(sessionIds: string[]) {
    return new Set(
      this.rows
        .filter(
          (row) =>
            sessionIds.includes(row.sessionId) &&
            row.status !== AttendanceStatus.ABSENT
        )
        .map((row) => row.studentId)
    );
  }

  /**
   * The unique constraint, modelled. An insert for a student who already has a
   * row for this session is skipped and — crucially — does not overwrite it.
   */
  override async createAbsences(
    sessionId: string,
    studentIds: string[],
    at: Date
  ) {
    let created = 0;

    for (const studentId of studentIds) {
      const exists = this.rows.some(
        (row) => row.sessionId === sessionId && row.studentId === studentId
      );

      if (exists) {
        continue;
      }

      this.rows.push({
        studentId,
        sessionId,
        status: AttendanceStatus.ABSENT,
        scanTime: at,
      });

      created += 1;
    }

    return created;
  }
}

export interface CohortMember {
  userId: string;
  /** Free text, as StudentProfile stores it. */
  semester?: string;
  organizationId?: string;
  faculty?: string;
  department?: string;
  level?: number;
  section?: string;
}

export class LifecycleStudentRepository extends StudentRepository {
  constructor(private readonly members: CohortMember[] = []) {
    super();
  }

  /**
   * Matches on the same keys the real query does, case-insensitively, and
   * deliberately does NOT filter on semester — the real repository cannot,
   * because a profile stores free text and a schedule stores 1 or 2. That
   * filtering is the service's job, and a fake that did it here would hide a
   * service that had forgotten to.
   */
  override async findCohort(criteria: {
    organizationId: string;
    faculty: string;
    department: string;
    level: number;
    section: string;
  }) {
    const same = (a: string, b: string) =>
      a.trim().toLowerCase() === b.trim().toLowerCase();

    return this.members
      .filter(
        (member) =>
          (member.organizationId ?? ORG_A) === criteria.organizationId &&
          same(member.faculty ?? "Engineering", criteria.faculty) &&
          same(member.department ?? "Mechatronics", criteria.department) &&
          same(member.section ?? "A", criteria.section) &&
          (member.level ?? 2) === criteria.level
      )
      .map((member) => ({
        semester: member.semester ?? "First Semester",
        user: {
          id: member.userId,
          organizationId: member.organizationId ?? ORG_A,
        },
      }));
  }
}
