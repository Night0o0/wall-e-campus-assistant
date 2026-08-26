import { describe, expect, it } from "vitest";
import { AttendanceStatus, SessionCloseReason } from "@prisma/client";
import { AttendanceLifecycleService } from "../src/services/attendance-lifecycle.service.js";
import { attendanceConfig } from "../src/config/attendance.config.js";
import {
  isScannable,
  isStale,
  sessionState,
  sessionWindow,
} from "../src/utils/session-window.js";
import { AppError } from "../src/utils/AppError.js";
import { ORG_A, ORG_B } from "./helpers/device-fakes.js";
import {
  FakeScheduleRepository,
  makeSchedule,
} from "./helpers/schedule-fakes.js";
import {
  LifecycleAttendanceRepository,
  LifecycleSessionRepository,
  LifecycleStudentRepository,
  NOW,
  makeSessionRow,
} from "./helpers/lifecycle-fakes.js";

/**
 * Phase 2 — the attendance lifecycle.
 *
 * The seeded lecture runs 10:00–12:00, i.e. two hours, and the default grace is
 * thirty minutes. So a session that opened:
 *
 *   * 60 minutes ago  is OPEN     (the lecture is still running)
 *   * 150 minutes ago is PENDING  (over, inside the grace)
 *   * 200 minutes ago is STALE    (over, past the grace)
 *
 * Those three numbers are the whole clock arithmetic in this file.
 */

const CONFIG = {
  defaultSessionMinutes: attendanceConfig.defaultSessionMinutes,
  staleGraceMinutes: attendanceConfig.staleGraceMinutes,
};

const COHORT = [
  { userId: "student-1" },
  { userId: "student-2" },
  { userId: "student-3" },
];

const build = (
  sessions: LifecycleSessionRepository,
  options: {
    attendances?: LifecycleAttendanceRepository;
    cohort?: { userId: string; semester?: string; organizationId?: string }[];
    schedules?: FakeScheduleRepository;
  } = {}
) => {
  const attendances = options.attendances ?? new LifecycleAttendanceRepository();
  const students = new LifecycleStudentRepository(options.cohort ?? COHORT);
  const schedules = options.schedules ?? new FakeScheduleRepository([makeSchedule()]);

  const service = new AttendanceLifecycleService(
    sessions,
    attendances,
    schedules,
    students,
    "UTC"
  );

  return { service, sessions, attendances, students, schedules };
};

const absencesIn = (repo: LifecycleAttendanceRepository, sessionId: string) =>
  repo.rows.filter(
    (row) => row.sessionId === sessionId && row.status === AttendanceStatus.ABSENT
  );

/* ------------------------- The window, as arithmetic ---------------------- */

describe("session window", () => {
  it("takes its length from the lecture behind it", () => {
    const session = makeSessionRow({ startedMinutesAgo: 0 });
    const { endsAt, staleAt } = sessionWindow(session, CONFIG);

    // 10:00–12:00 is two hours, whatever the clock said when it opened.
    expect(endsAt.getTime() - session.startTime.getTime()).toBe(120 * 60_000);
    expect(staleAt.getTime() - endsAt.getTime()).toBe(
      attendanceConfig.staleGraceMinutes * 60_000
    );
  });

  it("falls back to the configured default with no lecture behind it", () => {
    const session = makeSessionRow({ lectureSchedule: null });
    const { endsAt } = sessionWindow(session, CONFIG);

    expect(endsAt.getTime() - session.startTime.getTime()).toBe(
      attendanceConfig.defaultSessionMinutes * 60_000
    );
  });

  it("measures from when attendance opened, not from the timetable", () => {
    // The window is a duration from the session's own start, not a wall-clock
    // slot. An instructor who opens forty minutes late gets a window that ends
    // forty minutes late, and their students are not penalised for the delay —
    // which is what these two boundaries, either side of the lecture's own
    // two hours, actually assert.
    expect(
      sessionState(makeSessionRow({ startedMinutesAgo: 119 }), NOW, CONFIG)
    ).toBe("IN_PROGRESS");

    expect(
      sessionState(makeSessionRow({ startedMinutesAgo: 121 }), NOW, CONFIG)
    ).toBe("PENDING");
  });

  it("is UPCOMING before its own start", () => {
    // Not reachable through the API today — startTime defaults to the moment a
    // session is opened — but `startTime` is a writable column, and treating
    // "not yet" as "now" is one seed script away from letting somebody scan
    // into a lecture that has not begun.
    const future = makeSessionRow({ startedMinutesAgo: -40 });

    expect(sessionState(future, NOW, CONFIG)).toBe("UPCOMING");
    expect(isScannable(future, NOW, CONFIG)).toBe(false);
  });

  it("is scannable in exactly one state", () => {
    const states = [
      { session: makeSessionRow({ startedMinutesAgo: -40 }), scannable: false },
      { session: makeSessionRow({ startedMinutesAgo: 30 }), scannable: true },
      { session: makeSessionRow({ startedMinutesAgo: 150 }), scannable: false },
      { session: makeSessionRow({ startedMinutesAgo: 200 }), scannable: false },
      {
        session: makeSessionRow({ status: "CLOSED", startedMinutesAgo: 30 }),
        scannable: false,
      },
    ];

    for (const { session, scannable } of states) {
      expect(isScannable(session, NOW, CONFIG)).toBe(scannable);
    }
  });
});

/* ---------------------------- The three states ---------------------------- */

/**
 * The heart of the matter: NOT_RECORDED, PENDING and ABSENT are three different
 * kinds of claim, and the code makes them three different kinds of thing.
 */
describe("NOT_RECORDED vs PENDING vs ABSENT are structurally distinct", () => {
  it("NOT_RECORDED: an occurrence with no session at all", async () => {
    // No session rows whatsoever — the lecture happened, nobody opened
    // attendance. There is no row anywhere that could carry this state.
    const { service } = build(new LifecycleSessionRepository([]));

    const log = await service.occurrenceStates(
      "schedule-1",
      { id: "instructor-1", role: "INSTRUCTOR", organizationId: ORG_A },
      { weeks: 2, now: NOW }
    );

    expect(log.occurrences.length).toBeGreaterThan(0);
    expect(log.occurrences.every((o) => o.state === "NOT_RECORDED")).toBe(true);
    expect(log.occurrences.every((o) => o.session === null)).toBe(true);
    expect(log.counts.notRecorded).toBe(log.occurrences.length);
  });

  it("PENDING: an ACTIVE session whose lecture has ended", () => {
    const session = makeSessionRow({ startedMinutesAgo: 150 });

    expect(sessionState(session, NOW, CONFIG)).toBe("PENDING");
    // Over, but not yet stale: the grace has not run out.
    expect(isStale(session, NOW, CONFIG)).toBe(false);
  });

  it("PENDING is not ABSENT: an open session yields no absence rows", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "pending", startedMinutesAgo: 150 }),
    ]);

    const { service, attendances } = build(sessions);

    await service.sweepAbsences(NOW);

    // Nobody has been marked absent from a lecture they can still scan into.
    expect(attendances.rows).toHaveLength(0);
    expect(sessions.rows.get("pending")!.absencesSweptAt).toBeNull();
  });

  it("ABSENT: a row about a named person, and only after a close", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions);

    await service.sweepAbsences(NOW);

    expect(absencesIn(attendances, "closed").map((row) => row.studentId).sort()).toEqual(
      ["student-1", "student-2", "student-3"]
    );
  });

  it("ABSENT can only exist after an opened session has been closed", async () => {
    // Every state an open session can be in, swept. None may produce an absence.
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "open", startedMinutesAgo: 30 }),
      makeSessionRow({ id: "pending", startedMinutesAgo: 150 }),
      makeSessionRow({ id: "stale-but-open", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions);

    await service.sweepAbsences(NOW);

    expect(attendances.rows).toHaveLength(0);
  });
});

/* -------------------------- Stale automatic closure ----------------------- */

describe("stale sessions are closed automatically", () => {
  it("closes one past the grace period and records AUTO_STALE", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "stale", startedMinutesAgo: 200 }),
    ]);

    const { service } = build(sessions);

    const result = await service.closeStaleSessions(NOW);

    expect(result.closed).toBe(1);

    const row = sessions.rows.get("stale")!;
    expect(row.status).toBe("CLOSED");
    expect(row.closeReason).toBe(SessionCloseReason.AUTO_STALE);
  });

  it("leaves a PENDING session alone until its grace runs out", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "pending", startedMinutesAgo: 150 }),
    ]);

    const { service } = build(sessions);

    expect((await service.closeStaleSessions(NOW)).closed).toBe(0);
    expect(sessions.rows.get("pending")!.status).toBe("ACTIVE");
  });

  it("leaves a running lecture alone", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "open", startedMinutesAgo: 30 }),
    ]);

    const { service } = build(sessions);

    expect((await service.closeStaleSessions(NOW)).closed).toBe(0);
  });

  it("stamps endTime with the lecture's end, not the moment it was noticed", async () => {
    // A worker down overnight must not claim attendance was open all night.
    const session = makeSessionRow({ id: "stale", startedMinutesAgo: 900 });
    const sessions = new LifecycleSessionRepository([session]);

    const { service } = build(sessions);

    await service.closeStaleSessions(NOW);

    expect(sessions.rows.get("stale")!.endTime).toEqual(
      sessionWindow(session, CONFIG).endsAt
    );
  });

  it("is idempotent: a second pass closes nothing and changes nothing", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "stale", startedMinutesAgo: 200 }),
    ]);

    const { service } = build(sessions);

    await service.closeStaleSessions(NOW);
    const after = { ...sessions.rows.get("stale")! };

    const second = await service.closeStaleSessions(new Date(NOW.getTime() + 60_000));

    expect(second.closed).toBe(0);
    expect(sessions.rows.get("stale")).toEqual(after);
  });

  it("does not overwrite a MANUAL close with AUTO_STALE", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({
        id: "manual",
        status: "CLOSED",
        startedMinutesAgo: 900,
        closeReason: SessionCloseReason.MANUAL,
      }),
    ]);

    const { service } = build(sessions);

    await service.closeStaleSessions(NOW);

    expect(sessions.rows.get("manual")!.closeReason).toBe(
      SessionCloseReason.MANUAL
    );
  });
});

/* ------------------------------ The full pass ----------------------------- */

describe("runSweep: auto-close, then call the roll", () => {
  it("closes a stale session AND writes its absences in one pass", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "stale", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions);

    const { stale, absences } = await service.runSweep(NOW);

    // The ordering guarantee: the roll is called on a session this same pass
    // closed, not on the next one.
    expect(stale.closed).toBe(1);
    expect(absences.swept).toBe(1);

    const row = sessions.rows.get("stale")!;
    expect(row.closeReason).toBe(SessionCloseReason.AUTO_STALE);
    expect(row.absencesSweptAt).not.toBeNull();
    expect(absencesIn(attendances, "stale")).toHaveLength(3);
  });

  it("is idempotent end to end", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "stale", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions);

    await service.runSweep(NOW);

    const snapshot = {
      session: { ...sessions.rows.get("stale")! },
      rows: attendances.rows.map((row) => ({ ...row })),
    };

    const second = await service.runSweep(new Date(NOW.getTime() + 5 * 60_000));
    const third = await service.runSweep(new Date(NOW.getTime() + 10 * 60_000));

    expect(second.stale.closed).toBe(0);
    expect(second.absences.absencesCreated).toBe(0);
    expect(third.absences.swept).toBe(0);

    expect(sessions.rows.get("stale")).toEqual(snapshot.session);
    expect(attendances.rows).toEqual(snapshot.rows);
  });
});

/* ----------------------------- The absence sweep -------------------------- */

describe("the absence sweep", () => {
  it("marks only the students who did not scan", async () => {
    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-2",
        sessionId: "closed",
        status: AttendanceStatus.PRESENT,
        scanTime: NOW,
      },
    ]);

    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service } = build(sessions, { attendances });

    await service.sweepAbsences(NOW);

    expect(absencesIn(attendances, "closed").map((r) => r.studentId).sort()).toEqual(
      ["student-1", "student-3"]
    );
  });

  it("preserves historical attendance exactly as it was", async () => {
    const present = {
      studentId: "student-2",
      sessionId: "closed",
      status: AttendanceStatus.PRESENT,
      scanTime: new Date("2026-08-13T10:05:00.000Z"),
    };

    const late = {
      studentId: "student-3",
      sessionId: "closed",
      status: AttendanceStatus.LATE,
      scanTime: new Date("2026-08-13T10:40:00.000Z"),
    };

    const attendances = new LifecycleAttendanceRepository([
      { ...present },
      { ...late },
    ]);

    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service } = build(sessions, { attendances });

    await service.runSweep(NOW);
    await service.runSweep(new Date(NOW.getTime() + 60_000));

    // Untouched: not restatused, not restamped, not removed. An absence never
    // wins against evidence that somebody was there.
    expect(attendances.rows).toContainEqual(present);
    expect(attendances.rows).toContainEqual(late);
  });

  it("creates no duplicate row for a student who already has one", async () => {
    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-1",
        sessionId: "closed",
        status: AttendanceStatus.ABSENT,
        scanTime: NOW,
      },
    ]);

    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service } = build(sessions, { attendances });

    await service.sweepAbsences(NOW);

    const forStudentOne = attendances.rows.filter(
      (row) => row.sessionId === "closed" && row.studentId === "student-1"
    );

    expect(forStudentOne).toHaveLength(1);
  });

  it("is idempotent even if the swept marker is the only thing stopping it", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions);

    const first = await service.sweepAbsences(NOW);
    const second = await service.sweepAbsences(NOW);

    expect(first.absencesCreated).toBe(3);
    expect(second.examined).toBe(0);
    expect(second.absencesCreated).toBe(0);
    expect(attendances.rows).toHaveLength(3);
  });

  it("does not mark absent a student whose semester does not match", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions, {
      cohort: [
        { userId: "student-1", semester: "First Semester" },
        // Same faculty, department, level and section, wrong term.
        { userId: "student-spring", semester: "Spring" },
        // And a profile nobody can read: not evidence of skipping a lecture.
        { userId: "student-unreadable", semester: "2026" },
      ],
    });

    await service.sweepAbsences(NOW);

    expect(absencesIn(attendances, "closed").map((r) => r.studentId)).toEqual([
      "student-1",
    ]);
  });

  it("never reaches into another university's cohort", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({ id: "closed", status: "CLOSED", startedMinutesAgo: 200 }),
    ]);

    const { service, attendances } = build(sessions, {
      cohort: [
        { userId: "ours", organizationId: ORG_A },
        { userId: "theirs", organizationId: ORG_B },
      ],
    });

    await service.sweepAbsences(NOW);

    expect(absencesIn(attendances, "closed").map((r) => r.studentId)).toEqual([
      "ours",
    ]);
  });

  it("marks an ad-hoc session swept without inventing absences for it", async () => {
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({
        id: "ad-hoc",
        status: "CLOSED",
        startedMinutesAgo: 200,
        lectureSchedule: null,
      }),
    ]);

    const { service, attendances } = build(sessions);

    const result = await service.sweepAbsences(NOW);

    // No cohort to call, so no absence is derivable. Reported separately rather
    // than folded into `swept`, so "nobody was absent" and "there was no roll
    // to call" do not read the same in the worker log.
    expect(result.unlinked).toBe(1);
    expect(attendances.rows).toHaveLength(0);
    expect(sessions.rows.get("ad-hoc")!.absencesSweptAt).not.toBeNull();
  });
});

/* --------------------------- The occurrence log --------------------------- */

describe("the attendance log distinguishes all four states", () => {
  const instructor = {
    id: "instructor-1",
    role: "INSTRUCTOR",
    organizationId: ORG_A,
  };

  it("reports a closed occurrence as RECORDED with its close reason", async () => {
    // Sunday 10:00 UTC, one week before NOW (a Thursday).
    const lastSunday = new Date("2026-08-09T10:00:00.000Z");

    const sessions = new LifecycleSessionRepository([
      makeSessionRow({
        id: "done",
        status: "CLOSED",
        startTime: lastSunday,
        endTime: new Date("2026-08-09T12:00:00.000Z"),
        closeReason: SessionCloseReason.AUTO_STALE,
        absencesSweptAt: new Date("2026-08-09T12:30:00.000Z"),
      }),
    ]);

    const { service } = build(sessions);

    const log = await service.occurrenceStates("schedule-1", instructor, {
      weeks: 2,
      now: NOW,
    });

    const recorded = log.occurrences.filter((o) => o.state === "RECORDED");

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.session).toMatchObject({
      id: "done",
      closeReason: SessionCloseReason.AUTO_STALE,
      absencesSwept: true,
    });

    // And every other occurrence in the window is NOT_RECORDED, which is the
    // whole point: one lecture taken, the rest never recorded at all.
    expect(log.counts.notRecorded).toBe(log.occurrences.length - 1);
  });

  it("refuses another university's schedule exactly as a missing one", async () => {
    const { service } = build(new LifecycleSessionRepository([]), {
      schedules: new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", organizationId: ORG_B }),
      ]),
    });

    const foreign = await service
      .occurrenceStates("schedule-1", instructor, { now: NOW })
      .catch((error: AppError) => error);

    const missing = await service
      .occurrenceStates("schedule-nope", instructor, { now: NOW })
      .catch((error: AppError) => error);

    expect((foreign as AppError).statusCode).toBe(404);
    expect((foreign as AppError).message).toBe((missing as AppError).message);
  });

  it("refuses an instructor reading somebody else's lecture", async () => {
    const { service } = build(new LifecycleSessionRepository([]));

    await expect(
      service.occurrenceStates(
        "schedule-1",
        { id: "instructor-2", role: "INSTRUCTOR", organizationId: ORG_A },
        { now: NOW }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not report a lecture that has not happened yet as unrecorded", async () => {
    const { service } = build(new LifecycleSessionRepository([]));

    const log = await service.occurrenceStates("schedule-1", instructor, {
      weeks: 1,
      now: NOW,
    });

    // "Not yet" is not "not recorded".
    for (const occurrence of log.occurrences) {
      expect(occurrence.occurrenceStartsAt.getTime()).toBeLessThanOrEqual(
        NOW.getTime()
      );
    }
  });
});

/* ------- B1: a duplicate session must not manufacture an absence ---------- */

/**
 * The other half of the duplicate-session fix.
 *
 * SessionService refuses to open a second session for one occurrence, but that
 * check is a read followed by a write, so two simultaneous requests can still
 * both pass it — and any duplicate already in the database predates the guard
 * entirely. These tests are about what the sweep does when a duplicate exists
 * anyway: the roll is called on each session separately, `alreadyRecorded` is
 * scoped to one of them, and without a sibling check the student who scanned
 * into the first gets an ABSENT written about them for the second.
 *
 * The unique constraint on Attendance cannot prevent this. [studentId,
 * sessionId] is satisfied perfectly well by two different sessions.
 */
describe("calling the roll when one occurrence has two sessions", () => {
  const HOUR_MS = 60 * 60 * 1000;

  /** Two sessions of the same lecture, opened an hour apart, both closed. */
  const duplicatePair = () =>
    new LifecycleSessionRepository([
      makeSessionRow({
        id: "session-first",
        status: "CLOSED",
        startedMinutesAgo: 200,
        endTime: NOW,
      }),
      makeSessionRow({
        id: "session-duplicate",
        status: "CLOSED",
        startedMinutesAgo: 140,
        endTime: NOW,
      }),
    ]);

  it("does not mark a student absent from the duplicate they did not scan into", async () => {
    const attendances = new LifecycleAttendanceRepository([
      // student-1 turned up, and scanned the code that was on screen — which
      // was the first session's.
      {
        studentId: "student-1",
        sessionId: "session-first",
        status: AttendanceStatus.PRESENT,
        scanTime: NOW,
      },
    ]);

    const { service } = build(duplicatePair(), { attendances });

    await service.sweepAbsences(NOW);

    // The regression: student-1 has no row on session-duplicate, so a
    // per-session roll would write them an ABSENT for a lecture they attended.
    expect(
      attendances.rows.filter(
        (row) =>
          row.studentId === "student-1" && row.status === AttendanceStatus.ABSENT
      )
    ).toHaveLength(0);

    // Everybody who genuinely did not turn up is still marked absent, on both.
    for (const sessionId of ["session-first", "session-duplicate"]) {
      expect(absencesIn(attendances, sessionId).map((row) => row.studentId).sort())
        .toEqual(["student-2", "student-3"]);
    }
  });

  it("counts a LATE scan on the sibling as evidence too", async () => {
    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-1",
        sessionId: "session-first",
        status: AttendanceStatus.LATE,
        scanTime: NOW,
      },
    ]);

    const { service } = build(duplicatePair(), { attendances });

    await service.sweepAbsences(NOW);

    expect(
      attendances.rows.some(
        (row) =>
          row.studentId === "student-1" && row.status === AttendanceStatus.ABSENT
      )
    ).toBe(false);
  });

  it("does not let an ABSENT row on the sibling suppress an absence", async () => {
    // An ABSENT on another session is not evidence that somebody attended. If
    // it suppressed the second absence, the fix would have quietly turned into
    // "the first roll wins", which is a different and wrong rule.
    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-2",
        sessionId: "session-first",
        status: AttendanceStatus.ABSENT,
        scanTime: NOW,
      },
    ]);

    const { service } = build(duplicatePair(), { attendances });

    await service.sweepAbsences(NOW);

    expect(
      absencesIn(attendances, "session-duplicate").map((row) => row.studentId)
    ).toContain("student-2");
  });

  it("does not reach across to a different week's session", async () => {
    // The sibling window is ±12h, which for a weekly slot cannot contain
    // another occurrence. A scan last week must not excuse an absence today.
    const sessions = new LifecycleSessionRepository([
      makeSessionRow({
        id: "session-last-week",
        status: "CLOSED",
        startTime: new Date(NOW.getTime() - 7 * 24 * HOUR_MS),
        endTime: new Date(NOW.getTime() - 7 * 24 * HOUR_MS),
        absencesSweptAt: NOW,
      }),
      makeSessionRow({
        id: "session-today",
        status: "CLOSED",
        startedMinutesAgo: 200,
        endTime: NOW,
      }),
    ]);

    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-1",
        sessionId: "session-last-week",
        status: AttendanceStatus.PRESENT,
        scanTime: new Date(NOW.getTime() - 7 * 24 * HOUR_MS),
      },
    ]);

    const { service } = build(sessions, { attendances });

    await service.sweepAbsences(NOW);

    expect(
      absencesIn(attendances, "session-today").map((row) => row.studentId).sort()
    ).toEqual(["student-1", "student-2", "student-3"]);
  });

  it("stays idempotent across repeated passes", async () => {
    const attendances = new LifecycleAttendanceRepository([
      {
        studentId: "student-1",
        sessionId: "session-first",
        status: AttendanceStatus.PRESENT,
        scanTime: NOW,
      },
    ]);

    const { service } = build(duplicatePair(), { attendances });

    await service.sweepAbsences(NOW);
    const afterFirstPass = attendances.rows.length;
    await service.sweepAbsences(NOW);

    expect(attendances.rows).toHaveLength(afterFirstPass);
  });
});
