import prisma from "../lib/prisma.js";
import { UserRole } from "@prisma/client";

export class UserRepository {

    async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: { email }
        });
    }

    async findById(id: string) {
        return prisma.user.findUnique({
            where: { id }
        });
    }

    async findOrganizationByCode(code: string) {
        return prisma.organization.findUnique({
            where: { code }
        });
    }

    async findByUniversityId(universityId: string) {
        return prisma.user.findUnique({
            where: { universityId }
        });
    }

    async create(data: {
        universityId: string;
        fullName: string;
        email: string;
        passwordHash: string;
        role: UserRole;
        organizationId: string;
    }) {
        return prisma.user.create({
            data
        });
    }

}