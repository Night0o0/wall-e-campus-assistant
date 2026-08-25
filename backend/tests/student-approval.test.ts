import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireApproved } from "../src/middleware/auth.middleware.js";
import { AdminRepository } from "../src/repositories/admin.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AdminService } from "../src/services/admin.service.js";
import { pendingStudentQuerySchema } from "../src/types/admin.types.js";

/**
 * Student self-registration and the approval that follows it.
 *
 * A student creates their own account, and `isVerified` defaults to false — it
 * always did, and AuthService.register never set it. The two things under test
 * are what that false now costs the student, and who is allowed to flip it.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

const INSTRUCTOR = { id: "a-staff", role: "ADMIN", organizationId: ORG_A };
const SUPER_ADMIN = {
  id: "a-super",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};

/* ------------------------------- middleware ------------------------------- */

const runGuard = (user: Record<string, unknown> | undefined) => {
  const next = vi.fn() as unknown as NextFunction;

  requireApproved(
    { user } as unknown as Request,
    {} as Response,
    next
  );

  return next as unknown as ReturnType<typeof vi.fn>;
};

describe("the approval gate", () => {
  it("stops an unapproved student", () => {
    const next = runGuard({ role: "STUDENT", isVerified: false });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      // The client branches on the code, never on the prose.
      code: "ACCOUNT_PENDING_APPROVAL",
    });
  });

  it("lets an approved student through", () => {
    const next = runGuard({ role: "STUDENT", isVerified: true });

    expect(next).toHaveBeenCalledWith();
  });

  it("does not gate staff, who are never pending", () => {
    // Staff accounts are created by an administrator who has already decided.
    // isVerified is false on this fixture precisely to prove it is not read.
    for (const role of ["ADMIN", "UNIVERSITY_SUPER_ADMIN", "SYSTEM_OWNER"]) {
      expect(runGuard({ role, isVerified: false })).toHaveBeenCalledWith();
    }
  });

  it("401s rather than 403s when there is no user at all", () => {
    const next = runGuard(undefined);

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

/* --------------------------------- service -------------------------------- */

interface StudentFixture {
  id: string;
  organizationId: string;
  role: string;
  isVerified: boolean;
  isActive: boolean;
}

const buildService = (seed: StudentFixture[]) => {
  // Cloned, because the fake below applies updates to these rows the way the
  // database would. Sharing a fixture object between tests would let one test's
  // approval leak into the next one's starting state.
  const fixtures = seed.map((row) => ({ ...row }));

  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const notices: { id: string; notice: Record<string, unknown> }[] = [];
  const listedFor: string[] = [];

  class FakeUsers extends UserRepository {
    override async findInOrganization(id: string, organizationId: string) {
      const found = fixtures.find(
        (row) => row.id === id && row.organizationId === organizationId
      );

      if (!found) {
        return null as never;
      }

      return {
        ...found,
        universityId: `NCTU-${found.id}`,
        fullName: "Youssef Nasser",
        email: `${found.id}@student.nctu.edu.eg`,
      } as never;
    }

    override async findPendingStudentsInOrganization(
      organizationId: string,
      _query: unknown
    ) {
      listedFor.push(organizationId);

      const matched = fixtures.filter(
        (row) =>
          row.organizationId === organizationId &&
          row.role === "STUDENT" &&
          !row.isVerified &&
          row.isActive
      );

      return {
        data: matched.map((row) => ({
          id: row.id,
          universityId: `NCTU-${row.id}`,
          fullName: "Youssef Nasser",
          email: `${row.id}@student.nctu.edu.eg`,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          studentProfile: {
            status: "COMPLETED",
            faculty: "Faculty of Engineering",
            department: "Mechatronics",
            level: 2,
            semester: "First Semester",
            section: "B",
            groupName: "G1",
            academicYear: "2025/2026",
            phoneNumber: "+201000000000",
          },
        })) as never,
        total: matched.length,
      };
    }

    override async update(id: string, data: Record<string, unknown>) {
      updates.push({ id, data });

      const row = fixtures.find((item) => item.id === id)!;
      Object.assign(row, data);

      return {
        id,
        universityId: `NCTU-${id}`,
        fullName: "Youssef Nasser",
        isVerified: row.isVerified,
        isActive: row.isActive,
      } as never;
    }

    override async findOrganizationName() {
      return "Nile Central Technical University";
    }

    /**
     * The real one runs both writes in a transaction. The fake records them
     * side by side, so a test can assert that a decision never arrives without
     * the notice that tells the student about it.
     */
    override async updateWithNotification(
      id: string,
      data: Record<string, unknown>,
      notice: Record<string, unknown>
    ) {
      notices.push({ id, notice });

      return this.update(id, data);
    }
  }

  return {
    updates,
    notices,
    listedFor,
    service: new AdminService(new AdminRepository(), new FakeUsers()),
  };
};

const PENDING: StudentFixture = {
  id: "pending-student",
  organizationId: ORG_A,
  role: "STUDENT",
  isVerified: false,
  isActive: true,
};

describe("the approval queue", () => {
  it("lists only the caller's own university", async () => {
    const { service, listedFor } = buildService([
      PENDING,
      { ...PENDING, id: "other-uni", organizationId: ORG_B },
    ]);

    const result = await service.listPendingStudents(
      pendingStudentQuerySchema.parse({}),
      INSTRUCTOR
    );

    expect(listedFor).toEqual([ORG_A]);
    expect(result.data.map((row) => row.id)).toEqual(["pending-student"]);
  });

  it("shows the profile the approver is being asked to judge", async () => {
    const { service } = buildService([PENDING]);

    const result = await service.listPendingStudents(
      pendingStudentQuerySchema.parse({}),
      INSTRUCTOR
    );

    // Enough to decide: department, level and section. The point of letting a
    // pending student fill their profile before approval.
    expect(result.data[0].profile).toMatchObject({
      department: "Mechatronics",
      level: 2,
      section: "B",
    });
  });

  it("does not let the caller ask for a different role or verification state", () => {
    const query = pendingStudentQuerySchema.parse({
      role: "ADMIN",
      isVerified: "true",
    } as Record<string, string>);

    expect(query).not.toHaveProperty("role");
    expect(query).not.toHaveProperty("isVerified");
  });
});

describe("approving a student", () => {
  it("records who approved, in the same write as the flag", async () => {
    const { service, updates } = buildService([PENDING]);

    const result = await service.approveStudent("pending-student", INSTRUCTOR);

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("pending-student");

    // An approval that records no approver is what the audit columns exist to
    // prevent, so the three move together or not at all.
    expect(updates[0].data).toMatchObject({
      isVerified: true,
      verifiedBy: { connect: { id: INSTRUCTOR.id } },
    });
    expect(updates[0].data.verifiedAt).toBeInstanceOf(Date);

    expect(result.isVerified).toBe(true);
    expect(result.alreadyApproved).toBe(false);
  });

  it("is idempotent, so two people working the queue do not collide", async () => {
    const { service, updates } = buildService([PENDING]);

    await service.approveStudent("pending-student", INSTRUCTOR);
    const second = await service.approveStudent("pending-student", INSTRUCTOR);

    expect(second.alreadyApproved).toBe(true);
    // The second call wrote nothing.
    expect(updates).toHaveLength(1);
  });

  it("404s on a student from another university", async () => {
    const { service, updates } = buildService([
      { ...PENDING, organizationId: ORG_B },
    ]);

    await expect(
      service.approveStudent("pending-student", INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(updates).toEqual([]);
  });

  it("404s rather than approving a member of staff", async () => {
    const { service } = buildService([
      { ...PENDING, role: "ADMIN" },
    ]);

    await expect(
      service.approveStudent("pending-student", SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("tells the student, in the same write as the approval", async () => {
    const { service, notices } = buildService([PENDING]);

    await service.approveStudent("pending-student", INSTRUCTOR);

    expect(notices).toHaveLength(1);
    expect(notices[0].id).toBe("pending-student");
    expect(notices[0].notice).toMatchObject({
      type: "ACCOUNT_APPROVED",
      organizationId: ORG_A,
    });

    // Without this the student is admitted and never told: they keep seeing
    // the waiting-for-approval screen until they happen to sign in again.
    expect(notices[0].notice.body).toContain(
      "Nile Central Technical University"
    );
  });

  it("does not notify twice when two people approve the same student", async () => {
    const { service, notices } = buildService([PENDING]);

    await service.approveStudent("pending-student", INSTRUCTOR);
    await service.approveStudent("pending-student", SUPER_ADMIN);

    expect(notices).toHaveLength(1);
  });
});

describe("rejecting a student", () => {
  it("deactivates rather than deletes, so the university ID stays claimed", async () => {
    const { service, updates } = buildService([PENDING]);

    const result = await service.rejectStudent("pending-student", INSTRUCTOR);

    expect(updates).toEqual([
      { id: "pending-student", data: { isActive: false } },
    ]);
    expect(result.isActive).toBe(false);
  });

  it("refuses to reject somebody already approved", async () => {
    const { service } = buildService([{ ...PENDING, isVerified: true }]);

    await expect(
      service.rejectStudent("pending-student", INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404s on a student from another university", async () => {
    const { service, updates } = buildService([
      { ...PENDING, organizationId: ORG_B },
    ]);

    await expect(
      service.rejectStudent("pending-student", INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(updates).toEqual([]);
  });

  it("tells the student they were turned away", async () => {
    const { service, notices } = buildService([PENDING]);

    await service.rejectStudent("pending-student", INSTRUCTOR);

    expect(notices).toHaveLength(1);
    expect(notices[0].notice).toMatchObject({
      type: "ACCOUNT_REJECTED",
      organizationId: ORG_A,
    });
  });

  it("does not name the member of staff who decided", async () => {
    // The audit columns record who; the message does not. An institutional
    // decision read as a personal one sends the student to the wrong door.
    const { service, notices } = buildService([PENDING]);

    await service.rejectStudent("pending-student", INSTRUCTOR);

    const notice = notices[0].notice as { title: string; body: string };

    expect(`${notice.title} ${notice.body}`).not.toContain(INSTRUCTOR.id);
  });
});
