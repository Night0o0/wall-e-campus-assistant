import { NotificationType } from "@prisma/client";
import { ReminderAudience } from "../config/notification.config.js";
import {
  calendarDaysBetween,
  formatClock,
  formatWeekday,
} from "../utils/occurrence.util.js";

/**
 * The wording of a reminder, in one place.
 *
 * Rendered once at generation time and stored on the row, so what a user reads
 * in their notification list is what was sent, even if the lecture is moved to
 * another room afterwards.
 */

export interface ReminderContext {
  courseName: string;
  room: string;
  /** When the lecture itself begins. */
  occurrenceStartsAt: Date;
  /** When the reminder goes out. */
  scheduledFor: Date;
  minutesBefore: number;
  audience: ReminderAudience;
  timeZone: string;
}

export interface RenderedNotification {
  title: string;
  body: string;
}

/** A day or more ahead is an advance warning; anything closer is imminent. */
const isAdvanceWarning = (minutesBefore: number) => minutesBefore >= 24 * 60;

/**
 * "in 30 minutes", "in 2 hours", "tomorrow at 12:00 PM", "on Sunday at 12:00 PM".
 * Phrased from the rule's own lead time, which is what the reminder promises,
 * rather than from the clock at delivery.
 */
const whenPhrase = (context: ReminderContext) => {
  const { minutesBefore, timeZone } = context;

  if (isAdvanceWarning(minutesBefore)) {
    const at = formatClock(context.occurrenceStartsAt, timeZone);
    const days = calendarDaysBetween(
      context.scheduledFor,
      context.occurrenceStartsAt,
      timeZone
    );

    if (days <= 0) return `today at ${at}`;
    if (days === 1) return `tomorrow at ${at}`;

    return `on ${formatWeekday(context.occurrenceStartsAt, timeZone)} at ${at}`;
  }

  if (minutesBefore >= 60) {
    const hours = Math.round(minutesBefore / 60);
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `in ${minutesBefore} minute${minutesBefore === 1 ? "" : "s"}`;
};

export const renderReminder = (
  context: ReminderContext
): RenderedNotification => {
  const advance = isAdvanceWarning(context.minutesBefore);
  const when = whenPhrase(context);

  // Teaching staff are told about "the lecture" they are giving; a student is
  // told about the subject they are going to.
  const subject =
    context.audience === "ADMIN"
      ? `${context.courseName} lecture`
      : context.courseName;

  const verb = advance ? "is" : "starts";

  return {
    title: advance ? "Upcoming lecture" : "Lecture starting soon",
    body: `${subject} ${verb} ${when}. Room ${context.room}.`,
  };
};

/**
 * The machine-readable half of the notification, for a mobile client that wants
 * to deep-link into the timetable instead of parsing the sentence above.
 */
export const reminderPayload = (input: {
  type: NotificationType;
  lectureScheduleId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  room: string;
  occurrenceStartsAt: Date;
  occurrenceEndsAt: Date | null;
  startTime: string;
  endTime: string;
  minutesBefore: number;
}) => ({
  kind: "LECTURE_REMINDER",
  type: input.type,
  lectureScheduleId: input.lectureScheduleId,
  courseId: input.courseId,
  courseCode: input.courseCode,
  courseName: input.courseName,
  room: input.room,
  startsAt: input.occurrenceStartsAt.toISOString(),
  endsAt: input.occurrenceEndsAt?.toISOString() ?? null,
  startTime: input.startTime,
  endTime: input.endTime,
  minutesBefore: input.minutesBefore,
});

/* ---------------------------- Account decisions ---------------------------- */

/**
 * What a student is told when staff act on their registration.
 *
 * These are not reminders: nothing schedules them, nothing retries them, and
 * they refer to no lecture. They are written in the same transaction as the
 * decision itself, which is what makes "approved but never told" impossible
 * rather than merely unlikely.
 *
 * Neither message names the member of staff who decided. The audit columns
 * record that — verifiedById exists precisely so the attribution lives
 * somewhere accountable — but a student reading "Dr. X rejected you" turns an
 * institutional decision into a personal one, and the appeal route is the
 * department, not the individual.
 */

/** The organisation's own name, so the notice says which university let them in. */
export const accountApprovedContent = (
  organizationName: string
): RenderedNotification => ({
  title: "Your account has been approved",
  body: `Welcome to ${organizationName}. Your registration has been approved — your timetable, course material and attendance scanning are now available.`,
});

export const accountRejectedContent = (
  organizationName: string
): RenderedNotification => ({
  title: "Your registration was not approved",
  body: `Your registration at ${organizationName} was not approved and the account has been closed. Contact your department if you believe this is a mistake.`,
});
