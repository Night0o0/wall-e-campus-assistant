import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

export const departmentQuerySchema = paginationSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const createDepartmentSchema = z.object({
  code: z.string().trim().min(2).max(20).toUpperCase(),
  name: z.string().trim().min(2).max(120),
});

export const updateDepartmentSchema = z
  .object({
    code: z.string().trim().min(2).max(20).toUpperCase().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type DepartmentQuery = z.infer<typeof departmentQuerySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
