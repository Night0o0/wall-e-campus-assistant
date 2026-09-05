import { DayOfWeek } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

/**
 * The only two semesters this MVP recognises. Deliberately not a full academic
 * calendar — a schedule belongs to "first" or "second" and nothing more.
 */
export const SEMESTER_LABELS: Record<number, string> = {
  1: "First Semester",
  2: "Second Semester",
};

/**
 * The profile fields a student must have filled before a personalised
 * timetable can be built. A subset of REQUIRED_PROFILE_FIELDS: the personal
 * details (phone, national ID, birth date) play no part in matching.
 */
export const SCHEDULE_MATCH_FIELDS = [
  "faculty",
  "department",
  "level",
  "semester",
  "section",
] as const;

export type ScheduleMatchField = (typeof SCHEDULE_MATCH_FIELDS)[number];

/**
 * StudentProfile.semester is free text ("Fall 2025", "First Semester", "1"),
 * while a schedule stores 1 or 2. This turns the former into the latter, and
 * returns null when the text cannot be read with confidence — the caller then
 * asks the student to fix their profile rather than guessing at a timetable.
 *
 * A bare year like "2026" must NOT resolve to 2, hence the explicit vocabulary
 * instead of hunting for any digit in the string.
 */
export const parseSemesterNumber = (
  value: string | number | null | undefined
): number | null => {
  if (typeof value === "number") {
    return value === 1 || value === 2 ? value : null;
  }

  if (!value) {
    return null;
  }

  const text = value.trim().toLowerCase();

  if (text === "1" || text === "2") {
    return Number(text);
  }

  // "semester 1", "sem 2", "s1"
  const numbered = text.match(/\b(?:semester|sem|s)\s*([12])\b/);
  if (numbered) {
    return Number(numbered[1]);
  }

  if (/\b(?:first|1st)\b/.test(text)) return 1;
  if (/\b(?:second|2nd)\b/.test(text)) return 2;

  // Local academic year: the first term runs in autumn, the second in spring.
  if (/\b(?:fall|autumn)\b/.test(text)) return 1;
  if (/\bspring\b/.test(text)) return 2;

  return null;
};

/** 24-hour, zero-padded wall clock. Zero padding makes string order = time order. */
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const timeField = (label: string) =>
  z.string().regex(TIME_PATTERN, `${label} must be a 24-hour HH:MM time`);

/**
 * Note what is absent: organizationId. It is never accepted from the client —
 * a schedule always inherits the authenticated user's organization.
 */
const scheduleFields = z.object({
  courseId: z.string().uuid("courseId must be a valid id"),
  instructorId: z.string().uuid("instructorId must be a valid id"),
  faculty: z
    .string()
    .trim()
    .min(2, "Faculty must be at least 2 characters")
    .max(100),
  department: z
    .string()
    .trim()
    .min(2, "Department must be at least 2 characters")
    .max(100),
  level: z
    .number()
    .int("Academic level must be a whole number")
    .min(1, "Academic level must be at least 1")
    .max(7, "Academic level must be at most 7"),
  semester: z
    .number()
    .int()
    .min(1, "Semester must be 1 (first) or 2 (second)")
    .max(2, "Semester must be 1 (first) or 2 (second)"),
  section: z.string().trim().min(1, "Section is required").max(20),
  dayOfWeek: z.nativeEnum(DayOfWeek, {
    errorMap: () => ({
      message: `dayOfWeek must be one of: ${Object.values(DayOfWeek).join(", ")}`,
    }),
  }),
  startTime: timeField("startTime"),
  endTime: timeField("endTime"),
  room: z.string().trim().min(1, "Room is required").max(50),
});

const endsAfterItStarts = (data: { startTime?: string; endTime?: string }) =>
  data.startTime === undefined ||
  data.endTime === undefined ||
  data.startTime < data.endTime;

export const createScheduleSchema = scheduleFields.refine(endsAfterItStarts, {
  message: "startTime must be before endTime",
  path: ["endTime"],
});

/**
 * Every field optional so a single lecture can be moved without resending the
 * whole record. When only one of the two times is sent, the service re-checks
 * the pair against what is already stored.
 */
export const updateScheduleSchema = scheduleFields
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(endsAfterItStarts, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });

export const scheduleQuerySchema = paginationSchema.extend({
  courseId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
  faculty: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  section: z.string().trim().min(1).max(20).optional(),
  room: z.string().trim().min(1).max(50).optional(),
  level: z.coerce.number().int().min(1).max(7).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  dayOfWeek: z.nativeEnum(DayOfWeek).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const scheduleAttendanceLogQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(26).default(4),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;
export type ScheduleAttendanceLogQuery = z.infer<typeof scheduleAttendanceLogQuerySchema>;
