import { describe, expect, it } from "vitest";
import { SessionService } from "../src/services/session.service.js";
import { createSessionSchema } from "../src/types/session.types.js";
import { AppError } from "../src/utils/AppError.js";
import { canSeeSession } from "../src/utils/session-access.js";
import {
  FakeSessionRepository,
  FakeSessionRow,
  ORG_A,
  ORG_B,
} from "./helpers/device-fakes.js";
import { FakeScheduleRepository, makeSchedule } from "./helpers/schedule-fakes.js";

/**
 * Phase 2 — the Session ↔ LectureSchedule link.
 *
 * The thing worth testing here is not that a foreign key can be written. It is
 * that the room a robot filters on is derived from the timetable rather than
 * accepted from whoever opened the session, and that naming a lecture cannot be
 * used to reach across a tenant boundary or to open attendance for a lecture
 * that was cancelled.
 */

const INSTRUCTOR = {
  id: "instructor-1",
  role: "ADMIN",
  organizationId: ORG_A,
};

const OTHER_INSTRUCTOR = {
  id: "instructor-2",
  role: "ADMIN",
  organizationId: ORG_A,
};

const SUPER_ADMIN = {
  id: "admin-1",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};

const build = (schedules = new FakeScheduleRepository([makeSchedule()])) => {
  const sessions = new FakeSessionRepository();
  const service = new SessionService(sessions, schedules);

  return { service, sessions, schedules };
};

/** What the route does before the service ever sees a body. */
const validated = (body: unknown) => createSessionSchema.parse(body);

/* ------------------------------ Input shape ------------------------------ */

describe("opening a session: what the validator accepts", () => {
  it("accepts a bare title, as it always has", () => {
    expect(validated({ title: "Ad-hoc revision class" })).toMatchObject({
      title: "Ad-hoc revision class",
    });
  });

  it("refuses a lecture and a room together", () => {
    // A session cannot be in two places, and silently picking one of the two
    // answers is how a room-bound robot ends up displaying the wrong code.
    expect(() =>
      validated({
        title: "Electronics",
        lectureScheduleId: "6c1f2a1e-0000-4000-8000-000000000000",
        room: "C-101",
      })
    ).toThrow();
  });

  it("strips an organizationId out of the body", () => {
    const parsed = validated({
      title: "Electronics",
      organizationId: ORG_B,
    });

    expect(parsed).not.toHaveProperty("organizationId");
  });
});

/* ------------------------------ The linking ------------------------------ */

describe("linking a session to its lecture", () => {
  it("takes the room from the lecture, not from the request", async () => {
    const { service, sessions } = build();

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR
    );

    expect(sessions.created[0]).toMatchObject({
      lectureScheduleId: "schedule-1",
      room: "B-204",
      organizationId: ORG_A,
      createdById: INSTRUCTOR.id,
    });
  });

  it("opens an unlinked session with no room when neither is given", async () => {
    const { service, sessions } = build();

    await service.createSession({ title: "Revision class" }, INSTRUCTOR);

    // "Unlocated", which is a real state and not a failure — it is what every
    // session opened before this phase looks like.
    expect(sessions.created[0]).toMatchObject({
      lectureScheduleId: null,
      room: null,
    });
  });

  it("accepts a room on its own for a session with no timetable entry", async () => {
    const { service, sessions } = build();

    await service.createSession(
      { title: "Makeup lab", room: "LAB-2" },
      INSTRUCTOR
    );

    expect(sessions.created[0]).toMatchObject({
      lectureScheduleId: null,
      room: "LAB-2",
    });
  });

  /* ------------------------------- F1: course ---------------------------- */

  it("takes the course from the lecture", async () => {
    const { service, sessions } = build(
      new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", courseId: "course-mec201" }),
      ])
    );

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR
    );

    expect(sessions.created[0]!.courseId).toBe("course-mec201");
  });

  it("carries the course the attendance queries join on", async () => {
    // countAttendedByCourse, countClosedByCourse and findAttendeesOfCourse all
    // filter `session: { courseId, organizationId, status }`. Without this
    // column a timetable-linked session is invisible to all three, and a
    // course's attendance percentage reads as though the lecture was never
    // taught. The SQL join itself needs a database; what is provable here is
    // that the session carries exactly the id those queries filter on.
    const { service, sessions } = build(
      new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", courseId: "course-mec201" }),
      ])
    );

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR
    );

    const written = sessions.created[0]!;

    expect({
      courseId: written.courseId,
      organizationId: written.organizationId,
    }).toEqual({ courseId: "course-mec201", organizationId: ORG_A });
  });

  it("cannot have a course injected through the request body", async () => {
    const { service, sessions } = build(
      new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", courseId: "course-mec201" }),
      ])
    );

    // A courseId in the body is not part of createSessionSchema, so Zod strips
    // it before the service is ever reached. Both halves are asserted: that the
    // validator drops it, and that the service ignores it even if handed one.
    expect(
      validated({
        title: "Electronics",
        lectureScheduleId: "6c1f2a1e-0000-4000-8000-000000000000",
        courseId: "course-somebody-elses",
      })
    ).not.toHaveProperty("courseId");

    await service.createSession(
      {
        title: "Electronics",
        lectureScheduleId: "schedule-1",
        ...({ courseId: "course-somebody-elses" } as object),
      } as never,
      INSTRUCTOR
    );

    expect(sessions.created[0]!.courseId).toBe("course-mec201");
  });

  it("leaves an ad-hoc session with no course, as before", async () => {
    const { service, sessions } = build();

    await service.createSession({ title: "Revision class" }, INSTRUCTOR);
    await service.createSession({ title: "Makeup lab", room: "LAB-2" }, INSTRUCTOR);

    expect(sessions.created.map((session) => session.courseId)).toEqual([
      null,
      null,
    ]);
  });

  it("takes the tenant from the caller even when the lecture names one", async () => {
    const { service, sessions } = build();

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      SUPER_ADMIN
    );

    expect(sessions.created[0]!.organizationId).toBe(SUPER_ADMIN.organizationId);
  });
});

/* ---------------------------- Who may open what --------------------------- */

describe("authorization to open against a lecture", () => {
  it("refuses another university's lecture, and says only 'not found'", async () => {
    const { service, sessions } = build(
      new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", organizationId: ORG_B }),
      ])
    );

    const foreign = await service
      .createSession(
        { title: "Electronics", lectureScheduleId: "schedule-1" },
        INSTRUCTOR
      )
      .catch((error: AppError) => error);

    const missing = await service
      .createSession(
        { title: "Electronics", lectureScheduleId: "schedule-nope" },
        INSTRUCTOR
      )
      .catch((error: AppError) => error);

    // Identical answers: the endpoint cannot be used to discover that a
    // schedule id exists at another university.
    expect((foreign as AppError).statusCode).toBe(404);
    expect((foreign as AppError).message).toBe((missing as AppError).message);

    expect(sessions.created).toHaveLength(0);
  });

  it("refuses an instructor opening attendance for somebody else's lecture", async () => {
    const { service, sessions } = build();

    await expect(
      service.createSession(
        { title: "Electronics", lectureScheduleId: "schedule-1" },
        OTHER_INSTRUCTOR
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(sessions.created).toHaveLength(0);
  });

  it("lets a super admin open attendance for any lecture in their university", async () => {
    const { service, sessions } = build();

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      SUPER_ADMIN
    );

    expect(sessions.created).toHaveLength(1);
  });

  it("refuses a cancelled lecture, and explains why rather than hiding it", async () => {
    const { service } = build(
      new FakeScheduleRepository([
        makeSchedule({ id: "schedule-1", isActive: false }),
      ])
    );

    // 409, not 404: the lecture exists and this caller is entitled to see it,
    // so "cancelled" is a better answer than pretending it is not there.
    await expect(
      service.createSession(
        { title: "Electronics", lectureScheduleId: "schedule-1" },
        INSTRUCTOR
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

/* ------------------- B1: one session per lecture occurrence ---------------- */

/**
 * The regression these cover is not "a duplicate row was created". It is that a
 * duplicate session gets its own roll called, and a student who scanned into
 * the first one has no Attendance row on the second — so the sweep writes them
 * an ABSENT for a lecture they sat through. The unique constraint on Attendance
 * cannot catch it: [studentId, sessionId] is satisfied by two different
 * sessions. The matching sweep-side half is in attendance-lifecycle.service.test.ts.
 */

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-08-16T10:05:00.000Z");

const linked = (row: Partial<FakeSessionRow> = {}): FakeSessionRow => ({
  id: "session-earlier",
  organizationId: ORG_A,
  lectureScheduleId: "schedule-1",
  createdById: INSTRUCTOR.id,
  startTime: new Date(NOW.getTime() - 3 * HOUR_MS),
  ...row,
});

describe("opening a second session for one lecture occurrence", () => {
  it("refuses while the first is still open", async () => {
    const { service, sessions } = build();

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR
    );

    await expect(
      service.createSession(
        { title: "Electronics", lectureScheduleId: "schedule-1" },
        INSTRUCTOR
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    // The double tap wrote exactly one session.
    expect(sessions.created).toHaveLength(1);
  });

  it("refuses even when the first has been closed, which is the worse case", async () => {
    // A closed session has already had its roll called. Opening a second one
    // for the same occurrence would mark every student who attended the first
    // as absent from the second — so "already finished" is a reason to refuse
    // harder, not a reason to allow it.
    const sessions = new FakeSessionRepository([linked({ status: "CLOSED" })]);
    const service = new SessionService(
      sessions,
      new FakeScheduleRepository([makeSchedule()])
    );

    await expect(
      service.createSession(
        { title: "Electronics", lectureScheduleId: "schedule-1" },
        INSTRUCTOR,
        NOW
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(sessions.created).toHaveLength(0);
  });

  it("allows next week's occurrence of the same lecture", async () => {
    // A weekly slot repeats every seven days. The guard must not turn "one
    // session per occurrence" into "one session ever".
    const sessions = new FakeSessionRepository([
      linked({ startTime: new Date(NOW.getTime() - 7 * 24 * HOUR_MS) }),
    ]);
    const service = new SessionService(
      sessions,
      new FakeScheduleRepository([makeSchedule()])
    );

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR,
      NOW
    );

    expect(sessions.created).toHaveLength(1);
  });

  it("does not let another university's session block this one", async () => {
    const sessions = new FakeSessionRepository([
      linked({ organizationId: ORG_B }),
    ]);
    const service = new SessionService(
      sessions,
      new FakeScheduleRepository([makeSchedule()])
    );

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR,
      NOW
    );

    expect(sessions.created).toHaveLength(1);
  });

  it("does not let a different lecture block this one", async () => {
    const sessions = new FakeSessionRepository([
      linked({ lectureScheduleId: "schedule-other" }),
    ]);
    const service = new SessionService(
      sessions,
      new FakeScheduleRepository([makeSchedule()])
    );

    await service.createSession(
      { title: "Electronics", lectureScheduleId: "schedule-1" },
      INSTRUCTOR,
      NOW
    );

    expect(sessions.created).toHaveLength(1);
  });

  it("never blocks ad-hoc sessions, which address no cohort", async () => {
    // With no lecture behind them, sweepOne returns early and writes no
    // absence however many are opened — so there is nothing to guard against.
    const { service, sessions } = build();

    await service.createSession({ title: "Revision class" }, INSTRUCTOR);
    await service.createSession({ title: "Revision class" }, INSTRUCTOR);
    await service.createSession({ title: "Makeup lab", room: "LAB-2" }, INSTRUCTOR);

    expect(sessions.created).toHaveLength(3);
  });
});

/* --------------- I7: one rule for who may see a session -------------------- */

const openNow = (row: Partial<FakeSessionRow> = {}) =>
  new FakeSessionRepository([
    {
      id: "session-1",
      organizationId: ORG_A,
      createdById: INSTRUCTOR.id,
      lectureScheduleId: "schedule-1",
      // The seeded lecture runs 10:00–12:00, so a session opened now is
      // squarely IN_PROGRESS and the QR window test below is about the window
      // rather than about the clock.
      startTime: new Date(),
      ...row,
    },
  ]);

const serviceOver = (sessions: FakeSessionRepository) =>
  new SessionService(sessions, new FakeScheduleRepository([makeSchedule()]));

describe("who may see one session", () => {
  it("lets the instructor who opened it read, close and get a code for it", async () => {
    const service = serviceOver(openNow());

    await expect(service.getSession("session-1", INSTRUCTOR)).resolves.toMatchObject(
      { id: "session-1" }
    );
    await expect(service.getQrToken("session-1", INSTRUCTOR)).resolves.toMatchObject(
      { expiresIn: 30 }
    );
    await expect(
      service.closeSession("session-1", INSTRUCTOR)
    ).resolves.toMatchObject({
      status: "CLOSED",
      // Still MANUAL: an instructor closing by hand is a different record from
      // the sweep closing behind them.
      closeReason: "MANUAL",
    });
  });

  it("hides another instructor's session behind a 404, not a 403", async () => {
    // 403 would confirm the id is real, which is exactly what a caller who may
    // not see it must not learn — the same answer the schedule routes give.
    const service = serviceOver(openNow());

    for (const call of [
      () => service.getSession("session-1", OTHER_INSTRUCTOR),
      () => service.getQrToken("session-1", OTHER_INSTRUCTOR),
      () => service.closeSession("session-1", OTHER_INSTRUCTOR),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 404 });
    }
  });

  it("gives a super admin their whole university, including other instructors' sessions", async () => {
    // The previously inconsistent case: closeSession demanded ownership of
    // every caller, so a super admin could not close a session they had not
    // personally opened. A super admin is scoped to the organization and no
    // further — that is the rule everywhere else in this system.
    const service = serviceOver(openNow());

    await expect(service.getSession("session-1", SUPER_ADMIN)).resolves.toMatchObject(
      { id: "session-1" }
    );
    await expect(service.getQrToken("session-1", SUPER_ADMIN)).resolves.toMatchObject(
      { expiresIn: 30 }
    );
    await expect(
      service.closeSession("session-1", SUPER_ADMIN)
    ).resolves.toMatchObject({ status: "CLOSED" });
  });

  it("stops every role at the tenant boundary", async () => {
    const service = serviceOver(openNow({ organizationId: ORG_B }));

    for (const actor of [INSTRUCTOR, SUPER_ADMIN]) {
      await expect(service.getSession("session-1", actor)).rejects.toMatchObject({
        statusCode: 404,
      });
    }
  });

  it("keeps the device path on its own entry point, with no role in play", async () => {
    // A robot has no UserRole, so the instructor rule has nothing to say about
    // it. It is scoped by the organization on its own row and nothing else —
    // which is why it reaches a session it did not open.
    const service = serviceOver(openNow());

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: null }, "session-1")
    ).resolves.toMatchObject({ expiresIn: 30 });

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_B, room: null }, "session-1")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ------------- M1: the QR endpoint uses the one scannable rule ------------- */

describe("issuing a QR code for a session whose lecture has ended", () => {
  const ended = () =>
    // Opened three hours ago against a two-hour lecture: still ACTIVE, because
    // nothing has closed it, but PENDING rather than IN_PROGRESS.
    openNow({ startTime: new Date(Date.now() - 3 * HOUR_MS) });

  it("refuses on the staff path, rather than minting a code nobody can scan", async () => {
    const service = serviceOver(ended());

    await expect(service.getQrToken("session-1", INSTRUCTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: "This lecture has ended — attendance is no longer being taken",
    });
  });

  it("refuses on the device path too, from the same definition", async () => {
    const service = serviceOver(ended());

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: null }, "session-1")
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("still refuses a closed session, as it always did", async () => {
    const service = serviceOver(openNow({ status: "CLOSED" }));

    await expect(service.getQrToken("session-1", INSTRUCTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: "Cannot generate QR for inactive session",
    });
  });
});

/* ------------------------- Listing, and who sees what ---------------------- */

describe("listing sessions: the list agrees with the single-session rule", () => {
  /**
   * The regression this locks down.
   *
   * `canSeeSession` has always let a super admin read any session in their own
   * university, but `GET /api/sessions` returned only the sessions the caller
   * had personally created — for every role. So a super admin could open a
   * session by id and read its roster, while the list that session should have
   * appeared in came back empty. The Sessions page was blank for the one role
   * whose job is to look at everybody's.
   *
   * Both now dispatch on `seesOnlyOwnSessions`, so they cannot drift again.
   */
  const seeded = () =>
    new FakeSessionRepository([
      { id: "mine-1", organizationId: ORG_A, createdById: INSTRUCTOR.id },
      { id: "theirs-1", organizationId: ORG_A, createdById: OTHER_INSTRUCTOR.id },
      { id: "other-org", organizationId: ORG_B, createdById: INSTRUCTOR.id },
    ]);

  const serviceOver = (sessions: FakeSessionRepository) =>
    new SessionService(sessions, new FakeScheduleRepository([makeSchedule()]));

  it("gives an instructor only the sessions they opened", async () => {
    const service = serviceOver(seeded());

    const listed = await service.listSessionsFor(INSTRUCTOR);

    expect(listed.map((row) => row.id)).toEqual(["mine-1"]);
  });

  it("gives a super admin every session in their university", async () => {
    const service = serviceOver(seeded());

    const listed = await service.listSessionsFor(SUPER_ADMIN);

    // Including the one they did not open — that is the whole point.
    expect(listed.map((row) => row.id).sort()).toEqual(["mine-1", "theirs-1"]);
  });

  it("never lets a super admin see another university's sessions", async () => {
    const service = serviceOver(seeded());

    const listed = await service.listSessionsFor(SUPER_ADMIN);

    // The tenant is absolute and no role widens past it.
    expect(listed.map((row) => row.id)).not.toContain("other-org");
  });

  it("lists exactly what canSeeSession would admit, for both roles", async () => {
    const sessions = seeded();
    const service = serviceOver(sessions);

    for (const actor of [INSTRUCTOR, SUPER_ADMIN]) {
      const listed = await service.listSessionsFor(actor);
      const admitted = sessions.rows
        .filter((row) => canSeeSession(row, actor))
        .map((row) => row.id);

      expect(listed.map((row) => row.id).sort()).toEqual(admitted.sort());
    }
  });
});

/* ------------- The room binding is enforced when MINTING, not just listing --- */

describe("getQrTokenForDevice: the room binding is an authorization check", () => {
  /**
   * The bug this locks down.
   *
   * The binding used to be enforced only by the SQL behind the device's session
   * list. This method checked the organization and nothing else, so a device
   * bound to B-204 could not discover a session in C-101 yet could mint a valid
   * code for it given the id — which is in the payload of every code that
   * device has ever displayed, readable without any secret.
   */
  const inRoom = (room: string | null) => openNow({ room });

  it("mints for a device bound to the session's room", async () => {
    const service = serviceOver(inRoom("B-204"));

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: "B-204" }, "session-1")
    ).resolves.toMatchObject({ expiresIn: 30 });
  });

  it("matches the room case-insensitively", async () => {
    const service = serviceOver(inRoom("B-204"));

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: "b-204" }, "session-1")
    ).resolves.toMatchObject({ expiresIn: 30 });
  });

  it("REFUSES a device bound to another room, even with the session id", async () => {
    const service = serviceOver(inRoom("C-101"));

    // 404 rather than 403: a 403 would confirm the id is real, which is exactly
    // what a caller who may not act on it must not learn.
    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: "B-204" }, "session-1")
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("still lets an unbound device serve any room in its university", async () => {
    const service = serviceOver(inRoom("C-101"));

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: null }, "session-1")
    ).resolves.toMatchObject({ expiresIn: 30 });
  });

  it("checks the tenant before the room, and no room match substitutes for it", async () => {
    // Same room name, different university — two campuses may both have B-204.
    const service = serviceOver(openNow({ organizationId: ORG_B, room: "B-204" }));

    await expect(
      service.getQrTokenForDevice({ organizationId: ORG_A, room: "B-204" }, "session-1")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
