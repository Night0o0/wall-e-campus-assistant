import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import type { AuditLogQuery } from "../types/audit-log.types.js";
import { buildOrderBy, toSkipTake } from "../utils/pagination.js";

const SORTABLE = ["createdAt", "action", "resourceType"] as const;

export class AuditLogRepository {
  async findMany(organizationId: string, query: AuditLogQuery) {
    const where = {
      organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                resourceType: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
              {
                resourceId: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
              {
                actor: {
                  is: {
                    OR: [
                      {
                        fullName: {
                          contains: query.search,
                          mode: "insensitive",
                        },
                      },
                      {
                        email: {
                          contains: query.search,
                          mode: "insensitive",
                        },
                      },
                      {
                        universityId: {
                          contains: query.search,
                          mode: "insensitive",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.AuditLogWhereInput;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, "createdAt"),
        include: {
          actor: {
            select: {
              id: true,
              universityId: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total };
  }
}
