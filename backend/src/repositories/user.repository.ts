import { Prisma, UserRole } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy } from "../utils/pagination.js";
import { UserQuery } from "../types/user.types.js";
import { AdminUserQuery } from "../types/admin.types.js";

const SORTABLE = ["fullName", "email", "role", "createdAt"] as const;

/** Sort keys the university directory accepts. */
const DIRECTORY_SORTABLE = [
    "fullName",
    "universityId",
    "email",
    "role",
    "createdAt",
] as const;

/** Never select passwordHash into anything that can reach a response. */
export const safeUserSelect = {
    id: true,
    universityId: true,
    fullName: true,
    email: true,
    role: true,
    isVerified: true,
    isActive: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect;

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

    async findByIdWithOrganization(id: string) {
        return prisma.user.findUnique({
            where: { id },
            include: {
                organization: {
                    select: { id: true, name: true, code: true, logo: true },
                },
            },
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
        isVerified?: boolean;
    }) {
        return prisma.user.create({
            data: {
                ...data,
                // Every student starts with an empty INCOMPLETE academic profile,
                // so the row is there the moment they log in to fill it.
                ...(data.role === "STUDENT" ? { studentProfile: { create: {} } } : {}),
            },
        });
    }

    private buildWhere(query: UserQuery): Prisma.UserWhereInput {
        const where: Prisma.UserWhereInput = {};

        if (query.search) {
            where.OR = [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { universityId: { contains: query.search, mode: "insensitive" } },
            ];
        }

        if (query.role) {
            where.role = query.role;
        }

        if (query.organizationId) {
            where.organizationId = query.organizationId;
        }

        if (query.isActive !== undefined) {
            where.isActive = query.isActive;
        }

        return where;
    }

    async findMany(query: UserQuery) {
        const where = this.buildWhere(query);

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                ...toSkipTake(query),
                orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
                select: {
                    ...safeUserSelect,
                    organization: { select: { id: true, name: true, code: true } },
                },
            }),
            prisma.user.count({ where }),
        ]);

        return { data, total };
    }

    /**
     * The user directory for one university.
     *
     * Deliberately NOT `findMany` with an organizationId filter. That method
     * takes its organization from `query.organizationId`, which is a client
     * supplied value — safe there because only SYSTEM_OWNER can reach it, and
     * the owner is allowed to browse any tenant. Reusing it here would mean one
     * forgotten line between a university super admin and every other
     * university's user list.
     *
     * So the tenant is a separate, required, first argument, and it is spread
     * LAST into the where clause: no filter derived from the request can
     * overwrite it, whatever a future edit to the query schema adds.
     */
    async findManyInOrganization(
        organizationId: string,
        query: AdminUserQuery
    ) {
        const where: Prisma.UserWhereInput = {
            ...(query.search
                ? {
                      OR: [
                          { fullName: { contains: query.search, mode: "insensitive" } },
                          { email: { contains: query.search, mode: "insensitive" } },
                          { universityId: { contains: query.search, mode: "insensitive" } },
                      ],
                  }
                : {}),
            ...(query.role ? { role: query.role } : {}),
            ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
            ...(query.profileStatus
                ? { studentProfile: { is: { status: query.profileStatus } } }
                : {}),

            // Last, and not optional.
            organizationId,
        };

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                ...toSkipTake(query),
                orderBy: buildOrderBy(
                    query.sortBy,
                    query.sortOrder,
                    DIRECTORY_SORTABLE,
                    "fullName"
                ),
                select: {
                    ...safeUserSelect,
                    // The academic columns a directory shows. nationalId, phone
                    // and date of birth are not selected: a staff list view has
                    // no use for a student's personal identifiers.
                    studentProfile: {
                        select: {
                            status: true,
                            faculty: true,
                            department: true,
                            level: true,
                            semester: true,
                            section: true,
                        },
                    },
                },
            }),
            prisma.user.count({ where }),
        ]);

        return { data, total };
    }

    async findByIdSafe(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                ...safeUserSelect,
                organization: { select: { id: true, name: true, code: true } },
                _count: {
                    select: {
                        attendances: true,
                        createdCourses: true,
                        createdSessions: true,
                    },
                },
            },
        });
    }

    async update(id: string, data: Prisma.UserUpdateInput) {
        return prisma.user.update({
            where: { id },
            data,
            select: safeUserSelect,
        });
    }

    async updatePassword(id: string, passwordHash: string) {
        return prisma.user.update({
            where: { id },
            data: { passwordHash },
            select: { id: true },
        });
    }

    async delete(id: string) {
        return prisma.user.delete({ where: { id } });
    }

    async countByRole() {
        const rows = await prisma.user.groupBy({
            by: ["role"],
            _count: true,
        });

        return rows.reduce<Record<string, number>>((acc, row) => {
            acc[row.role] = row._count;
            return acc;
        }, {});
    }

    async countActive(isActive: boolean) {
        return prisma.user.count({ where: { isActive } });
    }

}
