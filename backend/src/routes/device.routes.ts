import { Router } from "express";
import {
  authenticateDevice,
  requireCapability,
} from "../middleware/device.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { deviceAuthSchema } from "../types/device.types.js";
import {
  authenticateDeviceCredentials,
  getMyActiveSessions,
  getMyDevice,
  getMySessionQr,
} from "../controllers/device.controller.js";
import { deviceAuthLimiter } from "../utils/rate-limit.js";

const router = Router();

/**
 * The robot/tablet surface.
 *
 * Note which middleware guards this file: `authenticateDevice`, never
 * `authenticate`. No route below can be reached by a user token, and no route
 * anywhere else can be reached by a device token — the two principals are
 * signed with different keys and land on different request properties, so
 * `requireRole` cannot see a device and `requireCapability` cannot see a user.
 *
 * There is no `/api/devices/me/sessions` POST here, and there is no capability
 * that could unlock one. Opening an attendance session is a human act in the
 * approved lifecycle: an instructor or admin opens it, the robot authenticates
 * as a device, reads the active session and displays its code. The
 * `session:open` capability was deleted outright rather than shipped switched
 * off — a permanently disabled permission is an invitation to enable it — and
 * `Session.createdById` is in any case a non-nullable foreign key to User,
 * which a device principal cannot satisfy.
 *
 * So the surface here is exactly four things: authenticate, report status, read
 * the active sessions this device is entitled to, display a code for one.
 */

// Credential exchange. The only route in the file without a device token,
// because it is the one that issues them. IP-keyed limiter: nobody has proved
// who they are yet, which is precisely when per-IP limiting is the right tool.
router.post(
  "/auth",
  deviceAuthLimiter,
  validate(deviceAuthSchema),
  authenticateDeviceCredentials
);

// Everything below carries a device token, and re-reads the device row.
router.use(authenticateDevice);

router.get("/me", getMyDevice);

router.get(
  "/me/sessions/active",
  requireCapability("qr:display"),
  getMyActiveSessions
);

router.get(
  "/me/sessions/:id/qr",
  requireCapability("qr:display"),
  getMySessionQr
);

export default router;
