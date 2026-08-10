import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake, buildOrderBy, PaginationQuery } from "../utils/pagination.js";

const SORTABLE = ["createdAt", "dueDate", "total", "status"] as const;

type InvoiceQuery = PaginationQuery & {
  status?: Prisma.InvoiceWhereInput["status"];
  organizationId?: string;
};

const withRelations = {
  organization: { select: { id: true, name: true, code: true } },
  payments: { select: { id: true, amount: true, status: true, paidAt: true } },
} satisfies Prisma.InvoiceInclude;

export class InvoiceRepository {
  async findMany(query: InvoiceQuery) {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        {
          organization: {
            name: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
        include: withRelations,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return prisma.invoice.findUnique({ where: { id }, include: withRelations });
  }

  async create(data: Prisma.InvoiceCreateInput) {
    return prisma.invoice.create({ data, include: withRelations });
  }

  async update(id: string, data: Prisma.InvoiceUpdateInput) {
    return prisma.invoice.update({ where: { id }, data, include: withRelations });
  }

  async delete(id: string) {
    return prisma.invoice.delete({ where: { id } });
  }

  /** Sequential invoice number scoped to the current year: INV-2026-0001 */
  async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const latest = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });

    const nextSequence = latest
      ? Number(latest.invoiceNumber.slice(prefix.length)) + 1
      : 1;

    return `${prefix}${String(nextSequence).padStart(4, "0")}`;
  }

  async sumByStatus(status: Prisma.InvoiceWhereInput["status"]) {
    const result = await prisma.invoice.aggregate({
      where: { status },
      _sum: { total: true },
      _count: true,
    });

    return {
      total: Number(result._sum.total ?? 0),
      count: result._count,
    };
  }

  async countOverdue(now: Date) {
    return prisma.invoice.aggregate({
      where: {
        status: { in: ["SENT", "OVERDUE"] },
        dueDate: { lt: now },
      },
      _sum: { total: true },
      _count: true,
    });
  }
}
