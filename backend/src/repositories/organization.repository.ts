import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy } from "../utils/pagination.js";
import { OrganizationQuery } from "../types/organization.types.js";

const SORTABLE = ["name", "code", "createdAt", "updatedAt"] as const;

const listInclude = {
  _count: {
    select: { users: true, courses: true, sessions: true },
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

  async findById(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            courses: true,
            sessions: true,
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
