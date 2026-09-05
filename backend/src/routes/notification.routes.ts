import { Router } from "express";
import { env } from "../config/env.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import {
  deactivateDeviceSchema,
  generateRemindersSchema,
  notificationQuerySchema,
  registerDeviceSchema,
  simulateReminderSchema,
} from "../types/notification.types.js";
import {
  deactivateDevice,
  dispatchNow,
  generateReminders,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  registerDevice,
  simulateReminders,
} from "../controllers/notification.controller.js";

const router = Router();
router.param("id", validateUuidParam("id"));

router.use(authenticate);

/**
 * The inbox is self-service for every role: a notification belongs to the
 * person it was addressed to, and that is the only person who can read it or
 * mark it read. There is no role check because there is nothing to escalate to
 * — the scoping is on the caller's own id inside NotificationService.
 */
router.get("/", validateQuery(notificationQuerySchema), getNotifications);
router.get("/unread-count", getUnreadCount);

// Declared before "/:id/read" only for readability; the two patterns have a
// different number of segments and cannot collide.
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

// Push registration for the future mobile client. Nothing delivers to these
// yet; see PushNotificationProvider.
router.post("/device-tokens", validate(registerDeviceSchema), registerDevice);
router.patch(
  "/device-tokens/deactivate",
  validate(deactivateDeviceSchema),
  deactivateDevice
);

/**
 * Simulation. These routes create and deliver real reminders on demand, so they
 * are gated twice over:
 *
 *  - the whole block is unmounted unless env.devToolsEnabled, which is forced
 *    off in production regardless of what NOTIFICATION_DEV_TOOLS says, so in
 *    production these paths 404 like any other unknown route;
 *  - and where they do exist, only a university's super admin (or the platform
 *    owner) may call them — never a plain admin, never a student.
 *
 * Simulation is still confined to the caller's own organization.
 */
if (env.devToolsEnabled) {
  const canSimulate = requireRole("UNIVERSITY_ADMIN", "SYSTEM_OWNER");

  router.post(
    "/dev/generate",
    canSimulate,
    validate(generateRemindersSchema),
    generateReminders
  );

  router.post(
    "/dev/simulate",
    canSimulate,
    validate(simulateReminderSchema),
    simulateReminders
  );

  router.post("/dev/dispatch", canSimulate, dispatchNow);
}

export default router;
