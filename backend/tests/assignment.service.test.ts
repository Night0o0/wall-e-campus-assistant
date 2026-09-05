import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  studentProfile: {
    findUnique: vi.fn(),
  },
  assignment: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  courseOffering: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  courseOfferingCohort: {
    count: vi.fn(),
  },
  enrollment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  assignmentGrade: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  default: prisma,
}));

const { AssignmentService } = await import("../src/services/assignment.service.js");

const ORG = "org-a";
const DEPT = "dept-a";
const OFFERING = {
  id: "offering-1",
  organizationId: ORG,
  departmentId: DEPT,
  teachingAssignments: [{ instructorId: "instructor-1", isActive: true }],
};

const INSTRUCTOR = {
  id: "instructor-1",
  universityId: "NCTU-INST-1",
  fullName: "Amina Ali",
  email: "amina@nctu.edu.eg",
  role: "INSTRUCTOR" as const,
  accountStatus: "ACTIVE" as const,
  isVerified: true,
  isActive: true,
  organizationId: ORG,
  departmentId: DEPT,
};

const STUDENT = {
  id: "student-1",
  universityId: "NCTU-1001",
  fullName: "Karim Adel",
  email: "karim@nctu.edu.eg",
  role: "STUDENT" as const,
  accountStatus: "ACTIVE" as const,
  isVerified: true,
  isActive: true,
  organizationId: ORG,
  departmentId: null,
};

describe("assignment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates and scopes a student assignment list to enrollment and cohort", async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ cohortId: "cohort-1" });
    prisma.assignment.findMany.mockResolvedValue([{ id: "assignment-3" }]);
    prisma.assignment.count.mockResolvedValue(3);

    const service = new AssignmentService();
    const result = await service.list(STUDENT, {
      page: 2,
      limit: 2,
      sortOrder: "asc",
      search: "control",
      sortBy: "deadline",
    });

    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 2,
        take: 2,
        orderBy: [{ deadline: "asc" }],
        where: expect.objectContaining({
          organizationId: ORG,
          isPublished: true,
          offering: {
            enrollments: { some: { studentId: STUDENT.id, isActive: true } },
          },
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.any(Array),
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                { cohorts: { none: {} } },
                { cohorts: { some: { cohortId: "cohort-1" } } },
              ]),
            }),
          ]),
        }),
        include: expect.objectContaining({
          grades: {
            where: { studentId: STUDENT.id, publishedAt: { not: null } },
            select: {
              score: true,
              feedback: true,
              gradedAt: true,
              publishedAt: true,
            },
          },
        }),
      })
    );
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("paginates and filters a staff assignment list inside the actor scope", async () => {
    prisma.assignment.findMany.mockResolvedValue([{ id: "assignment-1" }]);
    prisma.assignment.count.mockResolvedValue(1);

    const service = new AssignmentService();
    const result = await service.list(INSTRUCTOR, {
      page: 1,
      limit: 25,
      sortOrder: "desc",
      sortBy: "createdAt",
      isPublished: true,
      search: "quiz",
      offeringId: "offering-1",
    });

    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        orderBy: [{ createdAt: "desc" }, { deadline: "asc" }],
        where: expect.objectContaining({
          organizationId: ORG,
          offeringId: "offering-1",
          isPublished: true,
          offering: {
            teachingAssignments: {
              some: { instructorId: INSTRUCTOR.id, isActive: true },
            },
          },
          OR: expect.any(Array),
        }),
      })
    );
    expect(result.data).toEqual([{ id: "assignment-1" }]);
  });

  it("creates an assignment, grade item, and audit entry together", async () => {
    prisma.courseOffering.findUnique.mockResolvedValue(OFFERING);
    prisma.courseOfferingCohort.count.mockResolvedValue(1);

    const tx = {
      assignment: {
        create: vi.fn().mockResolvedValue({
          id: "assignment-1",
          title: "Quiz 1",
          maxScore: new Prisma.Decimal(100),
        }),
      },
      gradeItem: {
        create: vi.fn().mockResolvedValue({ id: "grade-item-1" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (client: any) => unknown) =>
      callback(tx)
    );

    const service = new AssignmentService();
    const assignment = await service.create(
      {
        offeringId: OFFERING.id,
        title: "Quiz 1",
        description: "Closed-book quiz",
        deadline: new Date("2026-09-01T10:00:00.000Z"),
        maxScore: 100,
        cohortIds: ["cohort-1"],
        isPublished: false,
      },
      INSTRUCTOR
    );

    expect(tx.assignment.create).toHaveBeenCalled();
    expect(tx.gradeItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentId: "assignment-1",
        category: "ASSIGNMENT",
        name: "Quiz 1",
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorId: INSTRUCTOR.id,
        action: "CREATE",
        resourceType: "Assignment",
        resourceId: "assignment-1",
      },
    });
    expect(assignment.id).toBe("assignment-1");
  });

  it("refuses a grade higher than the assignment maximum", async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: "assignment-1",
      organizationId: ORG,
      offeringId: OFFERING.id,
      maxScore: new Prisma.Decimal(100),
    });
    prisma.courseOffering.findUnique.mockResolvedValue(OFFERING);

    const service = new AssignmentService();

    await expect(
      service.grade(
        "assignment-1",
        "student-2",
        { score: 101, feedback: null, publish: false },
        INSTRUCTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
    expect(prisma.assignmentGrade.upsert).not.toHaveBeenCalled();
  });

  it("upserts a grade for an enrolled student and can publish it immediately", async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: "assignment-1",
      organizationId: ORG,
      offeringId: OFFERING.id,
      maxScore: new Prisma.Decimal(100),
    });
    prisma.courseOffering.findUnique.mockResolvedValue(OFFERING);
    prisma.enrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });
    prisma.assignmentGrade.upsert.mockResolvedValue({ id: "grade-1" });

    const service = new AssignmentService();
    await service.grade(
      "assignment-1",
      "student-2",
      { score: 92.5, feedback: "Strong work", publish: true },
      INSTRUCTOR
    );

    expect(prisma.assignmentGrade.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assignmentId_studentId: {
            assignmentId: "assignment-1",
            studentId: "student-2",
          },
        },
        create: expect.objectContaining({
          gradedById: INSTRUCTOR.id,
          feedback: "Strong work",
          publishedAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          gradedById: INSTRUCTOR.id,
          gradedAt: expect.any(Date),
          publishedAt: expect.any(Date),
        }),
      })
    );
  });

  it("builds a gradebook by joining enrolled students to any saved grades", async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: "assignment-1",
      organizationId: ORG,
      offeringId: OFFERING.id,
      title: "Quiz 1",
      maxScore: new Prisma.Decimal(100),
    });
    prisma.courseOffering.findUnique.mockResolvedValue(OFFERING);
    prisma.enrollment.findMany.mockResolvedValue([
      {
        student: {
          id: "student-1",
          universityId: "NCTU-1001",
          fullName: "Amina Ali",
          email: "amina@nctu.edu.eg",
        },
      },
      {
        student: {
          id: "student-2",
          universityId: "NCTU-1002",
          fullName: "Karim Adel",
          email: "karim@nctu.edu.eg",
        },
      },
    ]);
    prisma.assignmentGrade.findMany.mockResolvedValue([
      { studentId: "student-1", score: new Prisma.Decimal(95) },
    ]);

    const service = new AssignmentService();
    const result = await service.gradebook("assignment-1", INSTRUCTOR);

    expect(result.assignment).toMatchObject({
      id: "assignment-1",
      title: "Quiz 1",
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.grade).not.toBeNull();
    expect(result.rows[1]!.grade).toBeNull();
  });
});
