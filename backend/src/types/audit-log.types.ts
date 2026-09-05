import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

export const auditLogQuerySchema = paginationSchema
  .omit({ search: true })
  .extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().min(1).max(120).optional(),
    action: z.nativeEnum(AuditAction).optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
    resourceId: z.string().trim().min(1).max(120).optional(),
    actorId: z.string().uuid().optional(),
    sortBy: z.enum(["createdAt", "action", "resourceType"]).optional(),
  });

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
