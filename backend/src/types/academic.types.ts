import { TeachingRole } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}\s*[/\-]\s*\d{4}$/, "academicYear must look like 2026/2027")
  .transform((value) => value.replace(/\s+/g, ""));

const dateValue = z.coerce.date({ invalid_type_error: "A valid date is required" });
const uuid = (name: string) => z.string().uuid(`${name} must be a valid id`);

const datesAreOrdered = (value: { startsOn?: Date; endsOn?: Date }) =>
  !value.startsOn || !value.endsOn || value.startsOn < value.endsOn;

export const academicTermQuerySchema = paginationSchema.extend({
  academicYear: academicYear.optional(),
  semester: z.coerce.number().int().min(1).max(3).optional(),
  isCurrent: optionalBoolean,
});

export const createAcademicTermSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    academicYear,
    semester: z.number().int().min(1).max(3),
    startsOn: dateValue,
    endsOn: dateValue,
    isCurrent: z.boolean().default(false),
  })
  .refine(datesAreOrdered, {
    message: "startsOn must be before endsOn",
    path: ["endsOn"],
  });

export const updateAcademicTermSchema = createAcademicTermSchema
  .innerType()
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(datesAreOrdered, {
    message: "startsOn must be before endsOn",
    path: ["endsOn"],
  });

export const cohortQuerySchema = paginationSchema.extend({
  departmentId: uuid("departmentId").optional(),
  academicYear: academicYear.optional(),
  level: z.coerce.number().int().min(1).max(7).optional(),
  isActive: optionalBoolean,
});

export const createCohortSchema = z.object({
  departmentId: uuid("departmentId"),
  name: z.string().trim().min(2).max(100),
  academicYear,
  level: z.number().int().min(1).max(7),
  section: z.string().trim().min(1).max(30).nullable().optional(),
  groupName: z.string().trim().min(1).max(50).nullable().optional(),
});

export const updateCohortSchema = createCohortSchema
  .omit({ departmentId: true })
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const offeringQuerySchema = paginationSchema.extend({
  departmentId: uuid("departmentId").optional(),
  courseId: uuid("courseId").optional(),
  termId: uuid("termId").optional(),
  cohortId: uuid("cohortId").optional(),
  isActive: optionalBoolean,
});

export const createOfferingSchema = z.object({
  departmentId: uuid("departmentId"),
  courseId: uuid("courseId"),
  termId: uuid("termId"),
  displayName: z.string().trim().min(2).max(150).nullable().optional(),
  cohortIds: z.array(uuid("cohortId")).max(100).default([]),
});

export const updateOfferingSchema = z
  .object({
    displayName: z.string().trim().min(2).max(150).nullable().optional(),
    cohortIds: z.array(uuid("cohortId")).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const teachingAssignmentQuerySchema = paginationSchema.extend({
  offeringId: uuid("offeringId").optional(),
  instructorId: uuid("instructorId").optional(),
  cohortId: uuid("cohortId").optional(),
  isActive: optionalBoolean,
});

export const createTeachingAssignmentSchema = z.object({
  offeringId: uuid("offeringId"),
  instructorId: uuid("instructorId"),
  cohortId: uuid("cohortId").nullable().optional(),
  teachingRole: z.nativeEnum(TeachingRole).default(TeachingRole.LECTURER),
});

export const updateTeachingAssignmentSchema = z
  .object({
    cohortId: uuid("cohortId").nullable().optional(),
    teachingRole: z.nativeEnum(TeachingRole).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const enrollmentQuerySchema = paginationSchema.extend({
  offeringId: uuid("offeringId").optional(),
  studentId: uuid("studentId").optional(),
  isActive: optionalBoolean,
});

export const createEnrollmentSchema = z.object({
  offeringId: uuid("offeringId"),
  studentId: uuid("studentId"),
});

export const updateEnrollmentSchema = z.object({ isActive: z.boolean() });

export type AcademicTermQuery = z.infer<typeof academicTermQuerySchema>;
export type CreateAcademicTermInput = z.infer<typeof createAcademicTermSchema>;
export type UpdateAcademicTermInput = z.infer<typeof updateAcademicTermSchema>;
export type CohortQuery = z.infer<typeof cohortQuerySchema>;
export type CreateCohortInput = z.infer<typeof createCohortSchema>;
export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;
export type OfferingQuery = z.infer<typeof offeringQuerySchema>;
export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>;
export type TeachingAssignmentQuery = z.infer<typeof teachingAssignmentQuerySchema>;
export type CreateTeachingAssignmentInput = z.infer<typeof createTeachingAssignmentSchema>;
export type UpdateTeachingAssignmentInput = z.infer<typeof updateTeachingAssignmentSchema>;
export type EnrollmentQuery = z.infer<typeof enrollmentQuerySchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
