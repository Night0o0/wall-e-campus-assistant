import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { DeviceStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { DeviceRepository } from "../repositories/device.repository.js";
import { forbidden, unauthorized } from "../utils/AppError.js";

/**
 * Authentication for robots and tablets.
 *
 * A device is a second kind of principal, not a second kind of user, and this
 * file is where that distinction is enforced. Four separate things keep the two
 * apart, any one of which would be enough on its own:
 *
 *   1. a different signing key, so neither token verifies against the other's;
 *   2. a `typ: "device"` claim, checked explicitly;
 *   3. a different middleware, which no user route mounts;
 *   4. a different request property, so `requireRole` — which reads req.user —
 *      can never see a device however a route is wired.
 *
 * The device row is re-read on every request. That is what makes revocation
 * immediate: the fifteen-minute token lifetime is a cache, not a security
 * window, and a device revoked one second ago fails its very next call.
 */

/** What a device principal carries once authenticated. Never a UserRole. */
export interface AuthenticatedDevice {
  id: string;
  deviceKeyId: string;
  name: string;
  organizationId: string;
  /** Optional room binding; when set, the device is confined to it. */
  room: string | null;
}

declare global {
  namespace Express {
    interface Request {
      device?: AuthenticatedDevice;
    }
  }
}

/**
 * Capabilities a device token may carry. Deliberately not roles.
 *
 * There is exactly one, and the union is written as a union of one on purpose:
 * the shape is here for the second capability, whatever it turns out to be, but
 * nothing is granted speculatively.
 *
 * `session:open` was removed rather than shipped switched off. In the approved
 * lifecycle an instructor or admin opens the attendance session and the device
 * only puts its code on screen; a permanently disabled permission would have
 * been an invitation to switch it on, and the endpoint behind it never existed.
 */
export type DeviceCapability = "qr:display";

export interface DeviceTokenPayload {
  sub: string;
  org: string;
  typ: "device";
  cap: DeviceCapability[];
}

let deviceRepo: DeviceRepository = new DeviceRepository();

/** Test seam, mirroring setPushProvider. Pass null to restore the real one. */
export const setDeviceRepository = (next: DeviceRepository | null) => {
  deviceRepo = next ?? new DeviceRepository();
};

/**
 * The capabilities an authenticated device holds right now.
 *
 * Computed at the point of use rather than read out of the token, so a token
 * minted with a longer list than the server would grant today gets no benefit
 * from it — the same reasoning as re-reading `status` on every request. That
 * every device currently gets the same list is a fact about this phase, not a
 * property of the mechanism.
 */
export const capabilitiesFor = (): DeviceCapability[] => ["qr:display"];

export const signDeviceToken = (payload: DeviceTokenPayload): string =>
  jwt.sign(payload, env.deviceJwtSecret, {
    expiresIn: `${env.DEVICE_TOKEN_TTL_MINUTES}m`,
  });

export const authenticateDevice = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    next(unauthorized("No device token provided or invalid format"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  let payload: DeviceTokenPayload;

  try {
    payload = jwt.verify(token, env.deviceJwtSecret) as DeviceTokenPayload;
  } catch {
    // A user token lands here too: it is signed with the other key, so it
    // cannot verify, and it is rejected for exactly the same reason as a forged
    // one. There is no shape of user token that authenticates as a device.
    next(unauthorized("Invalid or expired device token"));
    return;
  }

  // Belt and braces over the key separation. A token that verified but is not
  // marked as a device token is not one.
  if (payload.typ !== "device" || !payload.sub) {
    next(unauthorized("Invalid or expired device token"));
    return;
  }

  try {
    const device = await deviceRepo.findById(payload.sub);

    if (!device) {
      next(unauthorized("Device not found"));
      return;
    }

    // Re-read, not remembered. This is the whole revocation mechanism.
    if (device.status !== DeviceStatus.ACTIVE) {
      next(unauthorized("This device has been deactivated"));
      return;
    }

    // The tenant travels with the row, never with the request. A token whose
    // organization no longer matches the device's is not honoured.
    if (device.organizationId !== payload.org) {
      next(unauthorized("Invalid or expired device token"));
      return;
    }

    req.device = {
      id: device.id,
      deviceKeyId: device.deviceKeyId,
      name: device.name,
      organizationId: device.organizationId,
      room: device.room,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Capability guard. The device counterpart of `requireRole`, and deliberately a
 * separate function so the two vocabularies never mix: roles describe people,
 * capabilities describe machines.
 */
export const requireCapability = (capability: DeviceCapability) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.device) {
      next(unauthorized());
      return;
    }

    if (!capabilitiesFor().includes(capability)) {
      next(forbidden("This device is not permitted to perform that action"));
      return;
    }

    next();
  };
};
