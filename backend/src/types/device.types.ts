import { DeviceStatus } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Note what is absent from every schema here, and that its absence is the
 * safeguard rather than a validation rule: `organizationId`. A device inherits
 * the tenant of the super admin who provisioned it, and thereafter carries it
 * on its own row. Zod strips unknown keys, so an organizationId in a request
 * body cannot survive validation and can never reach a repository.
 */

export const deviceAuthSchema = z.object({
  deviceKeyId: z.string().trim().min(8, "deviceKeyId is required").max(128),
  deviceSecret: z.string().min(20, "deviceSecret is required").max(512),
});

/**
 * Note also what is absent: `canOpenSessions`. A device does not open
 * attendance sessions — an instructor or admin does, and the device displays
 * the code for what they opened. The column survives on the model as an inert
 * remnant of the approved M1 migration, but no request body can reach it.
 */
export const createDeviceSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  /**
   * Confines the device to one room, matched case-insensitively against
   * Session.room. Strongly recommended for fixed installs: without it the
   * device will display the code for any open session in the university.
   */
  room: z.string().trim().min(1).max(50).optional(),
});

export const updateDeviceSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    /** Explicit null clears the binding and frees the device to any room. */
    room: z.string().trim().min(1).max(50).nullable(),
    /**
     * ACTIVE and SUSPENDED only. Revocation is terminal and goes through its own
     * endpoint so it cannot be reached by a stray PATCH, and PENDING is a
     * provisioning state that nothing hands back to.
     */
    status: z.enum([DeviceStatus.ACTIVE, DeviceStatus.SUSPENDED]),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const revokeDeviceSchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .default({});

export const deviceQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(DeviceStatus).optional(),
});

export type DeviceAuthInput = z.infer<typeof deviceAuthSchema>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type RevokeDeviceInput = z.infer<typeof revokeDeviceSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;
