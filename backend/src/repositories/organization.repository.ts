import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy } from "../utils/pagination.js";
import { OrganizationQuery } from "../types/organization.types.js";

const SORTABLE = ["name", "code", "createdAt", "updatedAt"] as const;

const listInclude = {
  subscription: { include: { plan: true } },
  _count: {
    select: { users: true, courses: true, sessions: true, invoices: true },
  },
} satisfies Prisma.OrganizationInclude;

export class OrganizationRepository {
  private buildWhere(query: OrganizationQuery): Prisma.OrganizationWhereInput {
    const where: Prisma.OrganizationWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.status === "NONE") {
      where.subscriptionId = null;
    } else if (query.status) {
      where.subscription = { status: query.status };
    }

    if (query.planId) {
      where.subscription = { ...(where.subscription as object), planId: query.planId };
    }

    return where;
  }

  async findMany(query: OrganizationQuery) {
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
        include: listInclude,
      }),
      prisma.organization.count({ where }),
    ]);

    return { data, total };
  }

  /** Total completed payments per organization, in one query instead of N. */
  async revenueByOrganization(organizationIds: string[]) {
    if (organizationIds.length === 0) return new Map<string, number>();

    const rows = await prisma.payment.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: organizationIds },
        status: "COMPLETED",
      },
      _sum: { amount: true },
    });

    return new Map(
      rows.map((row) => [row.organizationId, Number(row._sum.amount ?? 0)])
    );
  }

  async findById(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        _count: {
          select: {
            users: true,
            courses: true,
            sessions: true,
            invoices: true,
            payments: true,
          },
        },
      },
    });
  }

  async findByCode(code: string) {
    return prisma.organization.findUnique({ where: { code } });
  }

  async create(data: Prisma.OrganizationCreateInput) {
    return prisma.organization.create({
      data,
      include: listInclude,
    });
  }

  async update(id: string, data: Prisma.OrganizationUpdateInput) {
    return prisma.organization.update({
      where: { id },
      data,
      include: listInclude,
    });
  }

  async delete(id: string) {
    return prisma.organization.delete({ where: { id } });
  }

  async countUsers(organizationId: string) {
    return prisma.user.count({ where: { organizationId } });
  }

  /** Users grouped by role for a single organization. */
  async userBreakdown(organizationId: string) {
    const rows = await prisma.user.groupBy({
      by: ["role"],
      where: { organizationId },
      _count: true,
    });

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.role] = row._count;
      return acc;
    }, {});
  }
}
