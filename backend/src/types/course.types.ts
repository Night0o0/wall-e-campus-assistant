import { z } from "zod";

export const createCourseSchema = z.object({
  courseCode: z.string().min(2, "Course code must be at least 2 characters").max(20, "Course code must be at most 20 characters"),
  courseName: z.string().min(3, "Course name must be at least 3 characters").max(100, "Course name must be at most 100 characters"),
  description: z.string().max(500, "Description must be at most 500 characters").optional(),
  semester: z.string().min(1, "Semester is required"),
  department: z.string().max(100, "Department must be at most 100 characters").optional(),
  credits: z.number().int().min(1).max(20).optional(),
});

export const updateCourseSchema = z.object({
  courseName: z.string().min(3, "Course name must be at least 3 characters").max(100, "Course name must be at most 100 characters").optional(),
  description: z.string().max(500, "Description must be at most 500 characters").optional(),
  semester: z.string().min(1, "Semester is required").optional(),
  department: z.string().max(100, "Department must be at most 100 characters").optional(),
  credits: z.number().int().min(1).max(20).optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
