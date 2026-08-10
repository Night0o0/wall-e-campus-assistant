import {
  DevicePlatform,
  NotificationStatus,
  NotificationType,
} from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Note what is absent from every schema here: userId and organizationId. The
 * inbox is always the authenticated caller's, taken from the token-backed user
 * record — an id in the body or the query string is not read anywhere.
 */

export const notificationQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(NotificationStatus).optional(),
  type: z.nativeEnum(NotificationType).optional(),
  unreadOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(10, "A device token is required").max(512),
  platform: z.nativeEnum(DevicePlatform, {
    errorMap: () => ({
      message: `platform must be one of: ${Object.values(DevicePlatform).join(", ")}`,
    }),
  }),
});

export const deactivateDeviceSchema = z.object({
  token: z.string().trim().min(10, "A device token is required").max(512),
});

/**
 * Development-only simulation input. `lectureScheduleId` is required: this
 * endpoint fires reminders at real people, so it fires them for one lecture the
 * caller has named, never for "whatever is upcoming".
 */
export const simulateReminderSchema = z.object({
  lectureScheduleId: z.string().uuid("lectureScheduleId must be a valid id"),
  /** Omitted means all three rules. */
  types: z.array(z.nativeEnum(NotificationType)).min(1).optional(),
  /** Deliver in the same request instead of waiting for the next poll. */
  deliverNow: z.boolean().default(true),
});

/**
 * Defaulted rather than merely optional: Express 5 leaves req.body undefined
 * when a request carries no JSON at all, and "run a generation pass now" is a
 * request with nothing to say.
 */
export const generateRemindersSchema = z
  .object({
    horizonMinutes: z.number().int().min(1).max(20160).optional(),
  })
  .default({});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type DeactivateDeviceInput = z.infer<typeof deactivateDeviceSchema>;
export type SimulateReminderInput = z.infer<typeof simulateReminderSchema>;
export type GenerateRemindersInput = z.infer<typeof generateRemindersSchema>;
