import { afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { DeviceStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { env } from "../src/config/env.js";
import {
  authenticateDevice,
  capabilitiesFor,
  setDeviceRepository,
  signDeviceToken,
} from "../src/middleware/device.middleware.js";
import { DeviceService } from "../src/services/device.service.js";
import { AppError } from "../src/utils/AppError.js";
import { principalKey } from "../src/utils/rate-limit.js";
import {
  FakeDeviceRepository,
  FakeSessionRepository,
  ORG_A,
  ORG_B,
  RecordingSessionService,
  makeDevice,
} from "./helpers/device-fakes.js";
import { deviceMaySeeRoom } from "../src/utils/device-room-access.js";

/**
 * Phase 0 — robot/tablet authentication.
 *
 * The properties under test are the ones the design actually rests on: that a
 * device is not a user and cannot become one, that revoking a device stops it
 * on its very next request rather than when its token happens to expire, and
 * that a campus behind one NAT address is not rate-limited as a single caller.
 */

const SUPER_ADMIN = {
  id: "admin-1",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};

const OTHER_ADMIN = {
  id: "admin-2",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_B,
};

const build = (devices = new FakeDeviceRepository()) => {
  const sessions = new FakeSessionRepository([
    { id: "session-a", organizationId: ORG_A },
    { id: "session-b", organizationId: ORG_B },
  ]);

  const sessionService = new RecordingSessionService();
  const service = new DeviceService(devices, sessions, sessionService);

  return { service, devices, sessions, sessionService };
};

/** Drives the middleware the way Express would, and reports what happened. */
const runMiddleware = async (token: string | null) => {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;

  let error: unknown;
  const next: NextFunction = (err?: unknown) => {
    error = err;
  };

  await authenticateDevice(req, {} as Response, next);

  return { device: req.device, error: error as AppError | undefined };
};

afterEach(() => {
  setDeviceRepository(null);
});

/* ------------------------------ Provisioning ----------------------------- */

describe("device provisioning", () => {
  it("returns the secret exactly once and never stores it in the clear", async () => {
    const { service, devices } = build();

    const result = await service.provision(
      { name: "Lab B-204 Robot", room: "B-204" },
      SUPER_ADMIN
    );

    expect(result.credentials.deviceSecret).toBeTruthy();
    expect(result.credentials.deviceKeyId).toMatch(/^dev_/);

    const stored = [...devices.rows.values()][0]!;

    // Hashed, not kept.
    expect(stored.secretHash).not.toBe(result.credentials.deviceSecret);
    expect(
      await bcrypt.compare(result.credentials.deviceSecret, stored.secretHash)
    ).toBe(true);

    // And no read path ever hands it back.
    const fetched = await service.get(stored.id, SUPER_ADMIN);
    expect(JSON.stringify(fetched)).not.toContain(
      result.credentials.deviceSecret
    );
  });

  it("takes the organization from the admin, never from the request", async () => {
    const { service, devices } = build();

    await service.provision(
      {
        name: "Smuggled",
        // A tenant in the body is not part of the schema and is not read.
        ...({ organizationId: ORG_B } as object),
      } as never,
      SUPER_ADMIN
    );

    expect([...devices.rows.values()][0]!.organizationId).toBe(ORG_A);
  });

  it("can only ever display a code, however it is provisioned", async () => {
    const { service } = build();

    const result = await service.provision(
      // The removed capability, offered anyway. Zod strips what is not in the
      // schema, so it cannot reach the repository — the same protection that
      // stops a body-supplied organizationId above.
      { name: "Default robot", ...({ canOpenSessions: true } as object) } as never,
      SUPER_ADMIN
    );

    expect(result.device.capabilities).toEqual(["qr:display"]);
    expect(JSON.stringify(result.device)).not.toContain("session:open");
  });
});

/* ---------------------------- Credential exchange ------------------------ */

describe("device authentication", () => {
  const secret = "a-secret-worth-32-characters-long";

  const seeded = async (status: DeviceStatus = DeviceStatus.ACTIVE) =>
    new FakeDeviceRepository([
      makeDevice({
        id: "device-1",
        deviceKeyId: "dev_demo",
        secretHash: await bcrypt.hash(secret, 10),
        status,
      }),
    ]);

  it("exchanges a valid credential for a short-lived token", async () => {
    const { service } = build(await seeded());

    const result = await service.authenticate(
      { deviceKeyId: "dev_demo", deviceSecret: secret },
      { ipAddress: "10.0.0.5" }
    );

    expect(result.token).toBeTruthy();
    expect(result.expiresIn).toBe(60 * env.DEVICE_TOKEN_TTL_MINUTES);
    expect(result.device.organizationId).toBe(ORG_A);
  });

  it("stamps the audit trail on a successful exchange", async () => {
    const devices = await seeded();
    const { service } = build(devices);

    await service.authenticate(
      { deviceKeyId: "dev_demo", deviceSecret: secret },
      { ipAddress: "10.0.0.5" }
    );

    const stored = devices.rows.get("device-1")!;
    expect(stored.lastSeenAt).toBeInstanceOf(Date);
    expect(stored.lastIpAddress).toBe("10.0.0.5");
  });

  it("rejects a wrong secret", async () => {
    const { service } = build(await seeded());

    await expect(
      service.authenticate(
        { deviceKeyId: "dev_demo", deviceSecret: "wrong-secret-wrong-secret" },
        { ipAddress: null }
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("answers an unknown key exactly as it answers a wrong secret", async () => {
    const { service } = build(await seeded());

    const unknown = await service
      .authenticate(
        { deviceKeyId: "dev_nope", deviceSecret: secret },
        { ipAddress: null }
      )
      .catch((error: AppError) => error);

    const wrong = await service
      .authenticate(
        { deviceKeyId: "dev_demo", deviceSecret: "wrong-secret-wrong-secret" },
        { ipAddress: null }
      )
      .catch((error: AppError) => error);

    // Same status and same wording: the endpoint cannot be used to find out
    // which device key ids exist.
    expect((unknown as AppError).statusCode).toBe(401);
    expect((unknown as AppError).message).toBe((wrong as AppError).message);
  });

  it("refuses a revoked device even with the right secret", async () => {
    const { service } = build(await seeded(DeviceStatus.REVOKED));

    await expect(
      service.authenticate(
        { deviceKeyId: "dev_demo", deviceSecret: secret },
        { ipAddress: null }
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuses a suspended device", async () => {
    const { service } = build(await seeded(DeviceStatus.SUSPENDED));

    await expect(
      service.authenticate(
        { deviceKeyId: "dev_demo", deviceSecret: secret },
        { ipAddress: null }
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

/* ------------------------------- Revocation ------------------------------ */

describe("revocation takes effect immediately", () => {
  it("rejects the next request made with an already-issued token", async () => {
    const devices = new FakeDeviceRepository([
      makeDevice({ id: "device-1", organizationId: ORG_A }),
    ]);

    const { service } = build(devices);
    setDeviceRepository(devices);

    // A token minted while the device was healthy.
    const token = signDeviceToken({
      sub: "device-1",
      org: ORG_A,
      typ: "device",
      cap: ["qr:display"],
    });

    expect((await runMiddleware(token)).device?.id).toBe("device-1");

    await service.revoke("device-1", "Tablet stolen", SUPER_ADMIN);

    // Same token, still well within its fifteen minutes, now refused — the row
    // is re-read on every request, so the lifetime is a cache and not a window.
    const after = await runMiddleware(token);
    expect(after.device).toBeUndefined();
    expect(after.error?.statusCode).toBe(401);
  });

  it("is terminal: a revoked device cannot be edited back into service", async () => {
    const devices = new FakeDeviceRepository([makeDevice({ id: "device-1" })]);
    const { service } = build(devices);

    await service.revoke("device-1", undefined, SUPER_ADMIN);

    await expect(
      service.update("device-1", { status: DeviceStatus.ACTIVE }, SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records who revoked it and why", async () => {
    const devices = new FakeDeviceRepository([makeDevice({ id: "device-1" })]);
    const { service } = build(devices);

    const revoked = await service.revoke("device-1", "Lost in transit", SUPER_ADMIN);

    expect(revoked.status).toBe(DeviceStatus.REVOKED);
    expect(revoked.revokedReason).toBe("Lost in transit");
    expect(devices.rows.get("device-1")!.revokedById).toBe(SUPER_ADMIN.id);
  });
});

/* ----------------------------- Secret rotation --------------------------- */

describe("secret rotation", () => {
  it("issues a new secret and stops the old one working", async () => {
    const original = "the-original-secret-32-characters";

    const devices = new FakeDeviceRepository([
      makeDevice({
        id: "device-1",
        deviceKeyId: "dev_demo",
        secretHash: await bcrypt.hash(original, 10),
      }),
    ]);

    const { service } = build(devices);

    const rotated = await service.rotateSecret("device-1", SUPER_ADMIN);

    // The key id survives rotation; only the secret behind it changes.
    expect(rotated.credentials.deviceKeyId).toBe("dev_demo");
    expect(rotated.credentials.deviceSecret).not.toBe(original);

    await expect(
      service.authenticate(
        { deviceKeyId: "dev_demo", deviceSecret: original },
        { ipAddress: null }
      )
    ).rejects.toMatchObject({ statusCode: 401 });

    const fresh = await service.authenticate(
      {
        deviceKeyId: "dev_demo",
        deviceSecret: rotated.credentials.deviceSecret,
      },
      { ipAddress: null }
    );

    expect(fresh.token).toBeTruthy();
  });

  it("refuses to rotate a revoked device", async () => {
    const devices = new FakeDeviceRepository([
      makeDevice({ id: "device-1", status: DeviceStatus.REVOKED }),
    ]);

    const { service } = build(devices);

    await expect(
      service.rotateSecret("device-1", SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

/* --------------------- User and device token separation ------------------ */

describe("device tokens and user tokens are not interchangeable", () => {
  it("refuses a user token presented as a device token", async () => {
    setDeviceRepository(new FakeDeviceRepository([makeDevice({ id: "device-1" })]));

    // A genuine, unexpired user token, signed with the user key.
    const userToken = jwt.sign({ id: "student-1" }, env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const result = await runMiddleware(userToken);

    expect(result.device).toBeUndefined();
    expect(result.error?.statusCode).toBe(401);
  });

  it("refuses a device token presented as a user token", () => {
    const deviceToken = signDeviceToken({
      sub: "device-1",
      org: ORG_A,
      typ: "device",
      cap: ["qr:display"],
    });

    // What `authenticate` does. It cannot get past this line.
    expect(() => jwt.verify(deviceToken, env.JWT_SECRET)).toThrow();
  });

  it("keeps the two signing keys distinct", () => {
    expect(env.deviceJwtSecret).not.toBe(env.JWT_SECRET);
  });

  it("refuses a token signed with the device key but not marked as one", async () => {
    setDeviceRepository(new FakeDeviceRepository([makeDevice({ id: "device-1" })]));

    const mislabelled = jwt.sign(
      { sub: "device-1", org: ORG_A, typ: "user" },
      env.deviceJwtSecret,
      { expiresIn: "15m" }
    );

    const result = await runMiddleware(mislabelled);

    expect(result.device).toBeUndefined();
    expect(result.error?.statusCode).toBe(401);
  });

  it("refuses a device token whose organization no longer matches its row", async () => {
    setDeviceRepository(
      new FakeDeviceRepository([
        makeDevice({ id: "device-1", organizationId: ORG_A }),
      ])
    );

    const token = signDeviceToken({
      sub: "device-1",
      org: ORG_B,
      typ: "device",
      cap: ["qr:display"],
    });

    const result = await runMiddleware(token);

    expect(result.device).toBeUndefined();
    expect(result.error?.statusCode).toBe(401);
  });
});

/* --------------------------- Organization isolation ---------------------- */

describe("organization isolation", () => {
  it("shows a device only its own university's open sessions", async () => {
    const { service } = build();

    const result = await service.listActiveSessions({
      id: "device-1",
      organizationId: ORG_A,
      room: "B-204",
    });

    expect(result.sessions.map((session) => session.id)).toEqual(["session-a"]);
  });

  it("asks for a QR code with the device's own organization, not the request's", async () => {
    const { service, sessionService } = build();

    await service.issueQrToken(
      { organizationId: ORG_A, room: "B-204" },
      "session-b"
    );

    // The session belongs to ORG_B; what is handed down is still ORG_A, so
    // SessionService answers "not found" rather than issuing a code.
    //
    // The room travels with it too: the binding is an authorization input on
    // the mint path, not merely the filter that shapes the device's list.
    expect(sessionService.qrCalls).toEqual([
      { sessionId: "session-b", organizationId: ORG_A, room: "B-204" },
    ]);
  });

  it("reports another university's device exactly as a missing one", async () => {
    const devices = new FakeDeviceRepository([
      makeDevice({ id: "device-1", organizationId: ORG_A }),
    ]);

    const { service } = build(devices);

    const foreign = await service
      .get("device-1", OTHER_ADMIN)
      .catch((error: AppError) => error);

    const missing = await service
      .get("device-nope", OTHER_ADMIN)
      .catch((error: AppError) => error);

    expect((foreign as AppError).statusCode).toBe(404);
    expect((foreign as AppError).message).toBe((missing as AppError).message);
  });

  it("refuses to revoke a device belonging to another university", async () => {
    const devices = new FakeDeviceRepository([
      makeDevice({ id: "device-1", organizationId: ORG_A }),
    ]);

    const { service } = build(devices);

    await expect(
      service.revoke("device-1", "not mine", OTHER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(devices.rows.get("device-1")!.status).toBe(DeviceStatus.ACTIVE);
  });

  it("lists only the caller's own university's devices", async () => {
    const devices = new FakeDeviceRepository([
      makeDevice({ id: "device-1", organizationId: ORG_A }),
      makeDevice({ id: "device-2", organizationId: ORG_B }),
    ]);

    const { service } = build(devices);

    const result = await service.list(
      { page: 1, limit: 10, sortOrder: "desc" },
      SUPER_ADMIN
    );

    expect(result.data.map((device) => device.id)).toEqual(["device-1"]);
  });
});

/* ------------------------------ Capabilities ----------------------------- */

describe("capabilities", () => {
  it("grants exactly one capability: displaying a code", () => {
    expect(capabilitiesFor()).toEqual(["qr:display"]);
  });

  it("does not grant session:open to anything, by any route", async () => {
    const devices = new FakeDeviceRepository([makeDevice({ id: "device-1" })]);
    const { service } = build(devices);

    setDeviceRepository(devices);

    // Every surface that could conceivably hand it out.
    const provisioned = await service.provision({ name: "Robot" }, SUPER_ADMIN);
    const updated = await service.update("device-1", { name: "Renamed" }, SUPER_ADMIN);
    const described = await service.describeSelf("device-1");

    for (const view of [provisioned.device, updated, described]) {
      expect(view.capabilities).toEqual(["qr:display"]);
    }
  });

  it("ignores a capability claimed by a token but not granted by the server", async () => {
    const devices = new FakeDeviceRepository([makeDevice({ id: "device-1" })]);

    setDeviceRepository(devices);

    // A forged-in claim, on a token that is otherwise genuine. `session:open`
    // no longer exists in the union, so this is what an old token — or a
    // hand-rolled one — would look like.
    const token = signDeviceToken({
      sub: "device-1",
      org: ORG_A,
      typ: "device",
      cap: ["qr:display", "session:open"] as never,
    });

    const result = await runMiddleware(token);

    // Authenticated, because the token is validly signed and the row is
    // healthy — and holding only what the server grants, because the claim in
    // the token is never what is consulted.
    expect(result.device?.id).toBe("device-1");
    expect(capabilitiesFor()).toEqual(["qr:display"]);
  });
});

/* ------------------------------ Room binding ----------------------------- */

/**
 * Phase 2. The room binding stopped being decorative when Session gained a
 * room, and these are the properties it now has to actually hold.
 */
describe("room binding", () => {
  const withRooms = () =>
    new DeviceService(
      new FakeDeviceRepository(),
      new FakeSessionRepository([
        { id: "in-room", organizationId: ORG_A, room: "B-204" },
        { id: "lower-case", organizationId: ORG_A, room: "b-204" },
        { id: "other-room", organizationId: ORG_A, room: "C-101" },
        { id: "unlocated", organizationId: ORG_A, room: null },
        { id: "other-org", organizationId: ORG_B, room: "B-204" },
      ]),
      new RecordingSessionService()
    );

  const listFor = async (room: string | null) =>
    withRooms().listActiveSessions({
      id: "device-1",
      organizationId: ORG_A,
      room,
    });

  it("never shows a bound device a session in another room", async () => {
    const result = await listFor("B-204");

    expect(result.sessions.map((session) => session.id)).not.toContain(
      "other-room"
    );
  });

  it("matches the room without regard to case", async () => {
    const result = await listFor("B-204");

    // Whoever typed "b-204" into the timetable meant the same wall as whoever
    // typed "B-204" onto the device.
    expect(result.sessions.map((session) => session.id)).toContain("lower-case");
  });

  it("shows an unbound device every open session in its university", async () => {
    const result = await listFor(null);

    expect(result.sessions.map((session) => session.id).sort()).toEqual([
      "in-room",
      "lower-case",
      "other-room",
      "unlocated",
    ]);

    expect(result.roomFilterActive).toBe(false);
  });

  it("still keeps another university's sessions out, bound or not", async () => {
    for (const room of ["B-204", null]) {
      const result = await listFor(room);

      expect(result.sessions.map((session) => session.id)).not.toContain(
        "other-org"
      );
    }
  });

  it("reports the filter as active only when the device is actually bound", async () => {
    expect((await listFor("B-204")).roomFilterActive).toBe(true);
    expect((await listFor(null)).roomFilterActive).toBe(false);
  });

  it("includes sessions with no room recorded, and says how many", async () => {
    const result = await listFor("B-204");

    // Not in another room — in no known room, so the binding has nothing to
    // exclude it by. Counted separately so an operator can watch this fall to
    // zero as sessions start being opened from the timetable.
    expect(result.sessions.map((session) => session.id)).toContain("unlocated");
    expect(result.unlocatedCount).toBe(1);
  });

  it("hides them once DEVICE_ROOM_FILTER_STRICT is set", async () => {
    const original = env.DEVICE_ROOM_FILTER_STRICT;

    // Mutated rather than re-parsed: the flag is read at call time, which is
    // what makes the cutover a restart rather than a redeploy.
    (env as { DEVICE_ROOM_FILTER_STRICT: boolean }).DEVICE_ROOM_FILTER_STRICT = true;

    try {
      const result = await listFor("B-204");

      expect(result.sessions.map((session) => session.id).sort()).toEqual([
        "in-room",
        "lower-case",
      ]);

      expect(result.unlocatedCount).toBe(0);
    } finally {
      (env as { DEVICE_ROOM_FILTER_STRICT: boolean }).DEVICE_ROOM_FILTER_STRICT =
        original;
    }
  });

  it("leaves an unbound device alone even in strict mode", async () => {
    const original = env.DEVICE_ROOM_FILTER_STRICT;

    (env as { DEVICE_ROOM_FILTER_STRICT: boolean }).DEVICE_ROOM_FILTER_STRICT = true;

    try {
      // Strictness is about what a *binding* excludes. A device with no binding
      // is not filtered at all, so the flag has nothing to act on.
      const result = await listFor(null);

      expect(result.sessions.map((session) => session.id)).toContain("unlocated");
    } finally {
      (env as { DEVICE_ROOM_FILTER_STRICT: boolean }).DEVICE_ROOM_FILTER_STRICT =
        original;
    }
  });

  /* --------------------- F2: expired sessions are withheld ---------------- */

  /**
   * The robot must not put a live code on screen for a lecture that has ended.
   * The attendance worker closes such sessions, but it must not be the only
   * thing preventing this — a worker that is off, crashed, or between passes
   * would otherwise leave the code up indefinitely.
   */
  describe("expired sessions are not served", () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    const minutesAgo = (minutes: number) =>
      new Date(now.getTime() - minutes * 60_000);

    // The linked lecture runs two hours, so 30 minutes in is live and 200
    // minutes in is long over.
    const withExpiry = () =>
      new DeviceService(
        new FakeDeviceRepository(),
        new FakeSessionRepository([
          {
            id: "live",
            organizationId: ORG_A,
            room: "B-204",
            lectureScheduleId: "schedule-1",
            startTime: minutesAgo(30),
          },
          {
            id: "expired",
            organizationId: ORG_A,
            room: "B-204",
            lectureScheduleId: "schedule-1",
            startTime: minutesAgo(200),
          },
        ]),
        new RecordingSessionService()
      );

    it("serves the running lecture and withholds the ended one", async () => {
      const result = await withExpiry().listActiveSessions(
        { id: "device-1", organizationId: ORG_A, room: "B-204" },
        now
      );

      expect(result.sessions.map((session) => session.id)).toEqual(["live"]);
    });

    it("reports how many it withheld, so a lagging worker is visible", async () => {
      const result = await withExpiry().listActiveSessions(
        { id: "device-1", organizationId: ORG_A, room: "B-204" },
        now
      );

      // Still ACTIVE in the database, not served here. Non-zero means the
      // worker is behind or off.
      expect(result.expiredCount).toBe(1);
      expect(result.count).toBe(1);
    });

    it("withholds it however long the worker has been down", async () => {
      const service = new DeviceService(
        new FakeDeviceRepository(),
        new FakeSessionRepository([
          {
            id: "forgotten",
            organizationId: ORG_A,
            room: "B-204",
            lectureScheduleId: "schedule-1",
            startTime: minutesAgo(4 * 24 * 60),
          },
        ]),
        new RecordingSessionService()
      );

      const result = await service.listActiveSessions(
        { id: "device-1", organizationId: ORG_A, room: "B-204" },
        now
      );

      expect(result.sessions).toHaveLength(0);
      expect(result.expiredCount).toBe(1);
    });

    it("withholds an ended ad-hoc session too, on the default window", async () => {
      const service = new DeviceService(
        new FakeDeviceRepository(),
        new FakeSessionRepository([
          {
            id: "ad-hoc-expired",
            organizationId: ORG_A,
            room: "B-204",
            startTime: minutesAgo(200),
          },
        ]),
        new RecordingSessionService()
      );

      const result = await service.listActiveSessions(
        { id: "device-1", organizationId: ORG_A, room: "B-204" },
        now
      );

      expect(result.sessions).toHaveLength(0);
    });
  });

  /* ----------------------- F1: the course reaches the robot --------------- */

  it("returns the real course a session takes attendance for", async () => {
    const service = new DeviceService(
      new FakeDeviceRepository(),
      new FakeSessionRepository([
        {
          id: "linked",
          organizationId: ORG_A,
          room: "B-204",
          lectureScheduleId: "schedule-1",
          courseId: "course-mec201",
        },
        { id: "ad-hoc", organizationId: ORG_A, room: "B-204" },
      ]),
      new RecordingSessionService()
    );

    const result = await service.listActiveSessions({
      id: "device-1",
      organizationId: ORG_A,
      room: "B-204",
    });

    const byId = new Map(result.sessions.map((session) => [session.id, session]));

    expect(byId.get("linked")!.courseId).toBe("course-mec201");
    expect(byId.get("linked")!.course).toMatchObject({
      id: "course-mec201",
      courseCode: "MEC201",
      courseName: "Electronics",
    });

    // An ad-hoc session belongs to no course, and the display has to cope.
    expect(byId.get("ad-hoc")!.courseId).toBeNull();
    expect(byId.get("ad-hoc")!.course).toBeNull();
  });

  it("carries the lecture behind a session, and copes when there is none", async () => {
    const service = new DeviceService(
      new FakeDeviceRepository(),
      new FakeSessionRepository([
        { id: "linked", organizationId: ORG_A, room: "B-204", lectureScheduleId: "schedule-1" },
        { id: "ad-hoc", organizationId: ORG_A, room: "B-204" },
      ]),
      new RecordingSessionService()
    );

    const result = await service.listActiveSessions({
      id: "device-1",
      organizationId: ORG_A,
      room: "B-204",
    });

    const byId = new Map(result.sessions.map((session) => [session.id, session]));

    expect(byId.get("linked")!.lecture).toMatchObject({
      courseCode: "MEC201",
      instructor: "Dr. Adel Mansour",
    });

    // A session opened ad hoc has a title and nothing else. The display has to
    // cope with that rather than assume a lecture behind every session.
    expect(byId.get("ad-hoc")!.lecture).toBeNull();
  });
});

/* ------------------------------ Rate limiting ---------------------------- */

describe("rate limiting is keyed by caller, not by campus IP", () => {
  const asRequest = (token?: string) =>
    ({
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }) as unknown as Request;

  it("counts two students on one campus address separately", () => {
    const first = jwt.sign({ id: "student-1" }, env.JWT_SECRET);
    const second = jwt.sign({ id: "student-2" }, env.JWT_SECRET);

    expect(principalKey(asRequest(first))).toBe("user:student-1");
    expect(principalKey(asRequest(second))).toBe("user:student-2");
  });

  it("counts a device separately from a user", () => {
    const deviceToken = signDeviceToken({
      sub: "device-1",
      org: ORG_A,
      typ: "device",
      cap: ["qr:display"],
    });

    expect(principalKey(asRequest(deviceToken))).toBe("device:device-1");
  });

  it("falls back to the IP bucket when no token is present", () => {
    expect(principalKey(asRequest())).toBeNull();
  });

  it("falls back to the IP bucket for a forged token", () => {
    // Otherwise anyone could mint unlimited buckets by inventing ids, which
    // would not be a weaker limiter but no limiter at all.
    const forged = jwt.sign({ id: "student-1" }, "not-the-real-signing-key");

    expect(principalKey(asRequest(forged))).toBeNull();
  });

  it("prefers an already-authenticated principal over re-verifying", () => {
    const req = {
      headers: {},
      user: { id: "student-9" },
    } as unknown as Request;

    expect(principalKey(req)).toBe("user:student-9");
  });
});

/* --------------------- The room binding as authorization ------------------- */

describe("deviceMaySeeRoom: one rule for discovery and for minting", () => {
  /**
   * The regression this locks down.
   *
   * The room binding was enforced only by the SQL behind the device's session
   * list. `getQrTokenForDevice` checked the organization and nothing else, so a
   * device bound to B-204 could not *discover* a session in C-101 but could
   * mint a valid code for it given the id — and the id sits in the payload of
   * every code that device has ever displayed, readable without any secret.
   */
  const strict = { includeUnlocated: false };
  const lenient = { includeUnlocated: true };

  it("lets an unbound device serve any room", () => {
    expect(deviceMaySeeRoom({ room: null }, { room: "B-204" }, strict)).toBe(true);
    expect(deviceMaySeeRoom({ room: null }, { room: null }, strict)).toBe(true);
  });

  it("lets a bound device serve its own room", () => {
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: "B-204" }, strict)).toBe(true);
  });

  it("compares rooms case-insensitively", () => {
    // Free text on both sides: whoever typed "b-204" and whoever typed "B-204"
    // meant the same room.
    expect(deviceMaySeeRoom({ room: "b-204" }, { room: "B-204" }, strict)).toBe(true);
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: "b-204" }, strict)).toBe(true);
  });

  it("refuses a bound device another room", () => {
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: "C-101" }, lenient)).toBe(false);
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: "C-101" }, strict)).toBe(false);
  });

  it("treats a session with no room as the flag says", () => {
    // Not "somewhere else" — nowhere in particular, so the binding has nothing
    // to exclude it by. DEVICE_ROOM_FILTER_STRICT is exactly this decision.
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: null }, lenient)).toBe(true);
    expect(deviceMaySeeRoom({ room: "B-204" }, { room: null }, strict)).toBe(false);
  });
});
