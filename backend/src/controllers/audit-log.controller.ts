import type { Request, Response } from "express";
import { AuditLogService } from "../services/audit-log.service.js";
import type { AuditLogQuery } from "../types/audit-log.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const auditLogs = new AuditLogService();

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const result = await auditLogs.list(
    req.validatedQuery as AuditLogQuery,
    req.user!
  );

  res.status(200).json(result);
});
