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
