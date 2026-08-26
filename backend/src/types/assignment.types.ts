import { z } from "zod";

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

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type GradeAssignmentInput = z.infer<typeof gradeAssignmentSchema>;
