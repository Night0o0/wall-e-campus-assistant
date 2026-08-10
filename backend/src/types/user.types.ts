import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

const roleEnum = z.enum([
  "SYSTEM_OWNER",
  "UNIVERSITY_SUPER_ADMIN",
  "ADMIN",
  "STUDENT",
]);

export const createUserSchema = z.object({
  universityId: z.string().min(3, "University ID must be at least 3 characters").max(50),
  fullName: z.string().min(3, "Full name must be at least 3 characters").max(120),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: roleEnum.default("ADMIN"),
  organizationId: z.string().uuid("A valid organization is required"),
  isVerified: z.boolean().default(false),
});

export const updateUserSchema = z
  .object({
    fullName: z.string().min(3).max(120).optional(),
    email: z.string().email().optional(),
    role: roleEnum.optional(),
    isVerified: z.boolean().optional(),
    isActive: z.boolean().optional(),
    organizationId: z.string().uuid().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const resetUserPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const userQuerySchema = paginationSchema.extend({
  role: roleEnum.optional(),
  organizationId: z.string().uuid().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().min(3).max(120).optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
