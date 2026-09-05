import { AuditAction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../src/middleware/auth.middleware.js";
import type { AcademicRepository } from "../src/repositories/academic.repository.js";
import { AcademicService } from "../src/services/academic.service.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const DEPT = "22222222-2222-4222-8222-222222222222";
const OTHER_DEPT = "33333333-3333-4333-8333-333333333333";
const OFFERING = "44444444-4444-4444-8444-444444444444";
const COHORT = "55555555-5555-4555-8555-555555555555";
const STUDENT = "66666666-6666-4666-8666-666666666666";

const actor = (role: AuthenticatedUser["role"], overrides = {}): AuthenticatedUser => ({
  id: role === "STUDENT" ? STUDENT : "77777777-7777-4777-8777-777777777777",
  universityId: "U-1",
  fullName: "Test User",
  email: "test@example.com",
  role,
  accountStatus: "ACTIVE",
  isVerified: true,
  isActive: true,
  organizationId: ORG,
  departmentId: role === "UNIVERSITY_ADMIN" ? null : DEPT,
  ...overrides,
});

const offering = (overrides = {}) => ({
  id: OFFERING,
  organizationId: ORG,
  departmentId: DEPT,
  isActive: true,
  cohorts: [{ cohort: { id: COHORT } }],
  ...overrides,
});

const build = () => {
  const repo = {
    findOfferings: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findOffering: vi.fn(),
    findTeachingAssignments: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findEnrollments: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findEnrollment: vi.fn(),
    findDepartment: vi.fn(),
    findCourse: vi.fn(),
    findTerm: vi.fn(),
    findCohort: vi.fn(),
    findStudent: vi.fn(),
    findInstructor: vi.fn(),
    createOffering: vi.fn(),
    createEnrollment: vi.fn(),
    updateEnrollment: vi.fn(),
    createTeachingAssignment: vi.fn(),
    audit: vi.fn().mockResolvedValue({}),
  };
  return {
    repo,
    service: new AcademicService(repo as unknown as AcademicRepository),
  };
};

const query = { page: 1, limit: 10, sortOrder: "desc" as const };

describe("academic service authorization and integrity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes a student's offering list to their own enrollments", async () => {
    const { repo, service } = build();
    const result = await service.listOfferings(query, actor("STUDENT"));

    expect(repo.findOfferings).toHaveBeenCalledWith(ORG, query, { studentId: STUDENT });
    expect(result.meta).toMatchObject({ page: 1, total: 0, hasNext: false });
  });

  it("fails closed when a department admin has no linked department", async () => {
    const { service } = build();
    await expect(
      service.listOfferings(query, actor("DEPARTMENT_ADMIN", { departmentId: null }))
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("hides an offering from a student who is not enrolled", async () => {
    const { repo, service } = build();
    repo.findOffering.mockResolvedValue(offering());

    await expect(service.getOffering(OFFERING, actor("STUDENT"))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("prevents a department admin from managing another department", async () => {
    const { repo, service } = build();
    repo.findDepartment.mockResolvedValue({ id: OTHER_DEPT, organizationId: ORG });

    await expect(
      service.createCohort(
        {
          departmentId: OTHER_DEPT,
          name: "Level 2 A",
          academicYear: "2026/2027",
          level: 2,
        },
        actor("DEPARTMENT_ADMIN")
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("validates offering references and records an audit event", async () => {
    const { repo, service } = build();
    repo.findDepartment.mockResolvedValue({ id: DEPT, organizationId: ORG });
    repo.findCourse.mockResolvedValue({ id: "course", departmentId: DEPT });
    repo.findTerm.mockResolvedValue({ id: "term" });
    repo.findCohort.mockResolvedValue({ id: COHORT, departmentId: DEPT });
    repo.createOffering.mockResolvedValue(offering());

    await service.createOffering(
      {
        departmentId: DEPT,
        courseId: "88888888-8888-4888-8888-888888888888",
        termId: "99999999-9999-4999-8999-999999999999",
        cohortIds: [COHORT],
      },
      actor("UNIVERSITY_ADMIN")
    );

    expect(repo.createOffering).toHaveBeenCalledOnce();
    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE, resourceType: "CourseOffering" })
    );
  });

  it("refuses enrollment for an unapproved student", async () => {
    const { repo, service } = build();
    repo.findOffering.mockResolvedValue(offering());
    repo.findDepartment.mockResolvedValue({ id: DEPT, organizationId: ORG });
    repo.findStudent.mockResolvedValue({
      id: STUDENT,
      accountStatus: "ACTIVE",
      isVerified: false,
      studentProfile: { cohortId: COHORT },
    });

    await expect(
      service.createEnrollment(
        { offeringId: OFFERING, studentId: STUDENT },
        actor("UNIVERSITY_ADMIN")
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a teaching assignment to a cohort outside the offering", async () => {
    const { repo, service } = build();
    repo.findOffering.mockResolvedValue(offering({ cohorts: [] }));
    repo.findDepartment.mockResolvedValue({ id: DEPT, organizationId: ORG });
    repo.findInstructor.mockResolvedValue({ id: "instructor", departmentId: DEPT });

    await expect(
      service.createTeachingAssignment(
        {
          offeringId: OFFERING,
          instructorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          cohortId: COHORT,
          teachingRole: "LECTURER",
        },
        actor("UNIVERSITY_ADMIN")
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("audits an enrollment deactivation as DISABLE", async () => {
    const { repo, service } = build();
    repo.findEnrollment.mockResolvedValue({
      id: "enrollment",
      organizationId: ORG,
      offeringId: OFFERING,
      studentId: STUDENT,
      offering: { departmentId: DEPT },
    });
    repo.findDepartment.mockResolvedValue({ id: DEPT, organizationId: ORG });
    repo.updateEnrollment.mockResolvedValue({ id: "enrollment", isActive: false });

    await service.updateEnrollment("enrollment", { isActive: false }, actor("UNIVERSITY_ADMIN"));

    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.DISABLE, resourceType: "Enrollment" })
    );
  });
});
