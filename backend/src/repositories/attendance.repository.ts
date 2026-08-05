import prisma from "../lib/prisma.js";

export class AttendanceRepository {

    async create(data: { studentId: string; sessionId: string; status?: 'PRESENT' | 'LATE' }) {
        return prisma.attendance.create({
            data: {
                studentId: data.studentId,
                sessionId: data.sessionId,
                status: data.status || 'PRESENT',
            },
        });
    }

    async findByStudentAndSession(studentId: string, sessionId: string) {
        return prisma.attendance.findUnique({
            where: {
                studentId_sessionId: {
                    studentId,
                    sessionId,
                },
            },
        });
    }

    async findBySession(sessionId: string) {
        return prisma.attendance.findMany({
            where: { sessionId },
            include: {
                student: {
                    select: {
                        id: true,
                        universityId: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
            orderBy: { scanTime: 'asc' },
        });
    }

    async findByStudent(studentId: string) {
        return prisma.attendance.findMany({
            where: { studentId },
            include: {
                session: {
                    select: {
                        id: true,
                        title: true,
                        startTime: true,
                        endTime: true,
                        status: true,
                    },
                },
            },
            orderBy: { scanTime: 'desc' },
        });
    }

    async countBySession(sessionId: string) {
        return prisma.attendance.count({
            where: { sessionId },
        });
    }

    async getSessionStats(sessionId: string) {
        const counts = await prisma.attendance.groupBy({
            by: ['status'],
            where: { sessionId },
            _count: true,
        });

        let present = 0;
        let late = 0;

        counts.forEach((c) => {
            if (c.status === 'PRESENT') present = c._count;
            if (c.status === 'LATE') late = c._count;
        });

        return {
            total: present + late,
            present,
            late,
        };
    }

    async getAdminAnalytics(adminId: string, organizationId: string) {
        // Get all sessions by this admin within their organization
        const sessions = await prisma.session.findMany({
            where: { createdById: adminId, organizationId },
            include: {
                _count: { select: { attendances: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalSessions = sessions.length;

        // Get unique students across all admin's sessions
        const uniqueStudents = await prisma.attendance.findMany({
            where: {
                session: { createdById: adminId, organizationId }
            },
            distinct: ['studentId'],
            select: { studentId: true }
        });

        // Get today's and this week's sessions
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        const todaySessions = sessions.filter(s => s.createdAt >= startOfDay).length;
        const weekSessions = sessions.filter(s => s.createdAt >= startOfWeek).length;

        // Last 10 sessions with attendance count for trend
        const recentSessions = sessions.slice(0, 10).map(s => ({
            id: s.id,
            title: s.title,
            status: s.status,
            startTime: s.startTime,
            attendanceCount: s._count.attendances
        }));

        // Average attendance
        const totalAttendances = sessions.reduce((sum, s) => sum + s._count.attendances, 0);
        const averageAttendance = totalSessions > 0 ? Math.round(totalAttendances / totalSessions) : 0;

        return {
            totalSessions,
            totalUniqueStudents: uniqueStudents.length,
            averageAttendancePerSession: averageAttendance,
            todaySessions,
            weekSessions,
            recentSessions
        };
    }

}
