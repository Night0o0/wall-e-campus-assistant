import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

const roleEnum = z.enum([
  "SYSTEM_OWNER",
  "UNIVERSITY_ADMIN",
  "DEPARTMENT_ADMIN",
  "INSTRUCTOR",
  "STUDENT",
]);

const carriesAdminProfile = (role: z.infer<typeof roleEnum>) =>
  role === "INSTRUCTOR" ||
  role === "DEPARTMENT_ADMIN" ||
  role === "UNIVERSITY_ADMIN";

export const createUserSchema = z
  .object({
    universityId: z.string().min(3, "University ID must be at least 3 characters").max(50),
    fullName: z.string().min(3, "Full name must be at least 3 characters").max(120),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: roleEnum.default("INSTRUCTOR"),
    organizationId: z.string().uuid("A valid organization is required"),
    departmentId: z.string().uuid("A valid department is required").optional(),
    isVerified: z.boolean().default(false),
    jobTitle: z.string().trim().min(2).max(100).optional(),
    office: z.string().trim().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const isCampusStaff = carriesAdminProfile(data.role);
    const isDepartmentScoped =
      data.role === "INSTRUCTOR" || data.role === "DEPARTMENT_ADMIN";

    if (isCampusStaff && !data.jobTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobTitle"],
        message: "jobTitle is required for university staff",
      });
    }

    if (!isCampusStaff && (data.jobTitle !== undefined || data.office !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobTitle"],
        message: "jobTitle and office only apply to university staff",
      });
    }

    if (isDepartmentScoped && !data.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departmentId"],
        message: "departmentId is required for department staff",
      });
    }
  });

export const updateUserSchema = z
  .object({
    fullName: z.string().min(3).max(120).optional(),
    email: z.string().email().optional(),
    isVerified: z.boolean().optional(),
    isActive: z.boolean().optional(),
    organizationId: z.string().uuid().optional(),
    departmentId: z.string().uuid().nullable().optional(),
  })
  .strict("Role and university ID cannot be changed after account creation")
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
