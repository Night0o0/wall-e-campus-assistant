import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

export const createAssignmentSchema = z.object({
  offeringId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(10_000).nullable().optional(),
  deadline: z.coerce.date(),
  maxScore: z.coerce.number().positive().max(100_000),
  cohortIds: z.array(z.string().uuid()).max(50).default([]),
  isPublished: z.boolean().default(false),
});

export const updateAssignmentSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    deadline: z.coerce.date().optional(),
    maxScore: z.coerce.number().positive().max(100_000).optional(),
    cohortIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const gradeAssignmentSchema = z.object({
  score: z.coerce.number().min(0).max(100_000),
  feedback: z.string().trim().max(5_000).nullable().optional(),
  publish: z.boolean().default(false),
});

export const assignmentQuerySchema = paginationSchema
  .omit({ search: true })
  .extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    search: z.string().trim().min(1).max(160).optional(),
    offeringId: z.string().uuid().optional(),
    isPublished: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sortBy: z.enum(["deadline", "createdAt", "title"]).optional(),
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type GradeAssignmentInput = z.infer<typeof gradeAssignmentSchema>;
export type AssignmentQuery = z.infer<typeof assignmentQuerySchema>;
export const defaultAssignmentQuery: AssignmentQuery = {
  page: 1,
  limit: 100,
  sortOrder: "desc",
};
