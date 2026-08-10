import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may only contain letters, numbers, - and _")
    .transform((value) => value.toUpperCase()),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  logo: z.string().url().optional().or(z.literal("")),

  // Optionally provision the university's first super admin in the same call.
  admin: z
    .object({
      universityId: z.string().min(3).max(50),
      fullName: z.string().min(3).max(120),
      email: z.string().email(),
      password: z.string().min(8, "Password must be at least 8 characters"),
    })
    .optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  logo: z.string().url().optional().or(z.literal("")),
});

export const organizationQuerySchema = paginationSchema.extend({
  status: z
    .enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED", "NONE"])
    .optional(),
  planId: z.string().uuid().optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
