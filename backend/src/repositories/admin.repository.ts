import prisma from "../lib/prisma.js";

/**
 * Reads for the university administration console.
 *
 * This is a reporting repository rather than a model repository: a dashboard
 * counts across User, Course, LectureSchedule, Session and Attendance at once,
 * and scattering five org-scoped count methods over five model repositories
 * would hide the one property that actually matters here — that every single
 * query is filtered by the same organizationId.
 *
 * `organizationId` is the first argument of every method for the same reason.
 * It is a required parameter, never part of an options object where it could be
 * left undefined by accident and quietly widen a count to the whole platform.
 */

export interface OrganizationOverviewWindow {
  /** Midnight today on the campus clock. */
  startOfToday: Date;
  /** Midnight on the Sunday that began the current academic week. */
  startOfWeek: Date;
}

export class AdminRepository {
  async organizationOverview(
    organizationId: string,
    window: OrganizationOverviewWindow
  ) {
    const { startOfToday, startOfWeek } = window;

    const [
      activeStudents,
      inactiveStudents,
      staff,
      incompleteProfiles,
      courses,
      activeLectures,
      activeSessions,
      sessionsToday,
      sessionsClosedThisWeek,
      scansThisWeek,
    ] = await Promise.all([
      prisma.user.count({
        where: { organizationId, role: "STUDENT", isActive: true },
      }),
      prisma.user.count({
        where: { organizationId, role: "STUDENT", isActive: false },
      }),
      prisma.user.count({
        where: {
          organizationId,
          role: { in: ["INSTRUCTOR", "UNIVERSITY_ADMIN"] },
          isActive: true,
        },
      }),
      // Students who have registered but not finished Feature 1 — they are the
      // ones who will silently receive no timetable and no reminders.
      prisma.studentProfile.count({
        where: {
          status: "INCOMPLETE",
          user: { organizationId, role: "STUDENT", isActive: true },
        },
      }),
      prisma.course.count({ where: { organizationId } }),
      prisma.lectureSchedule.count({ where: { organizationId, isActive: true } }),
      prisma.session.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.session.count({
        where: { organizationId, createdAt: { gte: startOfToday } },
      }),
      prisma.session.count({
        where: {
          organizationId,
          status: "CLOSED",
          createdAt: { gte: startOfWeek },
        },
      }),
      // Scans, not students: one row per student per session.
      prisma.attendance.count({
        where: {
          session: { organizationId, createdAt: { gte: startOfWeek } },
        },
      }),
    ]);

    return {
      activeStudents,
      inactiveStudents,
      staff,
      incompleteProfiles,
      courses,
      activeLectures,
      activeSessions,
      sessionsToday,
      sessionsClosedThisWeek,
      scansThisWeek,
    };
  }

  /** The organization's own name and code, for the dashboard header. */
  async findOrganization(organizationId: string) {
    return prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, code: true },
    });
  }
}
