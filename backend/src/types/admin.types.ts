import { ProfileStatus } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Query schemas for the university administration console.
 *
 * Note what is absent, and why it is absent rather than merely optional:
 * `organizationId`. The platform-owner schema in user.types.ts accepts one,
 * because the owner is legitimately allowed to browse any tenant. A university
 * super admin is not, so the field does not exist here at all — Zod strips
 * unknown keys, which means `?organizationId=<another-university>` never
 * survives validation and can never reach a repository. The tenant is taken
 * from the authenticated user instead; see AdminService.
 */

/** SYSTEM_OWNER is deliberately not offered: it is a platform role, not a campus one. */
const campusRoleEnum = z.enum([
  "UNIVERSITY_SUPER_ADMIN",
  "ADMIN",
  "STUDENT",
]);

export const adminUserQuerySchema = paginationSchema.extend({
  role: campusRoleEnum.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  /** Filters students by whether they have finished their academic profile. */
  profileStatus: z.nativeEnum(ProfileStatus).optional(),
  /** Filters by approval state — see requireApproved in auth.middleware.ts. */
  isVerified: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

/**
 * The approval queue.
 *
 * Neither `role` nor `isVerified` is offered: this endpoint answers exactly one
 * question — which students are waiting — and both values are fixed by the
 * service. Accepting either would turn a purpose-built queue into a second,
 * subtly different copy of the directory.
 */
export const pendingStudentQuerySchema = paginationSchema.extend({
  profileStatus: z.nativeEnum(ProfileStatus).optional(),
});

export type PendingStudentQuery = z.infer<typeof pendingStudentQuerySchema>;

/**
 * Accounts a university may create for itself.
 *
 * SYSTEM_OWNER is absent because it is a platform role, not a campus one, and
 * UNIVERSITY_SUPER_ADMIN is absent because a super admin creating another super
 * admin is a privilege escalation with no ceiling — the role that administers a
 * university is granted by the platform owner through /api/users, and by nobody
 * else. What remains is the staff and students a university actually staffs
 * itself with.
 */
const creatableRoleEnum = z.enum(["ADMIN", "STUDENT"]);

export const createCampusUserSchema = z
  .object({
    universityId: z.string().trim().min(4).max(50),
    fullName: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: creatableRoleEnum,
    /**
     * Required for an ADMIN and rejected for a STUDENT: AdminProfile.jobTitle
     * is non-nullable, and it is where the academic title lives — "Dr.",
     * "Eng.", "Prof." — because there is no separate professor role.
     */
    jobTitle: z.string().trim().min(2).max(100).optional(),
    office: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.role !== "ADMIN" || Boolean(data.jobTitle), {
    message: "jobTitle is required when creating an ADMIN",
    path: ["jobTitle"],
  })
  .refine((data) => data.role === "ADMIN" || !data.jobTitle, {
    message: "jobTitle only applies to an ADMIN",
    path: ["jobTitle"],
  });

export type CreateCampusUserInput = z.infer<typeof createCampusUserSchema>;

/**
 * Note what cannot be changed here: `role` and `organizationId`. Moving an
 * account between roles or universities is not an edit, it is a different
 * account — and a role field on this schema would be the shortest path from
 * "edit a student" to "mint a super admin".
 */
export const updateCampusUserSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    isActive: z.boolean().optional(),
    jobTitle: z.string().trim().min(2).max(100).optional(),
    office: z.string().trim().max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateCampusUserInput = z.infer<typeof updateCampusUserSchema>;

export const resetCampusPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetCampusPasswordInput = z.infer<
  typeof resetCampusPasswordSchema
>;
