import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditAction } from "@prisma/client";
import { AuditLogService } from "../src/services/audit-log.service.js";

const repository = {
  findMany: vi.fn(),
};

const ACTOR = {
  id: "ua-1",
  universityId: "NCTU-ADM-1",
  fullName: "Nour Hassan",
  email: "nour@nctu.edu.eg",
  role: "UNIVERSITY_ADMIN" as const,
  accountStatus: "ACTIVE" as const,
  isVerified: true,
  isActive: true,
  organizationId: "org-a",
  departmentId: null,
};

describe("audit log service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists audit entries only inside the caller's organization and paginates them", async () => {
    repository.findMany.mockResolvedValue({
      data: [
        {
          id: "audit-1",
          organizationId: "org-a",
          action: AuditAction.PUBLISH,
          resourceType: "Assignment",
          resourceId: "assignment-1",
        },
      ],
      total: 1,
    });

    const service = new AuditLogService(repository as never);
    const query = {
      page: 1,
      limit: 50,
      sortOrder: "desc" as const,
      action: AuditAction.PUBLISH,
      resourceType: "Assignment",
    };

    const result = await service.list(query, ACTOR);

    expect(repository.findMany).toHaveBeenCalledWith("org-a", query);
    expect(result.meta).toMatchObject({
      page: 1,
      limit: 50,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });
});
