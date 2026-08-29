import { DayOfWeek } from "@prisma/client";
import {
  ScheduleRepository,
  ScheduleWithRelations,
} from "../../src/repositories/schedule.repository.js";
import { ORG_A } from "./device-fakes.js";

/**
 * An in-memory ScheduleRepository, for the rules SessionService applies when a
 * session is opened against a timetable entry.
 *
 * Extends the real repository, like every other double here, so any method left
 * un-overridden would try to reach Postgres and fail loudly rather than quietly
 * returning nothing.
 */

export interface ScheduleOptions {
  id?: string;
  organizationId?: string;
  instructorId?: string;
  /** The course a session opened against this lecture inherits. */
  courseId?: string;
  room?: string;
  isActive?: boolean;
}

export const makeSchedule = (
  options: ScheduleOptions = {}
): ScheduleWithRelations => {
  const id = options.id ?? "schedule-1";
  const instructorId = options.instructorId ?? "instructor-1";
  const courseId = options.courseId ?? "course-1";

  return {
    id,
    organizationId: options.organizationId ?? ORG_A,
    departmentId: null,
    cohortId: null,
    offeringId: null,
    teachingAssignmentId: null,
    courseId,
    instructorId,
    faculty: "Engineering",
    department: "Mechatronics",
    level: 2,
    semester: 1,
    section: "A",
    dayOfWeek: DayOfWeek.SUNDAY,
    startTime: "10:00",
    endTime: "12:00",
    room: options.room ?? "B-204",
    isActive: options.isActive ?? true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    course: {
      id: courseId,
      courseCode: "MEC201",
      courseName: "Electronics",
      credits: 3,
    },
    instructor: {
      id: instructorId,
      fullName: "Dr. Adel Mansour",
      email: "adel.mansour@cu.edu.eg",
      adminProfile: { jobTitle: "Associate Professor", office: "B-310" },
    },
  };
};

export class FakeScheduleRepository extends ScheduleRepository {
  readonly rows = new Map<string, ScheduleWithRelations>();

  constructor(seed: ScheduleWithRelations[] = []) {
    super();

    for (const schedule of seed) {
      this.rows.set(schedule.id, schedule);
    }
  }

  /**
   * Deliberately not tenant-scoped, exactly like the real one. The tenant check
   * belongs to the service, and a fake that quietly performed it here would
   * make a service that had forgotten it look correct.
   */
  override async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
}
