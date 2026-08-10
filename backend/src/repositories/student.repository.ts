import { Prisma, ProfileStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";

/**
 * The owning user is always carried along: the university ID and name live on
 * User, and the profile is meaningless without them.
 */
const withUser = {
  user: {
    select: {
      id: true,
      universityId: true,
      fullName: true,
      email: true,
      role: true,
      organizationId: true,
    },
  },
} satisfies Prisma.StudentProfileInclude;

export type StudentProfileWithUser = Prisma.StudentProfileGetPayload<{
  include: typeof withUser;
}>;

/** The academic address a cohort is identified by. */
export interface CohortCriteria {
  organizationId: string;
  faculty: string;
  department: string;
  level: number;
  section: string;
}

/**
 * Faculty, department and section are free text on both sides of the
 * comparison, so they are matched case-insensitively — the same rule the
 * timetable lookup uses.
 *
 * Semester is absent on purpose: a schedule stores 1 or 2 while a profile
 * stores free text ("First Semester", "Fall 2025"), which no SQL comparison can
 * reconcile. Callers narrow on it with parseSemesterNumber.
 */
const cohortWhere = (criteria: CohortCriteria): Prisma.StudentProfileWhereInput => {
  const sameText = (value: string): Prisma.StringFilter => ({
    equals: value.trim(),
    mode: "insensitive",
  });

  return {
    faculty: sameText(criteria.faculty),
    department: sameText(criteria.department),
    section: sameText(criteria.section),
    level: criteria.level,
    user: {
      organizationId: criteria.organizationId,
      role: "STUDENT",
      isActive: true,
    },
  };
};

export class StudentRepository {
  async findByUserId(userId: string) {
    return prisma.studentProfile.findUnique({
      where: { userId },
      include: withUser,
    });
  }

  /** Creates the empty INCOMPLETE shell a student fills in later. */
  async create(userId: string) {
    return prisma.studentProfile.create({
      data: { userId },
      include: withUser,
    });
  }

  async update(
    userId: string,
    data: Prisma.StudentProfileUpdateInput & {
      status: ProfileStatus;
      completedAt: Date | null;
    }
  ) {
    return prisma.studentProfile.update({
      where: { userId },
      data,
      include: withUser,
    });
  }

  /**
   * The active students sitting in one lecture's cohort, for the lecture
   * reminder generator. Just the keys it needs to address them.
   *
   * `organizationId` is a required argument rather than an optional filter: the
   * cohort keys are free text that different universities reuse ("Faculty of
   * Engineering", section "A"), so a query missing the tenant would quietly
   * address the right cohort at the wrong university.
   */
  async findCohort(criteria: CohortCriteria) {
    return prisma.studentProfile.findMany({
      where: cohortWhere(criteria),
      select: {
        semester: true,
        user: { select: { id: true, organizationId: true } },
      },
    });
  }

  /**
   * The same cohort, with the columns a roster export prints.
   *
   * Deliberately a separate method rather than a widened `findCohort`: the
   * reminder generator resolves cohorts on every pass and has no use for names
   * or email addresses, and nationalId is not selected by either — it is
   * personal data that no roster needs.
   */
  async findCohortProfiles(criteria: CohortCriteria) {
    return prisma.studentProfile.findMany({
      where: cohortWhere(criteria),
      select: {
        faculty: true,
        department: true,
        level: true,
        semester: true,
        section: true,
        groupName: true,
        user: {
          select: {
            id: true,
            universityId: true,
            fullName: true,
            email: true,
            organizationId: true,
          },
        },
      },
    });
  }

  /**
   * The students who have actually attended this course, whoever they are.
   *
   * A course with no timetable row addresses no cohort, and one whose cohort
   * has been edited since the term began no longer describes everybody who sat
   * in the room. Attendance is the record of who was really there, so the
   * roster is the union of the two.
   */
  async findAttendeesOfCourse(courseId: string, organizationId: string) {
    return prisma.user.findMany({
      where: {
        organizationId,
        role: "STUDENT",
        attendances: {
          some: {
            // Tenant-scoped on the session as well: a course id from another
            // university could not reach here, and does not rely on that.
            session: { courseId, organizationId },
          },
        },
      },
      select: {
        id: true,
        universityId: true,
        fullName: true,
        email: true,
        organizationId: true,
        studentProfile: {
          select: {
            faculty: true,
            department: true,
            level: true,
            semester: true,
            section: true,
            groupName: true,
          },
        },
      },
    });
  }
}
