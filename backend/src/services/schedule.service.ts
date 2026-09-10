import { DayOfWeek } from "@prisma/client";
import {
  ScheduleFilter,
  ScheduleRepository,
  ScheduleWithRelations,
  SlotProbe,
} from "../repositories/schedule.repository.js";
import { CourseRepository } from "../repositories/course.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import {
  CreateScheduleInput,
  ScheduleQuery,
  SEMESTER_LABELS,
  UpdateScheduleInput,
} from "../types/schedule.types.js";
import { ScheduleCriteria, cohortMatches, resolveCohort } from "../utils/cohort.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";
import { LectureNotificationService } from "./lecture-notification.service.js";
import { CampusEventNotifier, ScheduleEvent } from "./campus-events.notifier.js";
import { logger } from "../utils/logger.js";

const scheduleRepo = new ScheduleRepository();
const courseRepo = new CourseRepository();
const userRepo = new UserRepository();
const studentRepo = new StudentRepository();
const lectureNotifications = new LectureNotificationService();
const eventNotifier = new CampusEventNotifier();

/** The fields whose change makes a schedule update worth telling a cohort about. */
const MEANINGFUL_SCHEDULE_FIELDS = [
  "courseId",
  "dayOfWeek",
  "startTime",
  "endTime",
  "room",
  "faculty",
  "department",
  "level",
  "semester",
  "section",
  "instructorId",
] as const;

/**
 * Builds the cohort event from a schedule the repository returned. Reads only
 * server-held values, so the resulting audience can never be one a request
 * tried to name.
 */
const toScheduleEvent = (schedule: ScheduleWithRelations): ScheduleEvent => ({
  scheduleId: schedule.id,
  organizationId: schedule.organizationId,
  courseId: schedule.courseId,
  courseCode: schedule.course.courseCode,
  courseName: schedule.course.courseName,
  faculty: schedule.faculty,
  department: schedule.department,
  level: schedule.level,
  semester: schedule.semester,
  section: schedule.section,
  dayOfWeek: schedule.dayOfWeek,
  startTime: schedule.startTime,
  endTime: schedule.endTime,
  room: schedule.room,
});

/**
 * Cohort notifications are best effort: the timetable write has already
 * committed, and a notification failure must not fail the request or undo it.
 */
const notifySchedule = async (
  kind: "created" | "updated" | "cancelled",
  schedule: ScheduleWithRelations
) => {
  try {
    const event = toScheduleEvent(schedule);
    if (kind === "created") await eventNotifier.scheduleCreated(event);
    else if (kind === "updated") await eventNotifier.scheduleUpdated(event);
    else await eventNotifier.scheduleCancelled(event);
  } catch (error) {
    logger.error("schedule.notify_failed", { scheduleId: schedule.id, kind, error });
  }
};

/**
 * Just enough of the authenticated user to make an authorization decision.
 * `organizationId` comes from the token-backed user record, never the body.
 */
export interface ScheduleActor {
  id: string;
  role: string;
  organizationId: string;
}

/**
 * The academic address a timetable is looked up by.
 *
 * Defined in utils/cohort.ts now that the attendance scan path compares against
 * it too, and re-exported here so every existing importer is unaffected.
 */
export type { ScheduleCriteria } from "../utils/cohort.js";

export class ScheduleService {
  /* ------------------------------- Writing -------------------------------- */

  async createSchedule(input: CreateScheduleInput, actor: ScheduleActor) {
    // The tenant is taken from the caller. A body-supplied organizationId is
    // not read anywhere in this file, so it cannot be honoured by accident.
    const { organizationId } = actor;

    await this.assertCourseInOrg(input.courseId, organizationId);
    await this.assertInstructorInOrg(input.instructorId, organizationId);

    await this.assertSlotIsFree(input.instructorId, input.room, {
      organizationId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    const created = await scheduleRepo.create({ ...input, organizationId });

    if (created.isActive) {
      await notifySchedule("created", created);
    }

    return this.present(created);
  }

  async updateSchedule(
    id: string,
    input: UpdateScheduleInput,
    actor: ScheduleActor
  ) {
    const existing = await this.loadInOrg(id, actor.organizationId);

    if (input.courseId) {
      await this.assertCourseInOrg(input.courseId, actor.organizationId);
    }

    if (input.instructorId) {
      await this.assertInstructorInOrg(input.instructorId, actor.organizationId);
    }

    const merged = { ...existing, ...input };

    // One side of the pair may have been sent on its own; the stored value on
    // the other side still has to make sense next to it.
    if (merged.startTime >= merged.endTime) {
      throw badRequest("startTime must be before endTime");
    }

    // A deactivated lecture holds no room and no instructor hour, so it has
    // nothing to clash with.
    if (merged.isActive) {
      await this.assertSlotIsFree(merged.instructorId, merged.room, {
        organizationId: actor.organizationId,
        dayOfWeek: merged.dayOfWeek,
        startTime: merged.startTime,
        endTime: merged.endTime,
        excludeId: id,
      });
    }

    const updated = await scheduleRepo.update(id, input);

    // Reminders already queued for this lecture were written from the details
    // it had a moment ago. Discarding them lets the next generation pass write
    // them again from the details it has now.
    await lectureNotifications.resetForSchedule(id);

    // Tell the cohort only about a change worth telling them about: a moved,
    // renamed, re-roomed or re-timed lecture, not an incidental re-save. A
    // deactivating update is a cancellation, notified as such.
    if (!updated.isActive && existing.isActive) {
      await notifySchedule("cancelled", updated);
    } else if (updated.isActive && this.meaningfullyChanged(existing, updated)) {
      await notifySchedule("updated", updated);
    }

    return this.present(updated);
  }

  /** Whether any cohort-visible field of a schedule actually changed. */
  private meaningfullyChanged(
    before: ScheduleWithRelations,
    after: ScheduleWithRelations
  ): boolean {
    return MEANINGFUL_SCHEDULE_FIELDS.some((field) => before[field] !== after[field]);
  }

  /**
   * Soft delete. The row survives so past sessions, attendance and reports
   * still resolve the lecture they belonged to.
   */
  async deactivateSchedule(id: string, actor: ScheduleActor) {
    const existing = await this.loadInOrg(id, actor.organizationId);

    if (!existing.isActive) {
      return this.present(existing);
    }

    const deactivated = await scheduleRepo.update(id, { isActive: false });

    // Nobody should be told a cancelled lecture is starting in ten minutes.
    await lectureNotifications.cancelForSchedule(
      id,
      "The lecture was cancelled"
    );

    await notifySchedule("cancelled", deactivated);

    return this.present(deactivated);
  }

  /* ------------------------------- Reading -------------------------------- */

  /** Role decides the scope; the query string can only narrow it further. */
  async listSchedules(query: ScheduleQuery, actor: ScheduleActor) {
    const filter = await this.resolveScope(query, actor);

    const { data, total } = await scheduleRepo.findMany(filter, query);

    return paginate(
      data.map((schedule) => this.present(schedule)),
      total,
      query
    );
  }

  async getSchedule(id: string, actor: ScheduleActor) {
    const schedule = await this.loadInOrg(id, actor.organizationId);

    // An INSTRUCTOR reads only their own lectures, and a student only lectures
    // addressed to their cohort. Both get a 404 rather than a 403, so the
    // endpoint cannot be used to enumerate somebody else's timetable.
    if (actor.role === "INSTRUCTOR" && schedule.instructorId !== actor.id) {
      throw notFound("Schedule not found");
    }

    if (actor.role === "STUDENT") {
      const criteria = await this.studentCriteria(actor.id);

      if (!this.matches(schedule, criteria) || !schedule.isActive) {
        throw notFound("Schedule not found");
      }
    }

    return this.present(schedule);
  }

  /**
   * The authenticated student's weekly timetable, matched entirely from their
   * own stored profile — no academic filter is accepted from the client.
   */
  async getStudentTimetable(actor: ScheduleActor) {
    const criteria = await this.studentCriteria(actor.id);

    const schedules = await scheduleRepo.findTimetable({
      organizationId: actor.organizationId,
      isActive: true,
      ...criteria,
    });

    return {
      criteria: {
        ...criteria,
        semesterLabel: SEMESTER_LABELS[criteria.semester],
      },
      count: schedules.length,
      schedules: schedules.map((schedule) => this.present(schedule)),
    };
  }

  /** The authenticated INSTRUCTOR's own teaching timetable. */
  async getInstructorTimetable(actor: ScheduleActor) {
    const schedules = await scheduleRepo.findTimetable({
      organizationId: actor.organizationId,
      instructorId: actor.id,
      isActive: true,
    });

    return {
      instructorId: actor.id,
      count: schedules.length,
      schedules: schedules.map((schedule) => this.present(schedule)),
    };
  }

  /* ------------------------------ Internals ------------------------------- */

  private async resolveScope(
    query: ScheduleQuery,
    actor: ScheduleActor
  ): Promise<ScheduleFilter> {
    // Same tenant for everyone, always — including SYSTEM_OWNER, whose own
    // organization is the platform org.
    const base: ScheduleFilter = {
      organizationId: actor.organizationId,
      courseId: query.courseId,
      dayOfWeek: query.dayOfWeek,
      room: query.room,
      search: query.search,
    };

    if (actor.role === "STUDENT") {
      // The academic address is overwritten by the profile, so a student
      // cannot widen the query into another cohort's timetable.
      return {
        ...base,
        ...(await this.studentCriteria(actor.id)),
        isActive: true,
      };
    }

    if (actor.role === "INSTRUCTOR") {
      // Forced last: an instructorId in the query string cannot override it.
      return {
        ...base,
        faculty: query.faculty,
        department: query.department,
        section: query.section,
        level: query.level,
        semester: query.semester,
        isActive: query.isActive,
        instructorId: actor.id,
      };
    }

    return {
      ...base,
      faculty: query.faculty,
      department: query.department,
      section: query.section,
      level: query.level,
      semester: query.semester,
      instructorId: query.instructorId,
      isActive: query.isActive,
    };
  }

  /**
   * Reads the matching keys off the student's own profile, or explains why it
   * can't.
   *
   * The reading itself lives in utils/cohort.ts, shared with the attendance
   * scan path — a student's cohort has to mean the same thing when it decides
   * what appears on their timetable and when it decides what they may scan
   * into, or one of the two is wrong. What stays here is the wording: this
   * endpoint is being asked for a timetable, so that is what its errors talk
   * about.
   */
  private async studentCriteria(userId: string): Promise<ScheduleCriteria> {
    const profile = await studentRepo.findByUserId(userId);
    const resolution = resolveCohort(profile);

    if (resolution.ok) {
      return resolution.criteria;
    }

    if (resolution.reason === "MISSING_FIELDS") {
      throw badRequest(
        "Complete your academic profile before requesting your timetable",
        {
          profileStatus: profile?.status ?? "INCOMPLETE",
          missingFields: resolution.missingFields,
        }
      );
    }

    throw badRequest(
      `The semester on your profile ("${resolution.semester}") could not be read as a first or second semester — update it before requesting your timetable`,
      { profileStatus: profile?.status ?? "INCOMPLETE", invalidFields: ["semester"] }
    );
  }

  /** The same comparison the database does, for a schedule already in hand. */
  private matches(schedule: ScheduleWithRelations, criteria: ScheduleCriteria) {
    return cohortMatches(schedule, criteria);
  }

  private async loadInOrg(id: string, organizationId: string) {
    const schedule = await scheduleRepo.findById(id);

    // Same answer for "does not exist" and "belongs to another university",
    // so the API cannot be used to probe another tenant.
    if (!schedule || schedule.organizationId !== organizationId) {
      throw notFound("Schedule not found");
    }

    return schedule;
  }

  private async assertCourseInOrg(courseId: string, organizationId: string) {
    const course = await courseRepo.findById(courseId);

    if (!course || course.organizationId !== organizationId) {
      throw notFound("Course not found");
    }

    return course;
  }

  private async assertInstructorInOrg(
    instructorId: string,
    organizationId: string
  ) {
    const instructor = await userRepo.findByIdSafe(instructorId);

    // Cross-tenant assignment is reported as "not in this organization" and
    // never as "exists elsewhere".
    if (!instructor || instructor.organizationId !== organizationId) {
      throw badRequest("Instructor not found in this organization");
    }

    // There is no professor role in this system: teaching staff are INSTRUCTOR
    // users, and their title lives on AdminProfile.jobTitle.
    if (instructor.role !== "INSTRUCTOR") {
      throw badRequest("The assigned instructor must be a user with the INSTRUCTOR role");
    }

    if (!instructor.isActive) {
      throw badRequest("The assigned instructor's account is deactivated");
    }

    // There is no CourseInstructor/CourseStaffAssignment model in this schema,
    // so "is this instructor assigned to this course?" has no answer yet — the
    // LectureSchedule row is itself the assignment. Add the check here if such
    // a model is introduced later.

    return instructor;
  }

  private async assertSlotIsFree(
    instructorId: string,
    room: string,
    probe: SlotProbe
  ) {
    const clash = await scheduleRepo.findInstructorConflict(instructorId, probe);

    if (clash) {
      throw conflict(
        `This instructor already teaches ${clash.course.courseCode} on ${this.dayLabel(clash.dayOfWeek)} from ${clash.startTime} to ${clash.endTime}`
      );
    }

    const roomClash = await scheduleRepo.findRoomConflict(room, probe);

    if (roomClash) {
      throw conflict(
        `Room ${roomClash.room} is already booked on ${this.dayLabel(roomClash.dayOfWeek)} from ${roomClash.startTime} to ${roomClash.endTime}`
      );
    }
  }

  private dayLabel(day: DayOfWeek) {
    return day.charAt(0) + day.slice(1).toLowerCase();
  }

  private present(schedule: ScheduleWithRelations) {
    return {
      id: schedule.id,
      organizationId: schedule.organizationId,

      faculty: schedule.faculty,
      department: schedule.department,
      level: schedule.level,
      semester: schedule.semester,
      semesterLabel: SEMESTER_LABELS[schedule.semester] ?? null,
      section: schedule.section,

      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      room: schedule.room,

      course: {
        id: schedule.course.id,
        courseCode: schedule.course.courseCode,
        courseName: schedule.course.courseName,
        credits: schedule.course.credits,
      },

      instructor: {
        id: schedule.instructor.id,
        fullName: schedule.instructor.fullName,
        email: schedule.instructor.email,
        jobTitle: schedule.instructor.adminProfile?.jobTitle ?? null,
        office: schedule.instructor.adminProfile?.office ?? null,
      },

      isActive: schedule.isActive,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}
