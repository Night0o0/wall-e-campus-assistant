import prisma from "../lib/prisma.js";
import { CreateCourseInput, UpdateCourseInput } from "../types/course.types.js";

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

    async findByOrganization(organizationId: string) {
        return prisma.course.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, fullName: true },
                },
                _count: {
                    select: { sessions: true },
                },
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
