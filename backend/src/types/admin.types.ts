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
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
