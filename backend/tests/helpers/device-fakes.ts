import {
  DayOfWeek,
  DeviceStatus,
  Prisma,
  SessionCloseReason,
  SessionStatus,
} from "@prisma/client";
import {
  DeviceListFilter,
  DeviceRepository,
  SafeDevice,
} from "../../src/repositories/device.repository.js";
import { SessionRepository } from "../../src/repositories/session.repository.js";
import { SessionService } from "../../src/services/session.service.js";

/**
 * In-memory stand-ins for the device and session repositories.
 *
 * Each extends the repository it replaces, so it is the real type as far as the
 * service is concerned and any method left un-overridden would try to reach
 * Postgres and fail loudly — the same contract the notification and export
 * doubles are written to.
 */

export const ORG_A = "org-a";
export const ORG_B = "org-b";

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export interface DeviceOptions {
  id?: string;
  organizationId?: string;
  name?: string;
  room?: string | null;
  deviceKeyId?: string;
  /** bcrypt hash. Tests that exercise the credential path supply a real one. */
  secretHash?: string;
  status?: DeviceStatus;
  createdById?: string;
}

type StoredDevice = SafeDevice & { secretHash: string };

export const makeDevice = (options: DeviceOptions = {}): StoredDevice => {
  const id = options.id ?? nextId("device");

  return {
    id,
    organizationId: options.organizationId ?? ORG_A,
    name: options.name ?? "Lecture Hall Robot",
    room: options.room === undefined ? "B-204" : options.room,
    deviceKeyId: options.deviceKeyId ?? `dev_${id}`,
    secretHash: options.secretHash ?? "not-a-real-hash",
    status: options.status ?? DeviceStatus.ACTIVE,
    lastSeenAt: null,
    lastIpAddress: null,
    createdById: options.createdById ?? "admin-1",
    revokedAt: null,
    revokedById: null,
    revokedReason: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
};

const strip = (device: StoredDevice): SafeDevice => {
  const { secretHash: _secretHash, ...safe } = device;
  return safe;
};

export class FakeDeviceRepository extends DeviceRepository {
  readonly rows = new Map<string, StoredDevice>();

  constructor(seed: StoredDevice[] = []) {
    super();
    for (const device of seed) {
      this.rows.set(device.id, device);
    }
  }

  override async create(data: {
    organizationId: string;
    name: string;
    room: string | null;
    deviceKeyId: string;
    secretHash: string;
    createdById: string;
  }): Promise<SafeDevice> {
    const device = makeDevice({ ...data, id: nextId("device") });
    this.rows.set(device.id, device);
    return strip(device);
  }

  override async findById(id: string): Promise<SafeDevice | null> {
    const device = this.rows.get(id);
    return device ? strip(device) : null;
  }

  override async findByIdInOrganization(
    id: string,
    organizationId: string
  ): Promise<SafeDevice | null> {
    const device = this.rows.get(id);

    return device && device.organizationId === organizationId
      ? strip(device)
      : null;
  }

  override async findByKeyId(deviceKeyId: string) {
    const device = [...this.rows.values()].find(
      (row) => row.deviceKeyId === deviceKeyId
    );

    return device ? { ...device } : null;
  }

  override async findManyInOrganization(
    organizationId: string,
    filter: DeviceListFilter,
    page: { page: number; limit: number; sortBy?: string; sortOrder: "asc" | "desc" }
  ) {
    const matched = [...this.rows.values()].filter(
      (row) =>
        row.organizationId === organizationId &&
        (filter.status === undefined || row.status === filter.status)
    );

    const start = (page.page - 1) * page.limit;

    return {
      data: matched.slice(start, start + page.limit).map(strip),
      total: matched.length,
    };
  }

  override async updateInOrganization(
    id: string,
    organizationId: string,
    data: Prisma.RobotDeviceUncheckedUpdateInput
  ) {
    const device = this.rows.get(id);

    if (!device || device.organizationId !== organizationId) {
      return 0;
    }

    this.rows.set(id, {
      ...device,
      ...(data as Partial<StoredDevice>),
      updatedAt: new Date(),
    });

    return 1;
  }

  override async touch(id: string, at: Date, ipAddress: string | null) {
    const device = this.rows.get(id);

    if (!device) {
      throw new Error(`touch called for unknown device ${id}`);
    }

    const updated = { ...device, lastSeenAt: at, lastIpAddress: ipAddress };
    this.rows.set(id, updated);

    return strip(updated);
  }
}

export interface FakeSessionRow {
  id: string;
  organizationId: string;
  title?: string;
  status?: "ACTIVE" | "CLOSED";
  qrSecret?: string;
  courseId?: string | null;
  /** Who opened it. The instructor-narrowing rule turns on this. */
  createdById?: string;
  /** Null means "unlocated" — the state every pre-Phase-2 session is in. */
  room?: string | null;
  lectureScheduleId?: string | null;
  /**
   * When attendance opened. Defaults to the moment the fake is built, which
   * makes a seeded session IN_PROGRESS: the linked lecture below runs two
   * hours. Tests of the expiry window set it explicitly.
   */
  startTime?: Date;
}

/** What the repository's schedule summary projects, for a linked session. */
const summaryFor = (lectureScheduleId: string | null) =>
  lectureScheduleId
    ? {
        id: lectureScheduleId,
        room: "B-204",
        dayOfWeek: DayOfWeek.SUNDAY,
        // Two hours. The window arithmetic in every device test rests on this.
        startTime: "10:00",
        endTime: "12:00",
        isActive: true,
        course: {
          id: "course-1",
          courseCode: "MEC201",
          courseName: "Electronics",
        },
        instructor: { id: "instructor-1", fullName: "Dr. Adel Mansour" },
      }
    : null;

/** What the repository's course summary projects. */
const courseFor = (courseId: string | null) =>
  courseId
    ? { id: courseId, courseCode: "MEC201", courseName: "Electronics" }
    : null;

export class FakeSessionRepository extends SessionRepository {
  readonly rows: Required<FakeSessionRow>[];
  /** Everything `create` was asked to write, for the linking tests. */
  readonly created: Parameters<SessionRepository["create"]>[0][] = [];

  constructor(seed: FakeSessionRow[] = []) {
    super();

    this.rows = seed.map((row) => ({
      title: "Electronics",
      status: "ACTIVE" as const,
      qrSecret: `secret-${row.id}`,
      courseId: null,
      createdById: "instructor-1",
      room: null,
      lectureScheduleId: null,
      startTime: new Date(),
      ...row,
    }));
  }

  /**
   * The row projection `findById` returns, field for field.
   *
   * Carries `createdById` and the lecture summary because both are now read by
   * the service: the first decides who may see the session, the second gives
   * `isScannable` the lecture's length.
   */
  override async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      createdById: row.createdById,
      courseId: row.courseId,
      organizationId: row.organizationId,
      lectureScheduleId: row.lectureScheduleId,
      room: row.room,
      qrSecret: row.qrSecret,
      status: row.status as SessionStatus,
      startTime: row.startTime,
      endTime: null,
      closeReason: null,
      absencesSweptAt: null,
      createdAt: row.startTime,
      createdBy: {
        id: row.createdById,
        fullName: "Dr. Adel Mansour",
        email: "adel.mansour@cu.edu.eg",
      },
      lectureSchedule: summaryFor(row.lectureScheduleId),
    };
  }

  /**
   * The two list projections, so the visibility of a LIST can be tested rather
   * than only the visibility of one session by id. The list is where the two
   * had drifted apart.
   */
  override async findByCreator(createdById: string, organizationId: string) {
    return this.rows.filter(
      (row) =>
        row.createdById === createdById && row.organizationId === organizationId
    ) as never;
  }

  override async findByOrganization(organizationId: string) {
    return this.rows.filter(
      (row) => row.organizationId === organizationId
    ) as never;
  }

  /** Enough of the close to assert what was recorded, and why. */
  override async updateStatus(
    id: string,
    status: "ACTIVE" | "CLOSED",
    endTime?: Date,
    closeReason?: SessionCloseReason
  ) {
    const row = this.rows.find((candidate) => candidate.id === id);

    if (!row) {
      throw new Error(`updateStatus called for unknown session ${id}`);
    }

    row.status = status;

    const stored = await this.findById(id);

    return {
      ...stored!,
      status: status as SessionStatus,
      endTime: endTime ?? null,
      closeReason: closeReason ?? null,
    };
  }

  /**
   * The duplicate-occurrence lookup, reimplemented rather than stubbed.
   *
   * A fake that returned nothing here would let every duplicate-session test
   * pass against a service that never applied the guard — the same reasoning
   * that makes the room filter above a real filter.
   */
  override async findOpenedForScheduleBetween(
    lectureScheduleId: string,
    organizationId: string,
    from: Date,
    to: Date
  ) {
    return this.rows
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

  /**
   * The room filter, reimplemented rather than stubbed out.
   *
   * A fake that ignored the filter would let every room test pass against a
   * service that never applied one, which is the opposite of what these tests
   * are for. So the same three rules the repository encodes are encoded here:
   * unbound sees everything, bound sees its own room compared without regard to
   * case, and an unlocated session is included only when asked for.
   */
  override async findActiveByOrganization(
    organizationId: string,
    filter: { room?: string | null; includeUnlocated?: boolean } = {}
  ) {
    const sameRoom = (room: string | null) =>
      room !== null && room.toLowerCase() === filter.room!.trim().toLowerCase();

    return this.rows
      .filter(
        (row) => row.organizationId === organizationId && row.status === "ACTIVE"
      )
      .filter((row) => {
        if (!filter.room) {
          return true;
        }

        return sameRoom(row.room) || (filter.includeUnlocated && row.room === null);
      })
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as SessionStatus,
        startTime: row.startTime,
        courseId: row.courseId,
        course: courseFor(row.courseId),
        room: row.room,
        lectureScheduleId: row.lectureScheduleId,
        lectureSchedule: summaryFor(row.lectureScheduleId),
        _count: { attendances: 0 },
      }));
  }

  /**
   * Returns the real payload shape, field for field, with no cast.
   *
   * An earlier version of this fake widened its return through `unknown`, which
   * meant a change to the repository's projection could not fail here. It can
   * now: this object is checked against `SessionRepository["create"]`'s return
   * type by the override itself.
   */
  override async create(data: Parameters<SessionRepository["create"]>[0]) {
    this.created.push(data);

    const at = new Date();
    const id = `session-${(sequence += 1)}`;

    // Written back into `rows`, so a second `createSession` against the same
    // lecture actually finds the first one. A `create` that vanished would let
    // the duplicate-occurrence guard look correct while never firing.
    this.rows.push({
      id,
      organizationId: data.organizationId,
      title: data.title,
      status: "ACTIVE",
      qrSecret: `secret-${id}`,
      courseId: data.courseId ?? null,
      createdById: data.createdById,
      room: data.room ?? null,
      lectureScheduleId: data.lectureScheduleId ?? null,
      startTime: at,
    });

    return {
      id,
      title: data.title,
      createdById: data.createdById,
      organizationId: data.organizationId,
      courseId: data.courseId ?? null,
      course: courseFor(data.courseId ?? null),
      lectureScheduleId: data.lectureScheduleId ?? null,
      lectureSchedule: summaryFor(data.lectureScheduleId ?? null),
      room: data.room ?? null,
      qrSecret: "secret",
      status: SessionStatus.ACTIVE,
      startTime: at,
      endTime: null,
      closeReason: null,
      absencesSweptAt: null,
      createdAt: at,
    };
  }
}

/**
 * Records what DeviceService asks SessionService for.
 *
 * The tenant checks inside getQrToken belong to SessionService and are tested
 * with it. What matters at this seam is narrower and worth isolating: that the
 * organization handed down is the one on the device's own row, and never
 * anything that arrived with the request.
 */
export class RecordingSessionService extends SessionService {
  readonly qrCalls: {
    sessionId: string;
    organizationId: string;
    /** Recorded so a test can prove the binding reaches the mint path. */
    room: string | null;
  }[] = [];

  /**
   * The device-facing entry point, not the user-facing one.
   *
   * That the device path goes through `getQrTokenForDevice` rather than
   * `getQrToken` is itself part of the contract: `getQrToken` applies the
   * instructor rule, which reads a `role` a device does not have. This override
   * would stop compiling if DeviceService were ever rewired to the user path.
   *
   * It takes the whole device, and that is also part of the contract now: the
   * room binding is an authorization input, not a display filter, so a
   * DeviceService that passed only the tenant would stop compiling here.
   */
  override async getQrTokenForDevice(
    device: { organizationId: string; room: string | null },
    sessionId: string
  ) {
    this.qrCalls.push({
      sessionId,
      organizationId: device.organizationId,
      room: device.room,
    });

    return { token: `qr-for-${sessionId}`, expiresIn: 30 };
  }
}
