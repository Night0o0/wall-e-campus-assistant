import { NotificationType, Prisma, UserRole } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy } from "../utils/pagination.js";
import { UserQuery } from "../types/user.types.js";
import { AdminUserQuery, PendingStudentQuery } from "../types/admin.types.js";

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
    accountStatus: true,
    isVerified: true,
    // Who let this student in, and when. Written by the approval queue; null on
    // staff, on students still waiting, and on anyone approved before the audit
    // columns existed.
    verifiedAt: true,
    verifiedById: true,
    isActive: true,
    organizationId: true,
    departmentId: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect;

export class UserRepository {

    async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: { email }
        });
    }

    async findByAuthUserId(authUserId: string) {
        return prisma.user.findUnique({ where: { authUserId } });
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

    async findRegistrationOptionsByOrganizationCode(code: string) {
        return prisma.organization.findUnique({
            where: { code },
            select: {
                id: true,
                name: true,
                code: true,
                academicTerms: {
                    where: { isCurrent: true },
                    select: { name: true, academicYear: true, semester: true },
                    orderBy: { startsOn: "desc" },
                    take: 1,
                },
                cohorts: {
                    where: {
                        isActive: true,
                        department: { isActive: true },
                        lectureSchedules: { some: { isActive: true } },
                    },
                    select: {
                        id: true,
                        name: true,
                        academicYear: true,
                        level: true,
                        section: true,
                        groupName: true,
                        department: { select: { id: true, code: true, name: true } },
                        lectureSchedules: {
                            where: { isActive: true },
                            select: { faculty: true, department: true, semester: true },
                            orderBy: { createdAt: "asc" },
                        },
                    },
                    orderBy: [
                        { department: { name: "asc" } },
                        { level: "asc" },
                        { section: "asc" },
                        { groupName: "asc" },
                    ],
                },
            },
        });
    }

    async findRegistrationCohort(id: string, organizationId: string) {
        return prisma.cohort.findFirst({
            where: {
                id,
                organizationId,
                isActive: true,
                department: { isActive: true },
                lectureSchedules: { some: { isActive: true } },
            },
            include: {
                department: true,
                lectureSchedules: {
                    where: { isActive: true },
                    orderBy: { createdAt: "asc" },
                },
            },
        });
    }

    /** The university's own name, for a message addressed to one of its students. */
    async findOrganizationName(id: string): Promise<string | null> {
        const organization = await prisma.organization.findUnique({
            where: { id },
            select: { name: true }
        });

        return organization?.name ?? null;
    }

    /**
     * Change an account and tell its owner, in one transaction.
     *
     * One transaction rather than two writes, because the two orderings fail in
     * different but equally unacceptable ways. Update-then-notify can leave a
     * student approved and never told, sitting in front of a "waiting for
     * approval" screen that will never change. Notify-then-update can tell them
     * they are in while they are not. Both rows commit, or neither does.
     *
     * The notification is written already SENT rather than PENDING. It is not a
     * scheduled reminder and there is nothing for the delivery worker to claim —
     * the student sees it the next time the client reads /api/notifications,
     * which is the delivery path. Push, when a provider is configured, is an
     * extra channel for it rather than the thing that makes it real.
     */
    async updateWithNotification(
        id: string,
        data: Prisma.UserUpdateInput,
        notice: {
            organizationId: string;
            type: NotificationType;
            title: string;
            body: string;
        }
    ) {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.update({ where: { id }, data });

            const now = new Date();

            await tx.notification.create({
                data: {
                    organizationId: notice.organizationId,
                    userId: id,
                    type: notice.type,
                    title: notice.title,
                    body: notice.body,
                    // No lecture, so no occurrence. Both columns are nullable
                    // for exactly this case — see NotificationType in
                    // schema.prisma.
                    scheduledFor: now,
                    sentAt: now,
                    status: "SENT"
                }
            });

            return user;
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
        passwordHash?: string;
        authUserId?: string;
        role: UserRole;
        organizationId: string;
        departmentId?: string;
        accountStatus?: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
        isVerified?: boolean;
        jobTitle?: string;
        office?: string;
        studentProfile?: {
            faculty: string;
            department: string;
            level: number;
            semester: string;
            section: string;
            groupName?: string;
            academicYear: string;
            cohortId: string;
            phoneNumber: string;
            nationalId: string;
            dateOfBirth: Date;
            status: "COMPLETED";
            completedAt: Date;
        };
    }) {
        const { jobTitle, office, studentProfile, ...user } = data;

        return prisma.user.create({
            data: {
                ...user,
                // Every student starts with an empty INCOMPLETE academic profile,
                // so the row is there the moment they log in to fill it.
                ...(data.role === "STUDENT"
                    ? { studentProfile: { create: studentProfile ?? {} } }
                    : {}),
                // Both university staff roles carry the profile that holds their
                // title. Creating one without it leaves the directory and
                // timetable with an account that cannot describe its job.
                ...(data.role === "INSTRUCTOR" ||
                data.role === "DEPARTMENT_ADMIN" ||
                data.role === "UNIVERSITY_ADMIN"
                    ? { adminProfile: { create: { jobTitle: jobTitle!, office } } }
                    : {}),
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
            ...(query.isVerified !== undefined
                ? { isVerified: query.isVerified }
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

    /**
     * The approval queue for one university: students who have registered and
     * are waiting to be let in.
     *
     * Same construction as findManyInOrganization and for the same reason — the
     * tenant is a required first argument, spread last. `role` and `isVerified`
     * sit alongside it rather than coming from the query, because this endpoint
     * answers one fixed question.
     *
     * Sorted oldest first: a queue where the longest wait is on page one.
     */
    async findPendingStudentsInOrganization(
        organizationId: string,
        query: PendingStudentQuery,
        cohortIds: string[] | null = null
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
            ...(query.profileStatus || cohortIds
                ? {
                      studentProfile: {
                          is: {
                              ...(query.profileStatus ? { status: query.profileStatus } : {}),
                              ...(cohortIds ? { cohortId: { in: cohortIds } } : {}),
                          },
                      },
                  }
                : {}),

            // Fixed by the endpoint, not by the caller.
            role: "STUDENT",
            isVerified: false,
            isActive: true,
            accountStatus: "PENDING",
            organizationId,
        };

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                ...toSkipTake(query),
                orderBy: buildOrderBy(
                    query.sortBy,
                    query.sortOrder ?? "asc",
                    DIRECTORY_SORTABLE,
                    "createdAt"
                ),
                select: {
                    ...safeUserSelect,
                    // The whole academic profile, unlike the directory listing:
                    // this is the record the approver is being asked to judge,
                    // so withholding half of it would defeat the review.
                    studentProfile: {
                        select: {
                            status: true,
                            faculty: true,
                            department: true,
                            level: true,
                            semester: true,
                            section: true,
                            groupName: true,
                            academicYear: true,
                            phoneNumber: true,
                            cohortId: true,
                        },
                    },
                },
            }),
            prisma.user.count({ where }),
        ]);

        return { data, total };
    }

    /**
     * One user, but only if they belong to this organization.
     *
     * Every campus-scoped write goes through here first. A super admin holding
     * another university's user id gets null, and the service turns that into a
     * 404 — the id is never confirmed as real.
     */
    async findInOrganization(id: string, organizationId: string) {
        return prisma.user.findFirst({
            where: { id, organizationId },
            select: {
                ...safeUserSelect,
                adminProfile: {
                    select: { jobTitle: true, office: true },
                },
                studentProfile: {
                    select: {
                        status: true,
                        faculty: true,
                        department: true,
                        level: true,
                        semester: true,
                        section: true,
                        cohortId: true,
                    },
                },
            },
        });
    }

    async findAuthUserIdInOrganization(id: string, organizationId: string) {
        return prisma.user.findFirst({
            where: { id, organizationId },
            select: { authUserId: true },
        });
    }

    /**
     * Creates a staff or student account inside one university, together with
     * the profile row its role requires, in a single transaction — Prisma's
     * nested create is one statement, so an INSTRUCTOR can never exist without the
     * AdminProfile that carries their job title.
     */
    async createInOrganization(data: {
        universityId: string;
        fullName: string;
        email: string;
        passwordHash?: string;
        authUserId?: string;
        role: "DEPARTMENT_ADMIN" | "INSTRUCTOR" | "STUDENT";
        organizationId: string;
        departmentId?: string;
        accountStatus?: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
        isVerified: boolean;
        jobTitle?: string;
        office?: string;
    }) {
        const { jobTitle, office, ...user } = data;

        return prisma.user.create({
            data: {
                ...user,
                ...(user.role === "INSTRUCTOR" || user.role === "DEPARTMENT_ADMIN"
                    ? { adminProfile: { create: { jobTitle: jobTitle!, office } } }
                    : { studentProfile: { create: {} } }),
            },
            select: safeUserSelect,
        });
    }

    /** Upserts the profile side of a staff edit. */
    async updateAdminProfile(
        userId: string,
        data: { jobTitle?: string; office?: string }
    ) {
        return prisma.adminProfile.update({
            where: { userId },
            data,
            select: { jobTitle: true, office: true },
        });
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
