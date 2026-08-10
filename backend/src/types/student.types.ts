import { z } from "zod";

/**
 * The fields a student must fill before the profile flips to COMPLETED.
 * `universityId` is not here — it lives on User and is set at registration.
 */
export const REQUIRED_PROFILE_FIELDS = [
  "faculty",
  "department",
  "level",
  "semester",
  "section",
  "phoneNumber",
  "nationalId",
  "dateOfBirth",
] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

/** Digits, spaces, dashes and an optional leading +. */
const PHONE_PATTERN = /^\+?[\d\s-]{7,20}$/;

/** Egyptian national ID: 14 digits. Kept as a string — leading zeros matter. */
const NATIONAL_ID_PATTERN = /^\d{14}$/;

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date of birth")
  .refine((date) => date < new Date(), "Date of birth must be in the past")
  .refine(
    (date) => date > new Date("1900-01-01T00:00:00.000Z"),
    "Date of birth is not plausible"
  );

/**
 * Every field is optional so a student can save partial progress. Completion is
 * computed from what has actually been stored, not from what this request sent.
 */
export const updateStudentProfileSchema = z
  .object({
    faculty: z.string().min(2, "Faculty must be at least 2 characters").max(100),
    department: z
      .string()
      .min(2, "Department must be at least 2 characters")
      .max(100),
    level: z
      .number()
      .int("Academic level must be a whole number")
      .min(1, "Academic level must be at least 1")
      .max(7, "Academic level must be at most 7"),
    semester: z.string().min(1, "Semester is required").max(50),
    section: z.string().min(1, "Section is required").max(20),
    groupName: z.string().min(1).max(50),
    academicYear: z.string().min(4, "Academic year must be at least 4 characters").max(20),
    phoneNumber: z
      .string()
      .regex(PHONE_PATTERN, "Phone number must be 7-20 digits, optionally starting with +"),
    nationalId: z
      .string()
      .regex(NATIONAL_ID_PATTERN, "National ID must be 14 digits"),
    dateOfBirth,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateStudentProfileInput = z.infer<
  typeof updateStudentProfileSchema
>;
