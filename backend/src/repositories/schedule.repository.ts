import { DayOfWeek, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { buildOrderBy, toSkipTake } from "../utils/pagination.js";

const SORTABLE = ["dayOfWeek", "startTime", "level", "createdAt"] as const;

/**
 * A timetable row is unreadable without the course it teaches and the person
 * teaching it, so both always travel with it. AdminProfile.jobTitle is the
 * academic title ("Associate Professor") — there is no professor role.
 */
const withRelations = {
  course: {
    select: {
      id: true,
      courseCode: true,
      courseName: true,
      credits: true,
    },
  },
  instructor: {
    select: {
      id: true,
      fullName: true,
      email: true,
      adminProfile: { select: { jobTitle: true, office: true } },
    },
  },
} satisfies Prisma.LectureScheduleInclude;

export type ScheduleWithRelations = Prisma.LectureScheduleGetPayload<{
  include: typeof withRelations;
}>;

/**
 * What a lecture reminder is written from: the cohort it addresses, the slot it
 * occupies, the course it names and the instructor it is sent to — including
 * whether that instructor's account is still active.
 */
const reminderSelect = {
  id: true,
  organizationId: true,
  faculty: true,
  department: true,
  level: true,
  semester: true,
  section: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  room: true,
  isActive: true,
  course: { select: { id: true, courseCode: true, courseName: true } },
  instructor: {
    select: {
      id: true,
      fullName: true,
      role: true,
      isActive: true,
      organizationId: true,
    },
  },
} satisfies Prisma.LectureScheduleSelect;

export type ScheduleForReminders = Prisma.LectureScheduleGetPayload<{
  select: typeof reminderSelect;
}>;

/**
 * Faculty, department, section and room are free text on both sides of every
 * comparison, so "Mechatronics" and "mechatronics" have to mean the same
 * thing — otherwise a student's own typing decides whether they see lectures.
 */
const sameText = (value: string): Prisma.StringFilter => ({
  equals: value.trim(),
  mode: "insensitive",
});

/** Filters the repository understands. organizationId is never optional. */
export interface ScheduleFilter {
  organizationId: string;
  courseId?: string;
  instructorId?: string;
  faculty?: string;
  department?: string;
  section?: string;
  room?: string;
  level?: number;
  semester?: number;
  dayOfWeek?: DayOfWeek;
  isActive?: boolean;
  search?: string;
}

/** The slot a candidate lecture wants to occupy. */
export interface SlotProbe {
  organizationId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  /** The schedule being edited, which must not clash with itself. */
  excludeId?: string;
}

export class ScheduleRepository {
  async create(
    data: Omit<Prisma.LectureScheduleUncheckedCreateInput, "id">
  ) {
    return prisma.lectureSchedule.create({
      data,
      include: withRelations,
    });
  }

  async findById(id: string) {
    return prisma.lectureSchedule.findUnique({
      where: { id },
      include: withRelations,
    });
  }

  async findMany(
    filter: ScheduleFilter,
    page: { page: number; limit: number; sortBy?: string; sortOrder: "asc" | "desc" }
  ) {
    const where = this.buildWhere(filter);

    const [data, total] = await Promise.all([
      prisma.lectureSchedule.findMany({
        where,
        ...toSkipTake(page),
        orderBy: page.sortBy
          ? [buildOrderBy(page.sortBy, page.sortOrder, SORTABLE, "dayOfWeek")]
          : [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        include: withRelations,
      }),
      prisma.lectureSchedule.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * The distinct academic audiences an instructor teaches, with no day/time.
   *
   * Course material is targeted at a course and an academic audience, not at a
   * lecture occurrence — but a lecture row is the only place this schema records
   * that an instructor teaches a given faculty/department/level/semester/section
   * of a course. So the set of audiences an instructor may publish to is exactly
   * the set of addresses across their own active lectures, collapsed so the two
   * weekly slots of one course to one cohort become a single publishable target.
   *
   * Only active lectures count: a deactivated lecture no longer represents a
   * standing teaching assignment. The projection deliberately omits dayOfWeek,
   * startTime, endTime and room — the caller must not be able to reintroduce a
   * single occurrence into what is meant to be an occurrence-independent target.
   */
  async findInstructorAudiences(organizationId: string, instructorId: string) {
    return prisma.lectureSchedule.findMany({
      where: { organizationId, instructorId, isActive: true },
      select: {
        faculty: true,
        department: true,
        level: true,
        semester: true,
        section: true,
        course: { select: { id: true, courseCode: true, courseName: true } },
      },
      orderBy: [
        { faculty: "asc" },
        { department: "asc" },
        { level: "asc" },
        { semester: "asc" },
        { section: "asc" },
      ],
    });
  }

  /** The unpaginated week, in reading order — used by the personal timetables. */
  async findTimetable(filter: ScheduleFilter) {
    return prisma.lectureSchedule.findMany({
      where: this.buildWhere(filter),
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: withRelations,
    });
  }

  /**
   * Every active lecture on the platform, for the reminder generator.
   *
   * Deliberately not tenant-scoped: this is the one caller that legitimately
   * spans organizations, because it runs as the system rather than on behalf of
   * a user. Isolation is kept where it matters instead — each schedule's own
   * organizationId is carried through to the recipients it resolves, so a
   * lecture can only ever reach students of the university that owns it.
   *
   * The select is its own, not `withRelations`: a reminder needs the
   * instructor's account state (a deactivated instructor gets no reminder),
   * which the timetable projection has no reason to expose.
   */
  async findActiveForReminders() {
    return prisma.lectureSchedule.findMany({
      where: { isActive: true },
      select: reminderSelect,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }

  /** The same projection for a single lecture — used by the dev simulator. */
  async findByIdForReminders(id: string) {
    return prisma.lectureSchedule.findUnique({
      where: { id },
      select: reminderSelect,
    });
  }

  async update(id: string, data: Prisma.LectureScheduleUncheckedUpdateInput) {
    return prisma.lectureSchedule.update({
      where: { id },
      data,
      include: withRelations,
    });
  }

  /**
   * Two lectures clash when one starts before the other ends and ends after
   * the other starts. 10:00-12:00 and 11:00-13:00 overlap; 10:00-12:00 and
   * 12:00-13:00 do not — a lecture ending exactly when the next begins is fine.
   *
   * Only active lectures can be clashed with: a deactivated one has released
   * its slot but is kept for history.
   */
  private overlapping(probe: SlotProbe): Prisma.LectureScheduleWhereInput {
    return {
      organizationId: probe.organizationId,
      dayOfWeek: probe.dayOfWeek,
      isActive: true,
      startTime: { lt: probe.endTime },
      endTime: { gt: probe.startTime },
      ...(probe.excludeId ? { id: { not: probe.excludeId } } : {}),
    };
  }

  async findInstructorConflict(instructorId: string, probe: SlotProbe) {
    return prisma.lectureSchedule.findFirst({
      where: { ...this.overlapping(probe), instructorId },
      include: withRelations,
    });
  }

  async findRoomConflict(room: string, probe: SlotProbe) {
    return prisma.lectureSchedule.findFirst({
      where: { ...this.overlapping(probe), room: sameText(room) },
      include: withRelations,
    });
  }

  private buildWhere(filter: ScheduleFilter): Prisma.LectureScheduleWhereInput {
    const where: Prisma.LectureScheduleWhereInput = {
      organizationId: filter.organizationId,
    };

    if (filter.courseId) where.courseId = filter.courseId;
    if (filter.instructorId) where.instructorId = filter.instructorId;
    if (filter.faculty) where.faculty = sameText(filter.faculty);
    if (filter.department) where.department = sameText(filter.department);
    if (filter.section) where.section = sameText(filter.section);
    if (filter.room) where.room = sameText(filter.room);
    if (filter.level !== undefined) where.level = filter.level;
    if (filter.semester !== undefined) where.semester = filter.semester;
    if (filter.dayOfWeek) where.dayOfWeek = filter.dayOfWeek;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;

    if (filter.search) {
      where.OR = [
        { room: { contains: filter.search, mode: "insensitive" } },
        {
          course: {
            is: {
              OR: [
                { courseCode: { contains: filter.search, mode: "insensitive" } },
                { courseName: { contains: filter.search, mode: "insensitive" } },
              ],
            },
          },
        },
        {
          instructor: {
            is: { fullName: { contains: filter.search, mode: "insensitive" } },
          },
        },
      ];
    }

    return where;
  }
}
