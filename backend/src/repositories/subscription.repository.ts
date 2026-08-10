import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy } from "../utils/pagination.js";
import { PaginationQuery } from "../utils/pagination.js";

const SORTABLE = ["createdAt", "currentPeriodEnd", "status"] as const;

type SubscriptionQuery = PaginationQuery & {
  status?: Prisma.SubscriptionWhereInput["status"];
  planId?: string;
};

const withRelations = {
  plan: true,
  organization: { select: { id: true, name: true, code: true, logo: true } },
} satisfies Prisma.SubscriptionInclude;

export class SubscriptionRepository {
  async findMany(query: SubscriptionQuery) {
    const where: Prisma.SubscriptionWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.planId) {
      where.planId = query.planId;
    }

    if (query.search) {
      where.organization = {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { code: { contains: query.search, mode: "insensitive" } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
        include: withRelations,
      }),
      prisma.subscription.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return prisma.subscription.findUnique({
      where: { id },
      include: withRelations,
    });
  }

  async update(id: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({
      where: { id },
      data,
      include: withRelations,
    });
  }

  async countByStatus() {
    const rows = await prisma.subscription.groupBy({
      by: ["status"],
      _count: true,
    });

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count;
      return acc;
    }, {});
  }

  /** Every subscription that currently bills, with its plan pricing. */
  async activeWithPlans() {
    return prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    });
  }
}
