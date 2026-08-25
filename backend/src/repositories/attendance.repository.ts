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

    /**
     * One student's attendance history.
     *
     * The course is included rather than left to the client to resolve: without
     * it a per-subject history page has to issue one extra request per row to
     * discover which subject the row belongs to. It is nullable because
     * Session.courseId is — a session may be opened ad hoc with no course
     * behind it, and those rows belong in the history too, just not under any
     * subject heading.
     */
    async findByStudent(studentId: string, filter: { courseId?: string } = {}) {
        return prisma.attendance.findMany({
            where: {
                studentId,
                ...(filter.courseId
                    ? { session: { is: { courseId: filter.courseId } } }
                    : {}),
            },
            include: {
                session: {
                    select: {
                        id: true,
                        title: true,
                        startTime: true,
                        endTime: true,
                        status: true,
                        room: true,
                        course: {
                            select: {
                                id: true,
                                courseCode: true,
                                courseName: true,
                            },
                        },
                    },
                },
            },
            orderBy: { scanTime: 'desc' },
        });
    }

    /**
     * Every attendance row this student holds, reduced to just the two columns
     * a tally needs: the status, and the course it happened under.
     *
     * Not a groupBy. Prisma cannot group across a relation, and the grouping key
     * here — the course — lives on Session rather than on Attendance, so a
     * database-side aggregate would need a raw query. One student's attendance
     * over one degree is a few hundred rows at most, and two selected columns of
     * it is small enough that the service can do the arithmetic.
     *
     * What this counts is rows, and rows are the only thing it can honestly
     * count. A lecture nobody ever opened a session for produces no row at all,
     * so it is absent from both the numerator and the denominator — see the
     * AttendanceStatus comment in schema.prisma. Whatever the caller renders,
     * the total is "recorded lectures" and never "lectures".
     */
    async findStatusesByStudent(studentId: string) {
        return prisma.attendance.findMany({
            where: { studentId },
            select: {
                status: true,
                session: {
                    select: {
                        course: {
                            select: {
                                id: true,
                                courseCode: true,
                                courseName: true,
                            },
                        },
                    },
                },
            },
        });
    }

    /** Who already has a row for this session, whatever its status. */
    async findStudentIdsBySession(sessionId: string) {
        const rows = await prisma.attendance.findMany({
            where: { sessionId },
            select: { studentId: true },
        });

        return new Set(rows.map((row) => row.studentId));
    }

    /**
     * Who actually turned up to any of these sessions.
     *
     * PRESENT and LATE only, and the exclusion of ABSENT is the point: this
     * answers "is there evidence this student was there", and an ABSENT row is
     * evidence of the opposite. Used by the absence sweep to look across the
     * sibling sessions of one lecture occurrence, so that a student who scanned
     * into a duplicate session of the same occurrence is never marked absent
     * from the other one — see AttendanceLifecycleService.sweepOne.
     */
    async findAttendedStudentIdsBySessions(sessionIds: string[]) {
        if (sessionIds.length === 0) {
            return new Set<string>();
        }

        const rows = await prisma.attendance.findMany({
            where: {
                sessionId: { in: sessionIds },
                status: { not: 'ABSENT' },
            },
            select: { studentId: true },
            distinct: ['studentId'],
        });

        return new Set(rows.map((row) => row.studentId));
    }

    /**
     * Writes the absences for one session.
     *
     * `skipDuplicates` over the unique [studentId, sessionId] constraint is the
     * second of two independent idempotency guarantees, and the one that holds
     * even under a race: the sweep already skips sessions it has swept, but if
     * two passes overlapped, or a student scanned between the read of the
     * existing rows and this insert, the database refuses to overwrite the
     * genuine PRESENT row with a fabricated ABSENT one. An absence is never
     * allowed to win against evidence that somebody was there.
     *
     * Nothing here updates or deletes. The only thing this method can do to the
     * table is add rows for students who have none.
     */
    async createAbsences(sessionId: string, studentIds: string[], at: Date) {
        if (studentIds.length === 0) {
            return 0;
        }

        const { count } = await prisma.attendance.createMany({
            data: studentIds.map((studentId) => ({
                studentId,
                sessionId,
                status: 'ABSENT' as const,
                // The roll-call instant, not a scan: nobody scanned.
                scanTime: at,
            })),
            skipDuplicates: true,
        });

        return count;
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
        let absent = 0;

        counts.forEach((c) => {
            if (c.status === 'PRESENT') present = c._count;
            if (c.status === 'LATE') late = c._count;
            if (c.status === 'ABSENT') absent = c._count;
        });

        return {
            // `total` is who turned up, and deliberately excludes ABSENT: it is
            // the number this figure has always meant, and adding the swept
            // absences into it would silently change every existing caller's
            // idea of how many people attended. The cohort size is
            // present + late + absent, and is reported as `roll` instead.
            total: present + late,
            present,
            late,
            absent,
            roll: present + late + absent,
        };
    }

    /**
     * How many of a course's finished sessions each student turned up to.
     *
     * Only CLOSED sessions are counted, here and in the denominator: a session
     * that is still open is one students can still scan into, and counting it
     * would show everybody at 0% for a lecture that is in progress.
     *
     * PRESENT and LATE both count as attended — an Attendance row exists only
     * because somebody scanned, and arriving late is not the same as missing it.
     */
    async countAttendedByCourse(courseId: string, organizationId: string) {
        const rows = await prisma.attendance.groupBy({
            by: ['studentId'],
            where: {
                status: { not: 'ABSENT' },
                session: { courseId, organizationId, status: 'CLOSED' },
            },
            _count: { _all: true },
        });

        return new Map(rows.map((row) => [row.studentId, row._count._all]));
    }

    async getAdminAnalytics(adminId: string, organizationId: string) {
        // Get all sessions by this admin within their organization.
        // ABSENT is excluded from the count for the same reason it is excluded
        // everywhere else a figure is called "attendance": these numbers feed
        // `attendanceCount` and `averageAttendancePerSession`, and counting the
        // roll-call absences would turn both into cohort size the moment the
        // sweep first runs. See the note on `attendedCount` in
        // session.repository.ts.
        const sessions = await prisma.session.findMany({
            where: { createdById: adminId, organizationId },
            include: {
                _count: {
                    select: { attendances: { where: { status: { not: 'ABSENT' } } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalSessions = sessions.length;

        // Students who actually attended one of this admin's sessions. An
        // ABSENT row means the opposite, so it must not put somebody in here.
        const uniqueStudents = await prisma.attendance.findMany({
            where: {
                session: { createdById: adminId, organizationId },
                status: { not: 'ABSENT' }
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
