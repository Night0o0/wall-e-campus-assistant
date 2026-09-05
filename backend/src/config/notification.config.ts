import { NotificationType, UserRole } from "@prisma/client";
import { env } from "./env.js";

/**
 * One reminder rule: how far ahead of a lecture it fires, and which stored
 * notification type it produces.
 *
 * The lead time and the type are declared together on purpose. A lead time on
 * its own would let someone change 30 to 45 and leave rows labelled
 * LECTURE_INSTRUCTOR_30M going out three quarters of an hour early; changing a rule
 * here means deciding, in the same edit, what the row should now be called.
 */
export interface ReminderRule {
  /** Minutes before the lecture starts. */
  minutesBefore: number;
  type: NotificationType;
}

/**
 * INSTRUCTOR users are the university's teaching staff — professors, doctors,
 * lecturers, engineers. There is no separate professor role in this schema;
 * see the note on LectureSchedule.instructor.
 *
 * THIS IS THE ONLY PLACE THE LEAD TIMES ARE DEFINED. Nothing else in the
 * application may hardcode 1440, 30 or 10.
 */
export const ADMIN_REMINDERS: readonly ReminderRule[] = [
  { minutesBefore: 1440, type: NotificationType.LECTURE_INSTRUCTOR_24H },
  { minutesBefore: 30, type: NotificationType.LECTURE_INSTRUCTOR_30M },
];

export const STUDENT_REMINDERS: readonly ReminderRule[] = [
  { minutesBefore: 10, type: NotificationType.LECTURE_STUDENT_10M },
];

/** Who a rule is addressed to, derived from the two lists above. */
export type ReminderAudience = Extract<UserRole, "INSTRUCTOR" | "STUDENT">;

export const REMINDER_RULES: readonly (ReminderRule & {
  audience: ReminderAudience;
})[] = [
  ...ADMIN_REMINDERS.map((rule) => ({ ...rule, audience: "INSTRUCTOR" as const })),
  ...STUDENT_REMINDERS.map((rule) => ({
    ...rule,
    audience: "STUDENT" as const,
  })),
];

export const ruleForType = (type: NotificationType) =>
  REMINDER_RULES.find((rule) => rule.type === type);

/** The furthest-ahead rule, which is what the generator has to look ahead by. */
export const MAX_REMINDER_MINUTES = REMINDER_RULES.reduce(
  (max, rule) => Math.max(max, rule.minutesBefore),
  0
);

export const notificationConfig = {
  /**
   * Wall-clock times on a LectureSchedule ("12:00") carry no date and no zone.
   * This is the campus clock they are read in, and it is what turns a weekly
   * slot into an instant. IANA name, so daylight saving is handled.
   */
  timeZone: env.NOTIFICATION_TIMEZONE,

  /**
   * How far ahead the generator looks for lecture occurrences. Must exceed the
   * longest lead time, or the 24-hour reminder would be generated after the
   * moment it was supposed to fire.
   */
  horizonMinutes: Math.max(
    env.NOTIFICATION_HORIZON_MINUTES,
    MAX_REMINDER_MINUTES + 60
  ),

  /** How often the worker polls for due reminders. */
  pollIntervalMs: env.NOTIFICATION_POLL_INTERVAL_MS,

  /** How often the worker regenerates upcoming reminders. */
  generationIntervalMs: env.NOTIFICATION_GENERATION_INTERVAL_MS,

  /** Reminders claimed per poll. */
  batchSize: 100,

  /**
   * A reminder more than this far past its time is stale — a worker that was
   * down for a day should not deliver yesterday's "starts in 10 minutes".
   * Overdue rows are cancelled rather than sent.
   */
  staleAfterMinutes: 60,

  /** Attempts before a reminder is marked FAILED for good. */
  maxAttempts: 3,

  /**
   * A row claimed by a worker that then died stays locked for this long before
   * another worker may take it back.
   */
  lockTimeoutMs: 5 * 60 * 1000,
} as const;
