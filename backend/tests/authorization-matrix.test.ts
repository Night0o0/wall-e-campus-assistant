import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireApproved, requireRole } from "../src/middleware/auth.middleware.js";
import { hasPermission } from "../src/utils/authorization.js";
import { canSeeSession, isSessionOperator } from "../src/utils/session-access.js";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEPT_A = "department-a";
const DEPT_B = "department-b";

const actor = (role: string, overrides: Record<string, unknown> = {}) => ({
  id: `${role.toLowerCase()}-1`,
  universityId: "NCTU-1",
  fullName: "Test User",
  email: "user@example.invalid",
  role,
  accountStatus: "ACTIVE",
  isVerified: true,
  isActive: true,
  organizationId: ORG_A,
  departmentId: DEPT_A,
  ...overrides,
});

const run = (
  middleware: ReturnType<typeof requireRole> | typeof requireApproved,
  user: Record<string, unknown> | undefined,
  body: Record<string, unknown> = {}
) => {
  const next = vi.fn() as unknown as NextFunction;
  middleware({ user, body } as unknown as Request, {} as Response, next);
  return next as unknown as ReturnType<typeof vi.fn>;
};

describe("role middleware uses the authenticated database projection", () => {
  it("does not accept a role escalation from the request body", () => {
    const next = run(
      requireRole("UNIVERSITY_ADMIN"),
      actor("STUDENT"),
      { role: "UNIVERSITY_ADMIN", organizationId: ORG_B }
    );

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it("returns 401 when no authenticated principal exists", () => {
    const next = run(requireRole("STUDENT"), undefined);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it("keeps pending students out of academic routes while allowing profile completion", () => {
    const pending = actor("STUDENT", {
      accountStatus: "PENDING",
      isVerified: false,
    });
    const next = run(requireApproved, pending);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      code: "ACCOUNT_PENDING_APPROVAL",
    });
  });
});

describe("tenant and department permissions", () => {
  const departmentAdmin = actor("DEPARTMENT_ADMIN");
  const instructor = actor("INSTRUCTOR");

  it("never lets a university role cross its tenant", () => {
    for (const principal of [departmentAdmin, instructor, actor("UNIVERSITY_ADMIN")]) {
      expect(
        hasPermission(principal as never, "people:read", {
          organizationId: ORG_B,
          departmentId: DEPT_A,
        })
      ).toBe(false);
    }
  });

  it("limits a department administrator to the linked department", () => {
    expect(
      hasPermission(departmentAdmin as never, "course:manage", {
        organizationId: ORG_A,
        departmentId: DEPT_A,
      })
    ).toBe(true);
    expect(
      hasPermission(departmentAdmin as never, "course:manage", {
        organizationId: ORG_A,
        departmentId: DEPT_B,
      })
    ).toBe(false);
  });

  it("does not let an instructor become a university administrator", () => {
    expect(
      hasPermission(instructor as never, "university:manage", {
        organizationId: ORG_A,
        departmentId: DEPT_A,
      })
    ).toBe(false);
  });
});

describe("attendance-session authority", () => {
  const session = { organizationId: ORG_A, createdById: "instructor-1" };

  it("permits only the three explicit session operator roles", () => {
    expect(isSessionOperator(actor("INSTRUCTOR") as never)).toBe(true);
    expect(isSessionOperator(actor("UNIVERSITY_ADMIN") as never)).toBe(true);
    expect(isSessionOperator(actor("SYSTEM_OWNER") as never)).toBe(true);
    expect(isSessionOperator(actor("DEPARTMENT_ADMIN") as never)).toBe(false);
    expect(isSessionOperator(actor("STUDENT") as never)).toBe(false);
  });

  it("limits instructors to their own sessions", () => {
    expect(canSeeSession(session, actor("INSTRUCTOR") as never)).toBe(true);
    expect(
      canSeeSession(session, actor("INSTRUCTOR", { id: "instructor-2" }) as never)
    ).toBe(false);
  });

  it("denies students and department admins even inside the tenant", () => {
    expect(canSeeSession(session, actor("STUDENT") as never)).toBe(false);
    expect(canSeeSession(session, actor("DEPARTMENT_ADMIN") as never)).toBe(false);
  });

  it("never crosses the tenant", () => {
    expect(
      canSeeSession(session, actor("UNIVERSITY_ADMIN", { organizationId: ORG_B }) as never)
    ).toBe(false);
  });
});
