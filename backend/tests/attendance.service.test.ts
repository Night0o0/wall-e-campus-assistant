import { describe, expect, it } from "vitest";
import { AttendanceStatus, SessionStatus } from "@prisma/client";
import { AttendanceService } from "../src/services/attendance.service.js";
import { attendanceConfig } from "../src/config/attendance.config.js";
import { env } from "../src/config/env.js";
import { generateQrToken } from "../src/utils/qr.util.js";
import { punctuality } from "../src/utils/session-window.js";
import { AppError } from "../src/utils/AppError.js";
import { ORG_A, ORG_B } from "./helpers/device-fakes.js";
import {
  DEFAULT_PROFILE,
  SCAN_NOW,
  ScanAttendanceRepository,
  ScanProfileSeed,
  ScanSessionRepository,
  ScanSessionSeed,
  ScanStudentRepository,
  makeScanProjection,
  makeScanSession,
} from "./helpers/attendance-fakes.js";

/**
 * The scan path: F2 (an expired lecture is never scannable) and F3 (LATE).
 *
 * The seeded session opened at 10:30 for a two-hour lecture, so its window runs
 * to 12:30, and SCAN_NOW is 11:00 — half an hour in, and comfortably inside it.
 * Every time in this file is stated relative to those.
 */

const STUDENT = "student-1";

/**
 * The authenticated student. There is no other way to name the person being
 * recorded — the scan body carries a token and nothing else — so every test
 * below records `actor().id` and could not record anybody different if it tried.
 */
const actor = (organizationId = ORG_A) => ({ id: STUDENT, organizationId });

const build = (
  seed: ScanSessionSeed = {},
  profile: ScanProfileSeed | null = DEFAULT_PROFILE
) => {
  const session = makeScanSession(seed);
  const sessions = new ScanSessionRepository(
    [session],
    [makeScanProjection(seed)]
  );
  const attendances = new ScanAttendanceRepository();
  const students = new ScanStudentRepository(profile);
  const service = new AttendanceService(attendances, sessions, students);

  // A genuine token, signed with the session's own secret — the verification
  // inside scanAttendance is real, not stubbed.
  const token = generateQrToken(session.id, session.qrSecret);

  return { service, sessions, attendances, students, token, session };
};

const MINUTE = 60_000;

/* ------------------------------ F3: PRESENT vs LATE ---------------------- */

/**
 * The rule as arithmetic, independent of any repository. The boundary is the
 * point of these: `lateAfterMinutes` is inclusive of PRESENT.
 */
describe("punctuality", () => {
  const opened = new Date("2026-08-13T10:00:00.000Z");
  const after = (minutes: number) =>
    punctuality(opened, new Date(opened.getTime() + minutes * MINUTE), 15);

  it("is PRESENT for a scan at the moment attendance opened", () => {
    expect(after(0)).toBe("PRESENT");
  });

  it("is PRESENT well inside the threshold", () => {
    expect(after(14)).toBe("PRESENT");
  });

  it("is PRESENT exactly on the threshold", () => {
    // Stated explicitly because it is a decision, not an accident: arriving on
    // the fifteenth minute is arriving on the fifteenth minute, and rounding
    // against the student would be arbitrary in the one direction that costs
    // them something.
    expect(after(15)).toBe("PRESENT");
  });

  it("is LATE one millisecond past the threshold", () => {
    expect(
      punctuality(opened, new Date(opened.getTime() + 15 * MINUTE + 1), 15)
    ).toBe("LATE");
  });

  it("is LATE well past the threshold", () => {
    expect(after(40)).toBe("LATE");
  });

  it("honours a different configured threshold", () => {
    expect(punctuality(opened, new Date(opened.getTime() + 20 * MINUTE), 30)).toBe(
      "PRESENT"
    );
  });
});

describe("a scan records PRESENT or LATE", () => {
  it("records PRESENT inside the threshold", async () => {
    const { service, token, attendances } = build();

    // Opened at 10:30; scanning at 10:40 is ten minutes in.
    const at = new Date(SCAN_NOW.getTime() - 20 * MINUTE);

    const result = await service.scanAttendance(token, actor(), at);

    expect(result.attendance.status).toBe(AttendanceStatus.PRESENT);
    expect(attendances.rows).toHaveLength(1);
  });

  it("records LATE past the threshold", async () => {
    const { service, token } = build();

    // Opened at 10:30, scanned at 11:00 — thirty minutes, past the default 15.
    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(result.attendance.status).toBe(AttendanceStatus.LATE);
  });

  it("measures from when attendance opened, not from the timetable", async () => {
    // The lecture is timetabled 10:00–12:00 but the instructor opened at 10:30.
    // A student scanning at 10:35 is five minutes into attendance, not
    // thirty-five minutes into the lecture, and is PRESENT.
    const { service, token } = build();

    const result = await service.scanAttendance(
      token, actor(),
      new Date(SCAN_NOW.getTime() - 25 * MINUTE)
    );

    expect(result.attendance.status).toBe(AttendanceStatus.PRESENT);
  });

  it("still refuses a second scan by the same student", async () => {
    const { service, token } = build();

    await service.scanAttendance(token, actor(), SCAN_NOW);

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

/* --------------------- F2: the window is enforced on the write ----------- */

/**
 * The invariant: exactly one state may produce an attendance record, and
 * nothing about the attendance worker is consulted to decide it.
 */
describe("only an in-progress session is scannable", () => {
  it("allows a scan while the lecture is running", async () => {
    const { service, token, attendances } = build();

    await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(attendances.rows).toHaveLength(1);
  });

  it("rejects a scan after the lecture has ended", async () => {
    const { service, token, attendances } = build();

    // Opened 10:30, two-hour lecture → window closes 12:30. This is 12:31.
    const afterEnd = new Date(SCAN_NOW.getTime() + 91 * MINUTE);

    await expect(
      service.scanAttendance(token, actor(), afterEnd)
    ).rejects.toMatchObject({ statusCode: 409 });

    // And nothing was written. The rejection is not cosmetic.
    expect(attendances.rows).toHaveLength(0);
  });

  it("rejects a scan into a session that has not started", async () => {
    const { service, token } = build({ startTime: new Date(SCAN_NOW.getTime() + 60 * MINUTE) });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a scan into a closed session", async () => {
    const { service, token, attendances } = build({ status: SessionStatus.CLOSED });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(attendances.rows).toHaveLength(0);
  });

  it("tells the student which of the two it is", async () => {
    const { service, token } = build();

    const early = await service
      .scanAttendance(
        token, actor(),
        new Date(SCAN_NOW.getTime() - 60 * MINUTE)
      )
      .catch((error: AppError) => error);

    const late = await service
      .scanAttendance(token, actor(), new Date(SCAN_NOW.getTime() + 91 * MINUTE))
      .catch((error: AppError) => error);

    // Different situations a student can act on: turn up on time, or go and
    // talk to the instructor.
    expect((early as AppError).message).not.toBe((late as AppError).message);
    expect((late as AppError).message).toMatch(/ended/i);
  });

  /**
   * The point of F2. The worker closes expired sessions for the sake of the
   * record; it is NOT what stops them being scanned.
   */
  it("rejects an expired session with the attendance worker switched off", async () => {
    const original = env.ATTENDANCE_WORKER_ENABLED;

    (env as { ATTENDANCE_WORKER_ENABLED: boolean }).ATTENDANCE_WORKER_ENABLED =
      false;

    try {
      const { service, attendances, token } = build();

      await expect(
        service.scanAttendance(
          token, actor(),
          new Date(SCAN_NOW.getTime() + 91 * MINUTE)
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(attendances.rows).toHaveLength(0);
    } finally {
      (env as { ATTENDANCE_WORKER_ENABLED: boolean }).ATTENDANCE_WORKER_ENABLED =
        original;
    }
  });

  it("rejects a session the worker should have closed days ago and never did", async () => {
    // The unbounded-outage case: still ACTIVE, still unswept, days past its
    // lecture. No worker has run. It is still not scannable.
    const { service, attendances, token } = build({
        startTime: new Date(SCAN_NOW.getTime() - 4 * 24 * 60 * MINUTE),
      });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(attendances.rows).toHaveLength(0);
  });

  it("applies the default window to a session with no lecture behind it", async () => {
    const { service, token } = build({
        lectureSchedule: null,
        startTime: new Date(
          SCAN_NOW.getTime() - (attendanceConfig.defaultSessionMinutes + 1) * MINUTE
        ),
      });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

/* ----------------------------- Unchanged guarantees ---------------------- */

describe("the existing scan guarantees still hold", () => {
  it("refuses a session belonging to another university", async () => {
    const { service, token } = build();

    await expect(
      service.scanAttendance(token, actor(ORG_B), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses a token signed with the wrong secret", async () => {
    const { service, session } = build();

    const forged = generateQrToken(session.id, "not-the-session-secret");

    await expect(
      service.scanAttendance(forged, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a token naming a session that does not exist", async () => {
    const { service } = build();

    const orphan = generateQrToken("session-nope", "whatever");

    await expect(
      service.scanAttendance(orphan, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ------------- I7: who may read a roster and a set of statistics ----------- */

/**
 * These two reads previously checked the tenant and nothing else, while
 * `closeSession` demanded ownership — so one instructor could read a
 * colleague's attendance roster but not close their session. The rule applied
 * here is the one in utils/session-access.ts, shared with SessionService.
 */
describe("who may read a session's attendance", () => {
  const OWNER = { id: "instructor-1", role: "ADMIN", organizationId: ORG_A };
  const COLLEAGUE = { id: "instructor-2", role: "ADMIN", organizationId: ORG_A };
  const SUPER_ADMIN = {
    id: "admin-1",
    role: "UNIVERSITY_SUPER_ADMIN",
    organizationId: ORG_A,
  };
  const FOREIGN_ADMIN = {
    id: "admin-2",
    role: "UNIVERSITY_SUPER_ADMIN",
    organizationId: ORG_B,
  };

  // The seeded session is created by "instructor-1" — see makeScanSession.
  it("hides another instructor's roster and statistics behind a 404", async () => {
    const { service } = build();

    await expect(
      service.getSessionAttendance("session-1", COLLEAGUE)
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      service.getSessionStats("session-1", COLLEAGUE)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("gives the same 404 to another university, so neither can be told apart", async () => {
    const { service } = build();

    const foreign = await service
      .getSessionAttendance("session-1", FOREIGN_ADMIN)
      .catch((error: AppError) => error);

    const colleague = await service
      .getSessionAttendance("session-1", COLLEAGUE)
      .catch((error: AppError) => error);

    expect((foreign as AppError).statusCode).toBe(404);
    expect((foreign as AppError).message).toBe((colleague as AppError).message);
  });

  it("lets the owning instructor and any super admin read it", async () => {
    const { service, attendances } = build();

    attendances.rows.push({
      id: "attendance-1",
      studentId: STUDENT,
      sessionId: "session-1",
      scanTime: SCAN_NOW,
      status: AttendanceStatus.PRESENT,
    });

    for (const actor of [OWNER, SUPER_ADMIN]) {
      await expect(
        service.getSessionAttendance("session-1", actor)
      ).resolves.toHaveLength(1);
    }
  });

  it("keeps getSessionStats' meaning of 'total' — attended, not the roll", async () => {
    // The semantics every other attendanceCount in the API is now aligned to:
    // ABSENT is a row about somebody who was not there, so it belongs in `roll`
    // and never in the number called attendance.
    const { service, attendances } = build();

    attendances.rows.push(
      {
        id: "a1",
        studentId: "student-1",
        sessionId: "session-1",
        scanTime: SCAN_NOW,
        status: AttendanceStatus.PRESENT,
      },
      {
        id: "a2",
        studentId: "student-2",
        sessionId: "session-1",
        scanTime: SCAN_NOW,
        status: AttendanceStatus.LATE,
      },
      {
        id: "a3",
        studentId: "student-3",
        sessionId: "session-1",
        scanTime: SCAN_NOW,
        status: AttendanceStatus.ABSENT,
      }
    );

    await expect(service.getSessionStats("session-1", OWNER)).resolves.toEqual({
      total: 2,
      present: 1,
      late: 1,
      absent: 1,
      roll: 3,
    });
  });
});
