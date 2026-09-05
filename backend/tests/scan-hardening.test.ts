import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { AttendanceStatus, SessionStatus } from "@prisma/client";
import { AttendanceService } from "../src/services/attendance.service.js";
import { env } from "../src/config/env.js";
import { SCAN_ERROR_CODES } from "../src/types/scan.types.js";
import { generateQrToken } from "../src/utils/qr.util.js";
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
 * Phase 3 — scan hardening.
 *
 * Three properties, worth naming separately because they fail in different
 * ways:
 *
 *   * the person recorded is the authenticated caller and cannot be anybody
 *     else, because there is no parameter that names a student;
 *   * a code is refused unless the session behind it is genuinely scannable,
 *     genuinely this university's, and genuinely this student's lecture;
 *   * every refusal carries a stable code, because a client cannot branch on a
 *     409 that means four different things, nor on prose that will be reworded
 *     and eventually translated.
 *
 * The seeded session opened at 10:30 for a two-hour lecture, and SCAN_NOW is
 * 11:00 — half an hour in, so a default scan is LATE against the 15-minute
 * threshold and comfortably inside the window.
 */

const STUDENT = "student-1";
const MINUTE = 60_000;

/**
 * The authenticated student. There is no other way to name the person being
 * recorded — the scan body carries a token and nothing else — so every test
 * here records `actor().id` and could not record anybody different if it tried.
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

/** A correctly signed token that is simply older than the 30-second rotation. */
const expiredTokenFor = (session: { id: string; qrSecret: string }) =>
  jwt.sign(
    { sessionId: session.id, iat: Math.floor(Date.now() / 1000) - 31 },
    session.qrSecret + env.JWT_SECRET,
    { expiresIn: "30s" }
  );

const otherCohort = { section: "B" };

/* --------------------------- Cohort authorization ------------------------- */

describe("cohort authorization on scan", () => {
  it("accepts a student the lecture is addressed to", async () => {
    const { service, token, attendances } = build();

    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(result.attendance.studentId).toBe(STUDENT);
    expect(attendances.rows).toHaveLength(1);
  });

  it("refuses a student from another section of the same course", async () => {
    // The session is section B's; the student's profile says section A. Same
    // university, same course, same room — and not their lecture.
    const { service, token, attendances } = build({ cohort: otherCohort });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 403, code: "NOT_IN_COHORT" });

    expect(attendances.rows).toHaveLength(0);
  });

  it("refuses on any one of the five academic fields differing", async () => {
    const mismatches = [
      { faculty: "Medicine" },
      { department: "Civil" },
      { level: 3 },
      { semester: 2 },
      { section: "C" },
    ];

    for (const cohort of mismatches) {
      const { service, token } = build({ cohort });

      await expect(
        service.scanAttendance(token, actor(), SCAN_NOW),
        `a differing ${Object.keys(cohort)[0]} must refuse the scan`
      ).rejects.toMatchObject({ code: "NOT_IN_COHORT" });
    }
  });

  it("matches free-text fields case-insensitively, as the timetable does", async () => {
    // Whoever typed "engineering" into a profile and "Engineering" into the
    // timetable meant the same faculty. A scan must not turn that into a
    // refusal, and then an absence.
    const { service, token } = build(
      {
        cohort: {
          faculty: "ENGINEERING",
          department: "mechatronics",
          section: "a",
        },
      },
      {
        ...DEFAULT_PROFILE,
        faculty: "engineering",
        department: "Mechatronics",
        section: "A",
      }
    );

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).resolves.toMatchObject({
      attendance: { status: AttendanceStatus.LATE },
    });
  });

  it("reads the semester through the same parser the timetable uses", async () => {
    // A profile stores free text; a schedule stores 1 or 2. These all mean the
    // first semester and must all scan.
    for (const semester of ["First Semester", "Semester 1", "1", "s1"]) {
      const { service, token } = build({}, { ...DEFAULT_PROFILE, semester });

      await expect(
        service.scanAttendance(token, actor(), SCAN_NOW),
        `"${semester}" must resolve to semester 1`
      ).resolves.toBeDefined();
    }
  });

  it("refuses a student whose profile cannot place them in any cohort", async () => {
    // Refusing is the only safe answer. Recording attendance for somebody who
    // cannot be placed would put a row against a lecture their timetable may
    // never have shown them.
    const { service, token, attendances } = build(
      {},
      { ...DEFAULT_PROFILE, section: null }
    );

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 400, code: "PROFILE_INCOMPLETE" });

    expect(attendances.rows).toHaveLength(0);
  });

  it("names the missing fields so the student can fix them", async () => {
    const { service, token } = build(
      {},
      { ...DEFAULT_PROFILE, section: null, level: null }
    );

    const error = await service
      .scanAttendance(token, actor(), SCAN_NOW)
      .catch((raised: AppError) => raised);

    expect((error as AppError).details).toMatchObject({
      missingFields: expect.arrayContaining(["level", "section"]),
    });
  });

  it("refuses a student with no profile row at all", async () => {
    const { service, token } = build({}, null);

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
  });

  it("refuses when the semester text cannot be read", async () => {
    // "2026" is a year, not a semester. Guessing would place the student in a
    // cohort they may not be in, and the sweep would then mark them absent
    // from its lectures.
    const { service, token } = build(
      {},
      { ...DEFAULT_PROFILE, semester: "2026" }
    );

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
  });

  it("never reads a cohort from anything the student could send", async () => {
    // The proof is structural: scanAttendance takes a token and an actor, and
    // the actor is {id, organizationId}. There is no faculty, department,
    // level, semester, section, courseId or organizationId parameter, so a
    // student in section A cannot claim section B's lecture. Handing the
    // service a forged cohort changes nothing, because it has nowhere to read
    // one from.
    const { service, token } = build({ cohort: otherCohort });

    await expect(
      service.scanAttendance(
        token,
        { ...actor(), ...otherCohort, faculty: "Engineering" } as never,
        SCAN_NOW
      )
    ).rejects.toMatchObject({ code: "NOT_IN_COHORT" });
  });

  it("keeps an ad-hoc session scannable, since it addresses no cohort", async () => {
    // Approved Phase 2 behaviour: a makeup class or one-off seminar has no
    // lecture behind it and therefore no cohort to check against. Governed by
    // SCAN_ALLOW_UNLINKED_SESSIONS, which ships permissive.
    const { service, token, attendances } = build({ lectureSchedule: null });

    await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(attendances.rows).toHaveLength(1);
  });

  it("refuses an ad-hoc session when unlinked scanning is switched off", async () => {
    const original = env.SCAN_ALLOW_UNLINKED_SESSIONS;

    (
      env as { SCAN_ALLOW_UNLINKED_SESSIONS: boolean }
    ).SCAN_ALLOW_UNLINKED_SESSIONS = false;

    try {
      const { service, token, attendances } = build({ lectureSchedule: null });

      await expect(
        service.scanAttendance(token, actor(), SCAN_NOW)
      ).rejects.toMatchObject({ code: "NOT_IN_COHORT" });

      expect(attendances.rows).toHaveLength(0);
    } finally {
      (
        env as { SCAN_ALLOW_UNLINKED_SESSIONS: boolean }
      ).SCAN_ALLOW_UNLINKED_SESSIONS = original;
    }
  });

  it("refuses a lecture whose organization has drifted from its session's", async () => {
    // Belt and braces over the foreign key, the same check the absence sweep
    // makes: attendance is a claim about a named person and is not worth
    // writing on an assumption.
    const { service, token } = build({ scheduleOrganizationId: ORG_B });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "SESSION_WRONG_ORGANIZATION" });
  });
});

/* ------------------------------- Error codes ------------------------------ */

describe("scan error codes", () => {
  it("distinguishes an expired code from an invalid one", async () => {
    const { service, session } = build();

    // A genuine token, correctly signed, issued 31 seconds ago. The QR rotates
    // every 30 seconds, so this is the ordinary case: hold the camera up again.
    await expect(
      service.scanAttendance(expiredTokenFor(session), actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "QR_EXPIRED", statusCode: 400 });

    // A token signed with the wrong secret is a different problem entirely:
    // this is not a code this system issued.
    const forged = generateQrToken(session.id, "not-the-session-secret");

    await expect(
      service.scanAttendance(forged, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "QR_INVALID", statusCode: 400 });
  });

  it("keeps the human-readable message both cases have always had", async () => {
    // Adding codes was additive. An existing client that renders `message` sees
    // exactly what it saw before.
    const { service, session } = build();

    const forged = generateQrToken(session.id, "not-the-session-secret");

    for (const token of [expiredTokenFor(session), forged]) {
      const error = await service
        .scanAttendance(token, actor(), SCAN_NOW)
        .catch((raised: AppError) => raised);

      expect((error as AppError).message).toBe("Invalid or expired QR code");
    }
  });

  it("codes a token that is not a JWT at all as QR_INVALID", async () => {
    const { service } = build();

    for (const rubbish of ["", "not-a-token", "a.b.c"]) {
      await expect(
        service.scanAttendance(rubbish, actor(), SCAN_NOW)
      ).rejects.toMatchObject({ code: "QR_INVALID", statusCode: 400 });
    }
  });

  it("gives each session state its own code behind the shared 409", async () => {
    // The reason codes exist: three genuinely different situations, one status.
    const cases: [ScanSessionSeed, Date, string][] = [
      [{}, new Date(SCAN_NOW.getTime() - 60 * MINUTE), "SESSION_NOT_STARTED"],
      [{}, new Date(SCAN_NOW.getTime() + 91 * MINUTE), "SESSION_ENDED"],
      [{ status: SessionStatus.CLOSED }, SCAN_NOW, "SESSION_CLOSED"],
    ];

    for (const [seed, at, code] of cases) {
      const { service, token } = build(seed);

      await expect(
        service.scanAttendance(token, actor(), at)
      ).rejects.toMatchObject({ statusCode: 409, code });
    }
  });

  it("codes the remaining refusals distinctly", async () => {
    const { service, token } = build();

    const orphan = generateQrToken("session-nope", "whatever");

    await expect(
      service.scanAttendance(orphan, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 404, code: "SESSION_NOT_FOUND" });

    await expect(
      service.scanAttendance(token, actor(ORG_B), SCAN_NOW)
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "SESSION_WRONG_ORGANIZATION",
    });

    await service.scanAttendance(token, actor(), SCAN_NOW);

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_RECORDED" });
  });

  it("gives every code a distinct value, so a client can switch on them", () => {
    const codes = Object.values(SCAN_ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);

    // The key and the value are the same string, so a code cannot be renamed
    // on one side only and quietly stop matching what a client was told.
    for (const [key, value] of Object.entries(SCAN_ERROR_CODES)) {
      expect(key).toBe(value);
    }
  });
});

/* ---------------------- Ordering: what is disclosed when ------------------ */

describe("nothing about a session is disclosed before the signature is checked", () => {
  it("does not reveal tenancy to a caller holding an unsigned token", async () => {
    // The regression: the tenant check used to run before verification, which
    // turned this endpoint into an oracle — send a garbage token naming a
    // guessed session id and the status told you whether that session was in
    // your university. A caller who cannot produce a valid signature now
    // learns only that their token is invalid.
    const { service, session } = build();

    const forged = generateQrToken(session.id, "not-the-session-secret");

    const foreign = await service
      .scanAttendance(forged, actor(ORG_B), SCAN_NOW)
      .catch((error: AppError) => error);

    const own = await service
      .scanAttendance(forged, actor(), SCAN_NOW)
      .catch((error: AppError) => error);

    // Indistinguishable: same status, same code, same message.
    expect((foreign as AppError).statusCode).toBe((own as AppError).statusCode);
    expect((foreign as AppError).code).toBe((own as AppError).code);
    expect((foreign as AppError).message).toBe((own as AppError).message);
    expect((foreign as AppError).code).toBe("QR_INVALID");
  });

  it("does not reveal cohort membership to a caller holding an unsigned token", async () => {
    const { service, session } = build({ cohort: otherCohort });

    const forged = generateQrToken(session.id, "not-the-session-secret");

    await expect(
      service.scanAttendance(forged, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "QR_INVALID" });
  });

  it("does not reveal session state to a caller holding an expired token", async () => {
    // An expired code for a closed session answers QR_EXPIRED, not
    // SESSION_CLOSED: the caller has not yet proved they hold a live code.
    const { service, session } = build({ status: SessionStatus.CLOSED });

    await expect(
      service.scanAttendance(expiredTokenFor(session), actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "QR_EXPIRED" });
  });
});

/* ---------------------------- The success payload ------------------------- */

describe("the successful scan response", () => {
  it("carries what the scan page has to render, and nothing else", async () => {
    const { service, token } = build();

    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(result).toEqual({
      message: "Attendance recorded successfully",
      attendance: {
        id: expect.any(String),
        studentId: STUDENT,
        sessionId: "session-1",
        scanTime: expect.any(Date),
        status: AttendanceStatus.LATE,
      },
      session: {
        id: "session-1",
        title: "Electronics",
        room: "B-204",
        startTime: expect.any(Date),
      },
      course: {
        id: "course-1",
        courseCode: "MEC201",
        courseName: "Electronics",
      },
      lecture: {
        id: "schedule-1",
        startTime: "10:00",
        endTime: "12:00",
        instructor: "Dr. Adel Mansour",
      },
    });
  });

  it("never leaks the session's QR signing secret", async () => {
    // qrSecret is selected by findForScan because verifying the presented
    // token needs it. It must not travel any further than that.
    const { service, token } = build();

    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(JSON.stringify(result)).not.toContain("qr-secret-for-session-1");
  });

  it("returns null course and lecture for an ad-hoc session", async () => {
    // The client has to cope with this rather than assume a lecture behind
    // every session — the same requirement the robot's screen already has.
    const { service, token } = build({ lectureSchedule: null });

    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(result.course).toBeNull();
    expect(result.lecture).toBeNull();
    expect(result.session.id).toBe("session-1");
  });

  it("keeps the attendance object compatible with the old response", async () => {
    // Existing clients read `attendance`. Its shape did not change; everything
    // Phase 3 added sits beside it.
    const { service, token } = build();

    const result = await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(Object.keys(result.attendance).sort()).toEqual([
      "id",
      "scanTime",
      "sessionId",
      "status",
      "studentId",
    ]);
  });
});

/* --------------------- Attendance correctness is preserved ---------------- */

describe("a repeated scan cannot rewrite what is already recorded", () => {
  it("writes exactly one row however many times it is scanned", async () => {
    const { service, token, attendances } = build();

    await service.scanAttendance(token, actor(), SCAN_NOW);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.scanAttendance(token, actor(), SCAN_NOW)
      ).rejects.toMatchObject({ code: "ALREADY_RECORDED" });
    }

    expect(attendances.rows).toHaveLength(1);
  });

  it("does not let a later scan turn a LATE into a PRESENT", async () => {
    const { service, token, attendances } = build();

    // First scan is thirty minutes in: LATE.
    await service.scanAttendance(token, actor(), SCAN_NOW);
    expect(attendances.rows[0]!.status).toBe(AttendanceStatus.LATE);

    // A second scan inside the threshold must not rewrite it. The check is on
    // the row existing, not on its status.
    await expect(
      service.scanAttendance(
        token,
        actor(),
        new Date(SCAN_NOW.getTime() - 25 * MINUTE)
      )
    ).rejects.toMatchObject({ code: "ALREADY_RECORDED" });

    expect(attendances.rows[0]!.status).toBe(AttendanceStatus.LATE);
  });

  it("does not overwrite an ABSENT the sweep already wrote", async () => {
    // Historical attendance is preserved: the duplicate check looks for any
    // row, whatever its status, so a swept absence is never silently upgraded
    // by a student scanning a stale code.
    const { service, token, attendances } = build();

    attendances.rows.push({
      id: "swept",
      studentId: STUDENT,
      sessionId: "session-1",
      scanTime: SCAN_NOW,
      status: AttendanceStatus.ABSENT,
    });

    await expect(
      service.scanAttendance(token, actor(), SCAN_NOW)
    ).rejects.toMatchObject({ code: "ALREADY_RECORDED" });

    expect(attendances.rows).toHaveLength(1);
    expect(attendances.rows[0]!.status).toBe(AttendanceStatus.ABSENT);
  });

  it("records against the authenticated student and no one else", async () => {
    const { service, token, attendances } = build();

    await service.scanAttendance(
      token,
      { id: "student-9", organizationId: ORG_A },
      SCAN_NOW
    );

    // The row is written for whoever the auth token said, which is the only
    // student identity this service ever sees.
    expect(attendances.rows[0]!.studentId).toBe("student-9");

    // And one student's row does not block a different student.
    await service.scanAttendance(token, actor(), SCAN_NOW);

    expect(attendances.rows.map((row) => row.studentId).sort()).toEqual([
      "student-1",
      "student-9",
    ]);
  });
});
