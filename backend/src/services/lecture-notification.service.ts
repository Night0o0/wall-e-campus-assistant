import { NotificationType } from "@prisma/client";
import {
  REMINDER_RULES,
  ReminderAudience,
  ReminderRule,
  notificationConfig,
} from "../config/notification.config.js";
import {
  NotificationDraft,
  NotificationRepository,
} from "../repositories/notification.repository.js";
import {
  ScheduleForReminders,
  ScheduleRepository,
} from "../repositories/schedule.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import { parseSemesterNumber } from "../types/schedule.types.js";
import { occurrencesBetween } from "../utils/occurrence.util.js";
import { renderReminder, reminderPayload } from "./notification.content.js";

/**
 * Turns the recurring timetable into concrete reminders.
 *
 * The generator is a pure producer: it writes PENDING rows and never sends
 * anything. Delivery is the worker's job (notification.dispatcher.ts), which
 * keeps "who should be told, and when" separate from "did the message get out",
 * and means a generation run can be repeated at any time without side effects —
 * the unique constraint behind createManyIgnoringDuplicates absorbs the repeat.
 */

const MINUTE_MS = 60_000;

export interface GenerationResult {
  scheduledLectures: number;
  occurrences: number;
  drafted: number;
  created: number;
}

/** One person a reminder is addressed to, with the tenant it was resolved in. */
interface Recipient {
  userId: string;
  organizationId: string;
}

export class LectureNotificationService {
  constructor(
    private readonly schedules = new ScheduleRepository(),
    private readonly students = new StudentRepository(),
    private readonly notifications = new NotificationRepository(),
    private readonly timeZone: string = notificationConfig.timeZone
  ) {}

  /**
   * Writes reminders for every occurrence falling inside the horizon.
   *
   * Runs on a timer and is safe to run by hand at any moment: nothing here
   * depends on when it last ran, so a missed run is caught up by the next one
   * and an extra run costs one no-op insert.
   */
  async generateUpcoming(options: { now?: Date; horizonMinutes?: number } = {}) {
    const now = options.now ?? new Date();
    const horizonMs =
      (options.horizonMinutes ?? notificationConfig.horizonMinutes) * MINUTE_MS;

    const schedules = await this.schedules.findActiveForReminders();

    const result: GenerationResult = {
      scheduledLectures: schedules.length,
      occurrences: 0,
      drafted: 0,
      created: 0,
    };

    for (const schedule of schedules) {
      const occurrences = occurrencesBetween(
        schedule,
        now,
        horizonMs,
        this.timeZone
      );

      result.occurrences += occurrences.length;

      const drafts = await this.draftsFor(schedule, occurrences, REMINDER_RULES, {
        // A reminder whose moment has already gone is not worth creating: sent
        // late it would announce a lecture that has already started.
        notBefore: now,
      });

      result.drafted += drafts.length;
      result.created += await this.notifications.createManyIgnoringDuplicates(
        drafts
      );
    }

    return result;
  }

  /**
   * Development helper: builds the reminders for one lecture's next occurrence
   * and makes them due immediately, so the 24-hour rule can be watched without
   * waiting 24 hours.
   *
   * The reminders it produces are the real ones — same recipients, same
   * wording, same idempotency key — only their delivery time is brought
   * forward, which is why a pending reminder that already exists is released
   * rather than duplicated. Reachable only through the dev-only route; see
   * notification.routes.ts.
   */
  async simulateForSchedule(input: {
    lectureScheduleId: string;
    /** The caller's tenant. A simulation cannot reach into another university. */
    organizationId: string;
    types?: NotificationType[];
    now?: Date;
  }) {
    const now = input.now ?? new Date();

    const schedule = await this.schedules.findByIdForReminders(
      input.lectureScheduleId
    );

    if (!schedule || schedule.organizationId !== input.organizationId) {
      return null;
    }

    const rules = input.types?.length
      ? REMINDER_RULES.filter((rule) => input.types!.includes(rule.type))
      : REMINDER_RULES;

    // Only the next occurrence: simulating the whole horizon would flood every
    // student in the cohort with a fortnight of reminders at once.
    const [occurrence] = occurrencesBetween(
      schedule,
      now,
      8 * 24 * 60 * MINUTE_MS,
      this.timeZone
    );

    if (!occurrence) {
      return null;
    }

    const drafts = await this.draftsFor(schedule, [occurrence], rules, {
      // Ignore the "already past" rule — the whole point is to fire a 24-hour
      // reminder for a lecture that is less than 24 hours away.
      notBefore: null,
      dueAt: now,
    });

    const created = await this.notifications.createManyIgnoringDuplicates(drafts);

    // Anything that already existed as PENDING for this occurrence is brought
    // forward too, so a second simulation is not a silent no-op.
    const released = await this.notifications.releaseForDelivery(
      {
        lectureScheduleId: schedule.id,
        occurrenceStartsAt: occurrence,
        types: rules.map((rule) => rule.type),
      },
      now
    );

    return {
      lectureScheduleId: schedule.id,
      course: schedule.course.courseName,
      room: schedule.room,
      occurrenceStartsAt: occurrence,
      types: rules.map((rule) => rule.type),
      drafted: drafts.length,
      created,
      dueNow: released,
    };
  }

  /**
   * A cancelled lecture's unsent reminders are cancelled with it. Called by the
   * schedule service when a lecture is deactivated.
   */
  async cancelForSchedule(lectureScheduleId: string, reason: string) {
    return this.notifications.cancelPendingForSchedule(
      lectureScheduleId,
      reason
    );
  }

  /**
   * A lecture that has been moved, renamed or reassigned invalidates every
   * reminder it has not yet sent — the room in the stored message may now be
   * wrong, and the occurrence may have moved to another day.
   *
   * They are discarded rather than cancelled so the next generation pass can
   * write the corrected ones; see deleteUnsentForSchedule.
   */
  async resetForSchedule(lectureScheduleId: string) {
    return this.notifications.deleteUnsentForSchedule(lectureScheduleId);
  }

  /* ------------------------------ Internals ------------------------------- */

  private async draftsFor(
    schedule: ScheduleForReminders,
    occurrences: Date[],
    rules: readonly (ReminderRule & { audience: ReminderAudience })[],
    timing: { notBefore: Date | null; dueAt?: Date }
  ): Promise<NotificationDraft[]> {
    if (occurrences.length === 0 || rules.length === 0) {
      return [];
    }

    // Resolved once per lecture rather than once per occurrence — the cohort of
    // a weekly slot does not change between this Sunday and the next.
    const audiences = new Set(rules.map((rule) => rule.audience));
    const recipients = new Map<ReminderAudience, Recipient[]>();

    for (const audience of audiences) {
      recipients.set(audience, await this.recipientsFor(schedule, audience));
    }

    const drafts: NotificationDraft[] = [];

    for (const occurrenceStartsAt of occurrences) {
      for (const rule of rules) {
        const people = recipients.get(rule.audience) ?? [];

        if (people.length === 0) {
          continue;
        }

        const naturalTime = new Date(
          occurrenceStartsAt.getTime() - rule.minutesBefore * MINUTE_MS
        );

        if (timing.notBefore && naturalTime < timing.notBefore) {
          continue;
        }

        const scheduledFor = timing.dueAt ?? naturalTime;

        const { title, body } = renderReminder({
          courseName: schedule.course.courseName,
          room: schedule.room,
          occurrenceStartsAt,
          // Worded from the rule's own lead time, so a simulated 24-hour
          // reminder still reads like a 24-hour reminder.
          scheduledFor: naturalTime,
          minutesBefore: rule.minutesBefore,
          audience: rule.audience,
          timeZone: this.timeZone,
        });

        const data = reminderPayload({
          type: rule.type,
          lectureScheduleId: schedule.id,
          courseId: schedule.course.id,
          courseCode: schedule.course.courseCode,
          courseName: schedule.course.courseName,
          room: schedule.room,
          occurrenceStartsAt,
          occurrenceEndsAt: this.endOf(schedule, occurrenceStartsAt),
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          minutesBefore: rule.minutesBefore,
        });

        for (const person of people) {
          drafts.push({
            // From the lecture, never from the recipient lookup: this is the
            // column that makes cross-tenant delivery impossible to express.
            organizationId: schedule.organizationId,
            userId: person.userId,
            lectureScheduleId: schedule.id,
            occurrenceStartsAt,
            type: rule.type,
            title,
            body,
            data,
            scheduledFor,
          });
        }
      }
    }

    return drafts;
  }

  /**
   * Who this lecture's reminder goes to.
   *
   * ADMIN — the instructor assigned to the lecture, and nobody else. Not every
   * admin in the university, and not the course's creator.
   *
   * STUDENT — the active students whose academic profile is the cohort this
   * lecture is timetabled for, within the lecture's own organization.
   */
  private async recipientsFor(
    schedule: ScheduleForReminders,
    audience: ReminderAudience
  ): Promise<Recipient[]> {
    if (audience === "ADMIN") {
      const { instructor } = schedule;

      // A deactivated or reassigned instructor is not sent to. The role check
      // is defensive: teaching staff are ADMIN users by construction.
      if (
        !instructor.isActive ||
        instructor.role !== "ADMIN" ||
        instructor.organizationId !== schedule.organizationId
      ) {
        return [];
      }

      return [
        { userId: instructor.id, organizationId: instructor.organizationId },
      ];
    }

    const cohort = await this.students.findCohort({
      organizationId: schedule.organizationId,
      faculty: schedule.faculty,
      department: schedule.department,
      level: schedule.level,
      section: schedule.section,
    });

    return cohort
      .filter((profile) => {
        // The database could not compare semesters: a profile stores free text,
        // a schedule stores 1 or 2. Same reader as the timetable, so a student
        // sees reminders for exactly the lectures their timetable shows.
        if (parseSemesterNumber(profile.semester) !== schedule.semester) {
          return false;
        }

        // Belt and braces over the tenant filter already applied in the query.
        return profile.user.organizationId === schedule.organizationId;
      })
      .map((profile) => ({
        userId: profile.user.id,
        organizationId: profile.user.organizationId,
      }));
  }

  /** Lecture end as an instant, derived from the slot's own duration. */
  private endOf(schedule: ScheduleForReminders, startsAt: Date): Date | null {
    const toMinutes = (clock: string) => {
      const [hour, minute] = clock.split(":").map(Number);
      return hour === undefined || minute === undefined
        ? null
        : hour * 60 + minute;
    };

    const start = toMinutes(schedule.startTime);
    const end = toMinutes(schedule.endTime);

    if (start === null || end === null || end <= start) {
      return null;
    }

    return new Date(startsAt.getTime() + (end - start) * MINUTE_MS);
  }
}
