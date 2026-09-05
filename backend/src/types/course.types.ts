import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

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

/**
 * Filters for the course list.
 *
 * No organizationId, for the usual reason: the tenant comes from the token.
 *
 * `level` is the odd one out and is worth explaining. Course carries no
 * academic level — a course is a subject, and the same subject can be taught to
 * more than one year. The level lives on LectureSchedule, which is the teaching
 * assignment, so filtering by it means "courses that have an active lecture at
 * this level" and is resolved through that relation. That is what makes
 * "second-year mechatronics subjects" answerable at all.
 *
 * Bounded to keep list endpoints from returning an unbounded catalogue. The
 * web client already tolerates either a bare array or a pagination envelope,
 * which makes the backend-side upgrade safe.
 */
export const courseQuerySchema = paginationSchema
  .omit({ search: true })
  .extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    search: z.string().trim().min(1).max(100).optional(),
    department: z.string().trim().min(1).max(100).optional(),
    semester: z.string().trim().min(1).max(50).optional(),
    level: z.coerce.number().int().min(1).max(7).optional(),
    sortBy: z.enum(["createdAt", "courseCode", "courseName", "semester"]).optional(),
  });

export type CourseQuery = z.infer<typeof courseQuerySchema>;
export const defaultCourseQuery: CourseQuery = {
  page: 1,
  limit: 100,
  sortOrder: "desc",
};
