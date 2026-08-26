import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import type { DepartmentQuery } from "../types/department.types.js";
import { buildOrderBy, toSkipTake } from "../utils/pagination.js";

const SORTABLE = ["name", "code", "createdAt"] as const;

export class DepartmentRepository {
  async findMany(organizationId: string, query: DepartmentQuery, id?: string) {
    const where: Prisma.DepartmentWhereInput = {
      organizationId,
      ...(id ? { id } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { code: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.department.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          SORTABLE,
          "name"
        ),
        include: {
          _count: { select: { members: true, courses: true, cohorts: true } },
        },
      }),
      prisma.department.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string, organizationId: string) {
    return prisma.department.findFirst({ where: { id, organizationId } });
  }

  findByCode(code: string, organizationId: string) {
    return prisma.department.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });
  }

  create(organizationId: string, data: { code: string; name: string }) {
    return prisma.department.create({ data: { organizationId, ...data } });
  }

  update(id: string, data: Prisma.DepartmentUpdateInput) {
    return prisma.department.update({ where: { id }, data });
  }
}
