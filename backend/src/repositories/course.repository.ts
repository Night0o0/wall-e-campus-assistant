import prisma from "../lib/prisma.js";
import { CourseQuery, CreateCourseInput, UpdateCourseInput } from "../types/course.types.js";

/**
 * The active teaching assignments of a course, projected small.
 *
 * LectureSchedule IS the teaching assignment - there is no CourseInstructor
 * model - and only ACTIVE rows count, so a course dropped from this year's
 * timetable stops being "yours" the way it stops being taught.
 *
 * Needed on every listing because the client is told per row whether it may
 * export and manage, rather than guessing and getting a 403 (D-5).
 */
const activeAssignments = {
    where: { isActive: true },
    select: { instructorId: true },
} as const;

export class CourseRepository {

    async create(data: CreateCourseInput & { createdById: string; organizationId: string }) {
        return prisma.course.create({
            data: {
                courseCode: data.courseCode,
                courseName: data.courseName,
                description: data.description,
                semester: data.semester,
                department: data.department,
                credits: data.credits,
                createdById: data.createdById,
                organizationId: data.organizationId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
        });
    }

    async findById(id: string) {
        return prisma.course.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                _count: {
                    select: { sessions: true },
                },
            },
        });
    }

    /**
     * The courses of one university, optionally narrowed.
     *
     * The tenant is a required first argument and is spread last, so no filter
     * derived from the request can displace it — the same construction as
     * UserRepository.findManyInOrganization, and for the same reason.
     */
    async findByOrganization(organizationId: string, query: CourseQuery = {}) {
        return prisma.course.findMany({
            where: {
                ...(query.search
                    ? {
                          OR: [
                              { courseCode: { contains: query.search, mode: "insensitive" } },
                              { courseName: { contains: query.search, mode: "insensitive" } },
                          ],
                      }
                    : {}),
                ...(query.department
                    ? { department: { equals: query.department, mode: "insensitive" } }
                    : {}),
                ...(query.semester
                    ? { semester: { equals: query.semester, mode: "insensitive" } }
                    : {}),
                // Resolved through the teaching assignment, because a course has
                // no level of its own. Only active schedules count: a course
                // dropped from this year's timetable is no longer taught at that
                // level, whatever it was taught at last year.
                ...(query.level !== undefined
                    ? {
                          lectureSchedules: {
                              some: { level: query.level, isActive: true },
                          },
                      }
                    : {}),

                // Last, and not optional.
                organizationId,
            },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, fullName: true },
                },
                lectureSchedules: activeAssignments,
                _count: {
                    select: { sessions: true },
                },
            },
        });
    }

    /**
     * The courses one member of staff is responsible for.
     *
     * "Assigned to OR created" - the rule PAGES_AND_GAPS.txt states for My
     * Courses, and the rule the export endpoint already enforced. Until now
     * getMyCourses used findByCreator (created-by only), and the web page did
     * not call it at all: it called the university-wide list, so an instructor
     * saw the entire catalogue under a heading reading "My Courses" (D-4).
     *
     * lectureSchedules is projected so the service can tell the client, per
     * row, whether it may export and manage - rather than the client rendering
     * a button that predictably 403s (D-5).
     */
    async findAssignedTo(userId: string, organizationId: string) {
        return prisma.course.findMany({
            where: {
                organizationId,
                OR: [
                    { createdById: userId },
                    {
                        lectureSchedules: {
                            some: { instructorId: userId, isActive: true },
                        },
                    },
                ],
            },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, fullName: true } },
                lectureSchedules: activeAssignments,
                _count: { select: { sessions: true } },
            },
        });
    }

    async findByCreator(createdById: string, organizationId: string) {
        return prisma.course.findMany({
            where: { createdById, organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { sessions: true },
                },
            },
        });
    }

    async findByCode(courseCode: string, organizationId: string) {
        return prisma.course.findUnique({
            where: {
                courseCode_organizationId: {
                    courseCode,
                    organizationId,
                },
            },
        });
    }

    async update(id: string, data: UpdateCourseInput) {
        return prisma.course.update({
            where: { id },
            data: {
                courseName: data.courseName,
                description: data.description,
                semester: data.semester,
                department: data.department,
                credits: data.credits,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
        });
    }

    async delete(id: string) {
        return prisma.course.delete({
            where: { id },
        });
    }

    /**
     * A course together with the two things that decide who may export its
     * students: who created it, and which instructors teach it.
     *
     * There is no CourseInstructor model in this schema — a LectureSchedule row
     * IS the teaching assignment (see the note on LectureSchedule). Only active
     * schedules count, so an instructor removed from the timetable loses the
     * course with it.
     */
    async findByIdForExport(id: string) {
        return prisma.course.findUnique({
            where: { id },
            select: {
                id: true,
                courseCode: true,
                courseName: true,
                department: true,
                semester: true,
                organizationId: true,
                createdById: true,
                lectureSchedules: {
                    where: { isActive: true },
                    select: {
                        instructorId: true,
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

    async findWithSessions(id: string) {
        return prisma.course.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                sessions: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        _count: {
                            select: { attendances: true },
                        },
                    },
                },
            },
        });
    }

}
