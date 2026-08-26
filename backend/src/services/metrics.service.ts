import prisma from "../lib/prisma.js";

const startOfMonth = (date: Date, offset = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

const percentChange = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

export class MetricsService {
  async overview(_months = 8) {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);

    const [
      organizations,
      users,
      students,
      courses,
      sessions,
      orgsBeforeThisMonth,
      usersBeforeThisMonth,
      studentsBeforeThisMonth,
      topOrganizations,
      recentOrganizations,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.course.count(),
      prisma.session.count(),
      prisma.organization.count({ where: { createdAt: { lt: thisMonthStart } } }),
      prisma.user.count({ where: { createdAt: { lt: thisMonthStart } } }),
      prisma.user.count({
        where: { role: "STUDENT", createdAt: { lt: thisMonthStart } },
      }),
      prisma.organization.findMany({
        take: 5,
        orderBy: { users: { _count: "desc" } },
        select: {
          id: true,
          name: true,
          code: true,
          _count: {
            select: { users: true, courses: true, sessions: true },
          },
        },
      }),
      prisma.organization.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          createdAt: true,
          _count: {
            select: { users: true, courses: true },
          },
        },
      }),
    ]);

    return {
      totals: {
        organizations,
        users,
        students,
        courses,
        sessions,
      },
      changes: {
        organizations: percentChange(organizations, orgsBeforeThisMonth),
        users: percentChange(users, usersBeforeThisMonth),
        students: percentChange(students, studentsBeforeThisMonth),
      },
      topOrganizations: topOrganizations.map((org) => ({
        id: org.id,
        name: org.name,
        code: org.code,
        users: org._count.users,
        courses: org._count.courses,
        sessions: org._count.sessions,
      })),
      recentOrganizations: recentOrganizations.map((org) => ({
        id: org.id,
        name: org.name,
        code: org.code,
        createdAt: org.createdAt,
        users: org._count.users,
        courses: org._count.courses,
      })),
    };
  }
}
