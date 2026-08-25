import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { DeviceStatus } from "@prisma/client";
import { DeviceRepository, SafeDevice } from "../repositories/device.repository.js";
import { SessionRepository } from "../repositories/session.repository.js";
import { SessionService } from "./session.service.js";
import {
  CreateDeviceInput,
  DeviceQuery,
  UpdateDeviceInput,
} from "../types/device.types.js";
import { env } from "../config/env.js";
import { sessionWindowConfig } from "../config/attendance.config.js";
import { isScannable } from "../utils/session-window.js";
import { deviceMaySeeRoom } from "../utils/device-room-access.js";
import { conflict, notFound, unauthorized } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";
import {
  capabilitiesFor,
  signDeviceToken,
} from "../middleware/device.middleware.js";

/**
 * Robot and tablet credentials: provisioning them, exchanging them, and taking
 * them away again.
 *
 * The credential is deliberately boring — a random secret, bcrypt at rest,
 * exchanged for a short access token. What makes it safe is not the exchange
 * but the two properties around it: the plaintext exists exactly once, in the
 * provisioning response, and the stored row is consulted on every request so
 * revocation is immediate rather than eventual.
 */

const SALT_ROUNDS = 10;

/** Just enough of the authenticated super admin to scope and attribute a write. */
export interface DeviceActor {
  id: string;
  role: string;
  organizationId: string;
}

const generateKeyId = () => `dev_${randomBytes(12).toString("hex")}`;

/** 32 bytes of entropy. Long enough that guessing is not a threat model. */
const generateSecret = () => randomBytes(32).toString("base64url");

export class DeviceService {
  constructor(
    private readonly devices = new DeviceRepository(),
    private readonly sessions = new SessionRepository(),
    private readonly sessionService = new SessionService()
  ) {}

  /* ---------------------------- Authentication ---------------------------- */

  /**
   * Exchanges a device credential for a short-lived access token.
   *
   * Every failure answers the same way. A caller cannot learn whether a key id
   * exists, whether it was the secret that was wrong, or whether the device was
   * suspended rather than never created — which is the same reasoning that
   * makes AuthService answer "Invalid email or password" to both halves.
   */
  async authenticate(
    input: { deviceKeyId: string; deviceSecret: string },
    context: { ipAddress: string | null; now?: Date }
  ) {
    const device = await this.devices.findByKeyId(input.deviceKeyId);

    if (!device) {
      // Hash a throwaway value so a missing key id does not answer measurably
      // faster than a wrong secret.
      await bcrypt.compare(input.deviceSecret, `$2b$${SALT_ROUNDS}$${"x".repeat(53)}`);
      throw unauthorized("Invalid device credentials");
    }

    const matches = await bcrypt.compare(input.deviceSecret, device.secretHash);

    if (!matches) {
      throw unauthorized("Invalid device credentials");
    }

    if (device.status !== DeviceStatus.ACTIVE) {
      throw unauthorized("This device has been deactivated");
    }

    const touched = await this.devices.touch(
      device.id,
      context.now ?? new Date(),
      context.ipAddress
    );

    const capabilities = capabilitiesFor();

    const token = signDeviceToken({
      sub: device.id,
      org: device.organizationId,
      typ: "device",
      cap: capabilities,
    });

    return {
      token,
      // Seconds, so a client can schedule its refresh without parsing the JWT.
      expiresIn: 60 * env.DEVICE_TOKEN_TTL_MINUTES,
      device: this.presentSelf(touched, capabilities),
    };
  }

  /** The device's own view of itself, for a status screen. */
  async describeSelf(deviceId: string) {
    const device = await this.devices.findById(deviceId);

    if (!device) {
      throw notFound("Device not found");
    }

    return this.presentSelf(device, capabilitiesFor());
  }

  /* ------------------------- Device-facing sessions ------------------------ */

  /**
   * The attendance sessions this device may currently display a code for.
   *
   * Two filters, and neither can substitute for the other.
   *
   * The tenant is not an argument: it is read off the device's own row, so a
   * device cannot ask about another university's sessions because it has no way
   * to name one. That is the isolation boundary and it is unconditional.
   *
   * The room binding narrows things further, and only further. A device bound
   * to B-204 never sees a session in C-101 — that is the point of bolting a
   * tablet to a wall. What it does with a session whose room is null is the one
   * judgment call: such a session is not somewhere else, it is nowhere in
   * particular, so a binding has nothing to exclude it by. They stay visible by
   * default and are counted separately below, so an operator can watch that
   * number fall to zero as sessions start being opened from the timetable —
   * and then set DEVICE_ROOM_FILTER_STRICT, after which the binding is total.
   */
  async listActiveSessions(
    device: {
      id: string;
      organizationId: string;
      room: string | null;
    },
    now: Date = new Date()
  ) {
    const roomFilterActive = Boolean(device.room);
    const includeUnlocated = !env.DEVICE_ROOM_FILTER_STRICT;

    const open = await this.sessions.findActiveByOrganization(
      device.organizationId,
      { room: device.room, includeUnlocated }
    );

    /**
     * `status = ACTIVE` is not the same as "scannable", and the difference is
     * what this filter exists for. A session whose lecture has ended is still
     * ACTIVE until something closes it — so without this, a robot would keep a
     * live code on screen for a lecture that finished, and anybody scanning it
     * would be recorded as having attended.
     *
     * The attendance worker closes such sessions, but it must not be the only
     * thing standing between an expired lecture and a fresh attendance record:
     * a worker that is switched off, crashed, or simply between passes would
     * otherwise leave the code up indefinitely. So the window is enforced here,
     * on the read, against the same `isScannable` the scan path itself uses —
     * one definition, so what the robot displays and what the server will
     * accept can never disagree.
     */
    const sessions = open.filter(
      (session) =>
        /**
         * The room rule again, in memory, over the SQL that already applied
         * it. Redundant by design and cheap: it is the same predicate the mint
         * path enforces, so listing and minting answer from one definition
         * rather than from a WHERE clause and a service check that have to be
         * kept in step by hand. If the two ever disagree, this is what makes
         * the list — not the mint — the one that gives way.
         */
        deviceMaySeeRoom(device, session, { includeUnlocated }) &&
        isScannable(session, now, sessionWindowConfig)
    );

    const presented = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      status: session.status,
      startTime: session.startTime,
      courseId: session.courseId,
      /**
       * The course this session takes attendance for, copied onto the session
       * from its lecture when it was opened. Null for an ad-hoc session, which
       * belongs to no course.
       */
      course: session.course
        ? {
            id: session.course.id,
            courseCode: session.course.courseCode,
            courseName: session.course.courseName,
          }
        : null,
      room: session.room,
      lectureScheduleId: session.lectureScheduleId,
      /**
       * What the robot puts on screen beside the code. Null for an ad-hoc
       * session, which has a title and nothing else — the display has to cope
       * with that rather than assume a lecture behind every session.
       */
      lecture: session.lectureSchedule
        ? {
            id: session.lectureSchedule.id,
            courseCode: session.lectureSchedule.course.courseCode,
            courseName: session.lectureSchedule.course.courseName,
            instructor: session.lectureSchedule.instructor.fullName,
            startTime: session.lectureSchedule.startTime,
            endTime: session.lectureSchedule.endTime,
          }
        : null,
      attendanceCount: session._count.attendances,
    }));

    return {
      room: device.room,
      roomFilterActive,
      /**
       * How many of these carry no room. Zero on a fully migrated campus; while
       * it is not zero, it is the number of sessions the binding is not
       * actually constraining, which is worth an operator being able to see
       * rather than having to infer.
       */
      unlocatedCount: roomFilterActive
        ? presented.filter((session) => session.room === null).length
        : 0,
      /**
       * Sessions still marked ACTIVE whose lecture has ended, withheld from
       * this response. Non-zero means the attendance worker is behind or off —
       * they are not being served, but somebody should know they are piling up.
       */
      expiredCount: open.length - sessions.length,
      count: presented.length,
      sessions: presented,
    };
  }

  /**
   * A rotating QR token for one session.
   *
   * Delegates to SessionService rather than reimplementing the checks, so the
   * device path and the staff path cannot drift apart: the same code decides
   * that a session belongs to this tenant and is still open.
   */
  /**
   * The room binding travels with this call.
   *
   * It used to pass only the organization, which made the binding a display
   * filter rather than an authorization boundary: a device could not list a
   * session in another room but could mint a code for it given the id. The
   * whole device goes through now, and the same predicate discovery uses
   * decides it.
   */
  async issueQrToken(
    device: { organizationId: string; room: string | null },
    sessionId: string
  ) {
    return this.sessionService.getQrTokenForDevice(device, sessionId);
  }

  /* ------------------------------ Provisioning ---------------------------- */

  /**
   * Creates a device and returns its secret — the only time it is ever
   * readable. Everything after this point sees the bcrypt hash.
   */
  async provision(input: CreateDeviceInput, actor: DeviceActor) {
    const deviceKeyId = generateKeyId();
    const deviceSecret = generateSecret();

    const device = await this.devices.create({
      organizationId: actor.organizationId,
      name: input.name,
      room: input.room ?? null,
      deviceKeyId,
      secretHash: await bcrypt.hash(deviceSecret, SALT_ROUNDS),
      createdById: actor.id,
    });

    return {
      device: this.present(device),
      credentials: {
        deviceKeyId,
        deviceSecret,
        warning:
          "Store this secret now — it is hashed on the server and cannot be shown again. Use POST /api/admin/devices/:id/rotate-secret to issue a new one.",
      },
    };
  }

  /**
   * Issues a fresh secret and invalidates the old one.
   *
   * Access tokens already handed out stay valid until they expire, which is at
   * most DEVICE_TOKEN_TTL_MINUTES. Rotation is for replacing a credential in
   * the ordinary course of things; to cut a device off now, revoke it.
   */
  async rotateSecret(id: string, actor: DeviceActor) {
    const existing = await this.loadInOrg(id, actor);

    if (existing.status === DeviceStatus.REVOKED) {
      throw conflict("This device has been revoked — provision a new one");
    }

    const deviceSecret = generateSecret();

    await this.devices.updateInOrganization(id, actor.organizationId, {
      secretHash: await bcrypt.hash(deviceSecret, SALT_ROUNDS),
    });

    return {
      device: this.present(existing),
      credentials: {
        deviceKeyId: existing.deviceKeyId,
        deviceSecret,
        warning:
          "The previous secret stopped working immediately. Store this one now — it cannot be shown again.",
      },
    };
  }

  /* -------------------------------- Console ------------------------------- */

  async list(query: DeviceQuery, actor: DeviceActor) {
    const { data, total } = await this.devices.findManyInOrganization(
      actor.organizationId,
      { status: query.status, search: query.search },
      query
    );

    return paginate(data.map((device) => this.present(device)), total, query);
  }

  async get(id: string, actor: DeviceActor) {
    return this.present(await this.loadInOrg(id, actor));
  }

  async update(id: string, input: UpdateDeviceInput, actor: DeviceActor) {
    const existing = await this.loadInOrg(id, actor);

    // A revoked credential is finished. Letting it be edited back to ACTIVE
    // would turn revocation into a suspension, which is not what it means.
    if (existing.status === DeviceStatus.REVOKED) {
      throw conflict("This device has been revoked and cannot be modified");
    }

    await this.devices.updateInOrganization(id, actor.organizationId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.room !== undefined ? { room: input.room } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    return this.present(await this.loadInOrg(id, actor));
  }

  /**
   * Terminal. The row survives — it is the audit record of a credential that
   * once existed and who ended it — but no token minted from it is ever
   * honoured again, starting with the device's next request.
   */
  async revoke(id: string, reason: string | undefined, actor: DeviceActor) {
    const existing = await this.loadInOrg(id, actor);

    if (existing.status === DeviceStatus.REVOKED) {
      return this.present(existing);
    }

    await this.devices.updateInOrganization(id, actor.organizationId, {
      status: DeviceStatus.REVOKED,
      revokedAt: new Date(),
      revokedById: actor.id,
      revokedReason: reason ?? "Revoked by an administrator",
    });

    return this.present(await this.loadInOrg(id, actor));
  }

  /* ------------------------------ Internals ------------------------------- */

  /**
   * Same answer for "no such device" and "belongs to another university", so
   * the console cannot be used to discover that an id exists elsewhere.
   */
  private async loadInOrg(id: string, actor: DeviceActor) {
    const device = await this.devices.findByIdInOrganization(
      id,
      actor.organizationId
    );

    if (!device) {
      throw notFound("Device not found");
    }

    return device;
  }

  /** The console projection. Carries no secret, by construction. */
  private present(device: SafeDevice) {
    return {
      id: device.id,
      organizationId: device.organizationId,
      name: device.name,
      room: device.room,
      deviceKeyId: device.deviceKeyId,
      status: device.status,
      capabilities: capabilitiesFor(),
      lastSeenAt: device.lastSeenAt,
      lastIpAddress: device.lastIpAddress,
      revokedAt: device.revokedAt,
      revokedReason: device.revokedReason,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }

  /** The narrower projection a device gets of itself. */
  private presentSelf(device: SafeDevice, capabilities: string[]) {
    return {
      id: device.id,
      name: device.name,
      room: device.room,
      organizationId: device.organizationId,
      status: device.status,
      capabilities,
    };
  }
}

/** Exported for tests that need to assert the shape of a generated credential. */
export const __testing = { generateKeyId, generateSecret };
