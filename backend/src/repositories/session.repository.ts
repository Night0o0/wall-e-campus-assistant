import { Prisma, SessionCloseReason } from "@prisma/client";
import prisma from "../lib/prisma.js";

/**
 * The timetable entry behind a session, when it has one. Small on purpose: a
 * session view needs to say which lecture it belongs to and where, not to
 * reproduce the whole schedule record.
 */
const scheduleSummary = {
    select: {
        id: true,
        room: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isActive: true,
        course: { select: { id: true, courseCode: true, courseName: true } },
        instructor: { select: { id: true, fullName: true } },
    },
} satisfies Prisma.LectureScheduleDefaultArgs;

/**
 * The course a session belongs to. Small on purpose, and the same shape
 * wherever a session is projected, so a robot's screen and an admin's list
 * name a course identically.
 */
const courseSummary = {
    select: { id: true, courseCode: true, courseName: true },
} satisfies Prisma.CourseDefaultArgs;

/**
 * How many people actually turned up — the number every `attendanceCount` in
 * this API means.
 *
 * ABSENT is excluded, and the exclusion is the whole point of this constant
 * existing. An Attendance row is written for two entirely different reasons: a
 * student scanned (PRESENT or LATE), or the roll was called and they were not
 * there (ABSENT). An unfiltered `_count` over the relation therefore stops
 * meaning "attendance" the moment the absence sweep runs and starts meaning
 * "cohort size" — a lecture three people came to would report 24.
 *
 * This is the same rule AttendanceRepository.getSessionStats already applies to
 * its `total`, and it is defined here as one object used by every session
 * projection so the robot's screen, the admin's list and the attendance log
 * cannot answer the question differently from each other. Where the roll size
 * is what is wanted, `getSessionStats` reports it separately as `roll`.
 */
export const attendedCount = {
    select: { attendances: { where: { status: { not: 'ABSENT' } } } },
} satisfies Prisma.SessionCountOutputTypeDefaultArgs;

/**
 * How a room-bound device's request is turned into a filter.
 *
 * `room: null` on the device means unbound — it serves every open session in
 * its university, and no room clause is applied at all.
 */
export interface ActiveSessionFilter {
    /** The device's binding. Null or undefined means "no room filter". */
    room?: string | null;
    /**
     * Whether sessions with no room recorded are visible to a bound device.
     *
     * A session opened before Phase 2, or opened ad hoc with no timetable entry,
     * has `room = null` — it is not in another room, it is in no known room, so
     * a binding has nothing to exclude it by. Including them keeps every
     * existing deployment working; excluding them is the stricter reading, and
     * is what DEVICE_ROOM_FILTER_STRICT selects. Ignored when `room` is null.
     */
    includeUnlocated?: boolean;
}

export class SessionRepository {

    /**
     * `courseId` is written here but never accepted from a request body — see
     * SessionService.createSession, which derives it from the linked lecture
     * after that lecture has been checked against the caller's organization.
     * Null for an ad-hoc session, which is the behaviour every session had
     * before the timetable link existed.
     */
    async create(data: {
        title: string;
        createdById: string;
        organizationId: string;
        lectureScheduleId?: string | null;
        courseId?: string | null;
        room?: string | null;
    }) {
        return prisma.session.create({
            data: {
                title: data.title,
                createdById: data.createdById,
                organizationId: data.organizationId,
                lectureScheduleId: data.lectureScheduleId ?? null,
                courseId: data.courseId ?? null,
                room: data.room ?? null,
            },
            include: { course: courseSummary, lectureSchedule: scheduleSummary },
        });
    }

    async findById(id: string) {
        return prisma.session.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                course: courseSummary,
                lectureSchedule: scheduleSummary,
            },
        });
    }

    /**
     * Everything the scan path needs, and nothing it does not.
     *
     * A separate projection from `findById` rather than a widening of the
     * shared `scheduleSummary`, for two reasons. The academic address —
     * faculty, department, level, semester, section — is what decides whether a
     * student is entitled to be in this lecture, and it has no business
     * appearing in the robot's session list or an admin's session view, which
     * both use that summary. And the scan response is a contract with the
     * mobile client: it should be visible here exactly which columns feed it.
     *
     * `qrSecret` is selected because verifying the presented token is the whole
     * point of this read. It never reaches a response — see ScanSuccess.
     */
    async findForScan(id: string) {
        return prisma.session.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                organizationId: true,
                room: true,
                qrSecret: true,
                status: true,
                startTime: true,
                courseId: true,
                course: courseSummary,
                lectureScheduleId: true,
                lectureSchedule: {
                    select: {
                        id: true,
                        organizationId: true,
                        // The academic address the cohort check compares.
                        faculty: true,
                        department: true,
                        level: true,
                        semester: true,
                        section: true,
                        // The lecture's own clock, for the success payload and
                        // for the session-window arithmetic.
                        startTime: true,
                        endTime: true,
                        instructor: { select: { id: true, fullName: true } },
                    },
                },
            },
        });
    }

    async findByOrganization(organizationId: string) {
        return prisma.session.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, fullName: true },
                },
                course: courseSummary,
                lectureSchedule: scheduleSummary,
                _count: attendedCount,
            },
        });
    }

    /**
     * The organization's currently open sessions, for the robot/tablet that has
     * to decide which QR code to put on screen.
     *
     * `organizationId` is a required argument rather than an optional filter:
     * this is read on behalf of a device, and a device must never be able to see
     * a session belonging to another university. The room filter can only ever
     * narrow that further — it is applied on top of the tenant clause, never
     * instead of it.
     *
     * Room comparison is case-insensitive because `room` is free text on both
     * sides: whoever typed "b-204" into the timetable and whoever typed "B-204"
     * onto the device meant the same wall.
     */
    async findActiveByOrganization(
        organizationId: string,
        filter: ActiveSessionFilter = {}
    ) {
        const where: Prisma.SessionWhereInput = {
            organizationId,
            status: 'ACTIVE',
        };

        if (filter.room) {
            const inThisRoom: Prisma.SessionWhereInput = {
                room: { equals: filter.room, mode: 'insensitive' },
            };

            Object.assign(
                where,
                filter.includeUnlocated
                    ? { OR: [inThisRoom, { room: null }] }
                    : inThisRoom
            );
        }

        return prisma.session.findMany({
            where,
            orderBy: { startTime: 'desc' },
            select: {
                id: true,
                title: true,
                // `status` and `startTime` are also what isScannable needs. The
                // window depends on the linked lecture's duration, so the
                // expiry test cannot be pushed into this WHERE clause without
                // reimplementing that arithmetic in SQL — it is applied in the
                // service instead, against the one definition in
                // utils/session-window.ts.
                status: true,
                startTime: true,
                courseId: true,
                course: courseSummary,
                room: true,
                lectureScheduleId: true,
                lectureSchedule: scheduleSummary,
                _count: attendedCount,
            },
        });
    }

    async findByCreator(createdById: string, organizationId: string) {
        return prisma.session.findMany({
            where: { createdById, organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                course: courseSummary,
                lectureSchedule: scheduleSummary,
                _count: attendedCount,
            },
        });
    }

    /**
     * The denominator of a course's attendance percentage: sessions that have
     * finished. An open session is one students can still scan into, so it is
     * not something anybody can yet have missed.
     */
    async countClosedByCourse(courseId: string, organizationId: string) {
        return prisma.session.count({
            where: { courseId, organizationId, status: 'CLOSED' },
        });
    }

    async updateStatus(
        id: string,
        status: 'ACTIVE' | 'CLOSED',
        endTime?: Date,
        closeReason?: SessionCloseReason
    ) {
        return prisma.session.update({
            where: { id },
            data: {
                status,
                endTime,
                ...(closeReason ? { closeReason } : {}),
            },
        });
    }

    /* --------------------------- Lifecycle sweeps --------------------------- */

    /**
     * Every open session, with the two facts needed to decide whether it has
     * gone stale: when it opened, and how long its lecture runs.
     *
     * Not filtered by age in SQL, because "too old" is not a fixed interval —
     * it depends on the duration of the lecture behind each row. The set is
     * small by nature (the sessions open on one campus right now), so it is
     * cheaper to read it and decide in one pure function than to approximate
     * the predicate in the query and get it subtly wrong.
     */
    async findOpenForStaleCheck(limit: number) {
        return prisma.session.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { startTime: 'asc' },
            take: limit,
            select: {
                id: true,
                organizationId: true,
                startTime: true,
                status: true,
                lectureSchedule: { select: { startTime: true, endTime: true } },
            },
        });
    }

    /**
     * Closes a session only if it is still open, and reports whether it was
     * this call that did it.
     *
     * The status is part of the WHERE rather than checked beforehand, so two
     * sweeps racing each other cannot both close the same session: one gets a
     * count of 1, the other a count of 0, and neither overwrites the other's
     * endTime or closeReason. That is what makes the stale sweep idempotent
     * under repetition *and* under concurrency.
     */
    async closeIfOpen(id: string, endTime: Date, reason: SessionCloseReason) {
        const { count } = await prisma.session.updateMany({
            where: { id, status: 'ACTIVE' },
            data: { status: 'CLOSED', endTime, closeReason: reason },
        });

        return count === 1;
    }

    /**
     * Closed sessions whose roll has not been called.
     *
     * `absencesSweptAt: null` is the whole claim check. A session that has been
     * swept is never selected again, however often the sweep runs.
     */
    async findClosedAwaitingSweep(limit: number) {
        return prisma.session.findMany({
            where: { status: 'CLOSED', absencesSweptAt: null },
            orderBy: { endTime: 'asc' },
            take: limit,
            select: {
                id: true,
                organizationId: true,
                lectureScheduleId: true,
                // The anchor for the sibling-session lookup in sweepOne: two
                // sessions of one occurrence are found by how near they opened.
                startTime: true,
                lectureSchedule: {
                    select: {
                        id: true,
                        organizationId: true,
                        faculty: true,
                        department: true,
                        level: true,
                        semester: true,
                        section: true,
                    },
                },
            },
        });
    }

    /**
     * Records that the roll has been called. Guarded on the column still being
     * null so a re-entrant sweep cannot move a timestamp it did not write.
     */
    async markAbsencesSwept(id: string, at: Date) {
        const { count } = await prisma.session.updateMany({
            where: { id, absencesSweptAt: null },
            data: { absencesSweptAt: at },
        });

        return count === 1;
    }

    /**
     * The sessions opened against one lecture inside a window — the query that
     * decides whether an occurrence is NOT_RECORDED.
     *
     * `organizationId` is required, not optional: this backs a read of one
     * university's attendance history.
     */
    async findByScheduleBetween(
        lectureScheduleId: string,
        organizationId: string,
        from: Date,
        to: Date
    ) {
        return prisma.session.findMany({
            where: {
                lectureScheduleId,
                organizationId,
                startTime: { gte: from, lt: to },
            },
            orderBy: { startTime: 'asc' },
            select: {
                id: true,
                title: true,
                status: true,
                startTime: true,
                endTime: true,
                room: true,
                closeReason: true,
                absencesSweptAt: true,
                lectureSchedule: { select: { startTime: true, endTime: true } },
                _count: attendedCount,
            },
        });
    }

    /**
     * Sessions opened against one lecture inside a window, identity only.
     *
     * Backs two callers that ask the same question for different reasons:
     * SessionService, deciding whether this occurrence has already been opened,
     * and AttendanceLifecycleService, finding the sibling sessions of a session
     * it is about to call the roll on. Both must agree on what "the same
     * occurrence" means, so both go through this one query and the one window
     * definition in utils/session-window.ts.
     */
    async findOpenedForScheduleBetween(
        lectureScheduleId: string,
        organizationId: string,
        from: Date,
        to: Date
    ) {
        return prisma.session.findMany({
            where: {
                lectureScheduleId,
                organizationId,
                startTime: { gte: from, lt: to },
            },
            orderBy: { startTime: 'asc' },
            select: { id: true, title: true, status: true, startTime: true },
        });
    }

    async findActiveByCreator(createdById: string) {
        return prisma.session.findMany({
            where: {
                createdById,
                status: 'ACTIVE',
            },
        });
    }

}
