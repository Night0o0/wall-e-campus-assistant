import prisma from "../lib/prisma.js";

export class SessionRepository {

    async create(data: { title: string; createdById: string; organizationId: string }) {
        return prisma.session.create({
            data: {
                title: data.title,
                createdById: data.createdById,
                organizationId: data.organizationId,
            },
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
                _count: {
                    select: { attendances: true },
                },
            },
        });
    }

    async findByCreator(createdById: string, organizationId: string) {
        return prisma.session.findMany({
            where: { createdById, organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { attendances: true },
                },
            },
        });
    }

    async updateStatus(id: string, status: 'ACTIVE' | 'CLOSED', endTime?: Date) {
        return prisma.session.update({
            where: { id },
            data: {
                status,
                endTime,
            },
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
