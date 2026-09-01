import type { AuthenticatedUser } from "../middleware/auth.middleware.js";
import { AuditLogRepository } from "../repositories/audit-log.repository.js";
import type { AuditLogQuery } from "../types/audit-log.types.js";
import { paginate } from "../utils/pagination.js";

export class AuditLogService {
  constructor(private readonly auditLogs = new AuditLogRepository()) {}

  async list(query: AuditLogQuery, actor: AuthenticatedUser) {
    const { data, total } = await this.auditLogs.findMany(
      actor.organizationId,
      query
    );

    return paginate(data, total, query);
  }
}
