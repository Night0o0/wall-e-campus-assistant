import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy, PaginationQuery } from "../utils/pagination.js";

const SORTABLE = ["createdAt", "paidAt", "amount", "status"] as const;

type PaymentQuery = PaginationQuery & {
  status?: Prisma.PaymentWhereInput["status"];
  organizationId?: string;
};

const withRelations = {
  organization: { select: { id: true, name: true, code: true } },
  invoice: { select: { id: true, invoiceNumber: true, total: true } },
} satisfies Prisma.PaymentInclude;

export class PaymentRepository {
  async findMany(query: PaymentQuery) {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.search) {
      where.OR = [
        { transactionId: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        {
          organization: {
            name: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
        include: withRelations,
      }),
      prisma.payment.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return prisma.payment.findUnique({ where: { id }, include: withRelations });
  }

  async create(data: Prisma.PaymentCreateInput) {
    return prisma.payment.create({ data, include: withRelations });
  }

  async update(id: string, data: Prisma.PaymentUpdateInput) {
    return prisma.payment.update({ where: { id }, data, include: withRelations });
  }

  async recent(limit: number) {
    return prisma.payment.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: withRelations,
    });
  }

  /**
   * Completed payment totals per month, for the revenue time series.
   * The month is formatted in SQL as a YYYY-MM string so it never round-trips
   * through a JS Date, which would re-interpret it in the local timezone and
   * shift every bucket by a month.
   */
  async monthlyTotals(since: Date) {
    return prisma.$queryRaw<Array<{ month: string; total: number; count: bigint }>>`
      SELECT to_char(date_trunc('month', COALESCE("paidAt", "createdAt")), 'YYYY-MM') AS month,
             SUM("amount")::float8 AS total,
             COUNT(*) AS count
      FROM "Payment"
      WHERE "status" = 'COMPLETED'
        AND COALESCE("paidAt", "createdAt") >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  async sumCompletedBetween(start: Date, end: Date) {
    const result = await prisma.payment.aggregate({
      where: {
        status: "COMPLETED",
        OR: [
          { paidAt: { gte: start, lt: end } },
          { paidAt: null, createdAt: { gte: start, lt: end } },
        ],
      },
      _sum: { amount: true },
      _count: true,
    });

    return {
      total: Number(result._sum.amount ?? 0),
      count: result._count,
    };
  }
}
