import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import type { AuthenticatedUser } from "../middleware/auth.middleware.js";
import type {
  CreateAssignmentInput,
  GradeAssignmentInput,
  UpdateAssignmentInput,
} from "../types/assignment.types.js";
import { badRequest, forbidden, notFound } from "../utils/AppError.js";

const assignmentInclude = {
  offering: {
    select: {
      id: true,
      displayName: true,
      course: { select: { id: true, courseCode: true, courseName: true } },
      term: { select: { id: true, name: true } },
    },
  },
  cohorts: { include: { cohort: true } },
  attachments: { include: { file: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

export class AssignmentService {
  async list(actor: AuthenticatedUser) {
    if (actor.role === "STUDENT") {
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: actor.id },
        select: { cohortId: true },
      });

      return prisma.assignment.findMany({
        where: {
          organizationId: actor.organizationId,
          isPublished: true,
          offering: {
            enrollments: { some: { studentId: actor.id, isActive: true } },
          },
          ...(profile?.cohortId
            ? {
                OR: [
                  { cohorts: { none: {} } },
                  { cohorts: { some: { cohortId: profile.cohortId } } },
                ],
              }
            : { cohorts: { none: {} } }),
        },
        include: {
          ...assignmentInclude,
          grades: {
            where: { studentId: actor.id, publishedAt: { not: null } },
            select: { score: true, feedback: true, gradedAt: true, publishedAt: true },
          },
        },
        orderBy: { deadline: "asc" },
      });
    }

    return prisma.assignment.findMany({
      where: this.staffScope(actor),
      include: assignmentInclude,
      orderBy: { deadline: "desc" },
    });
  }

  async create(input: CreateAssignmentInput, actor: AuthenticatedUser) {
    const offering = await this.getManageableOffering(input.offeringId, actor);
    await this.assertCohortsBelongToOffering(input.cohortIds, offering.id);

    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          organizationId: offering.organizationId,
          departmentId: offering.departmentId,
          offeringId: offering.id,
          createdById: actor.id,
          title: input.title,
          description: input.description,
          deadline: input.deadline,
          maxScore: new Prisma.Decimal(input.maxScore),
          isPublished: input.isPublished,
          publishedAt: input.isPublished ? now : null,
          cohorts: {
            create: input.cohortIds.map((cohortId) => ({ cohortId })),
          },
        },
        include: assignmentInclude,
      });
      await tx.gradeItem.create({
        data: {
          organizationId: offering.organizationId,
          departmentId: offering.departmentId,
          offeringId: offering.id,
          createdById: actor.id,
          assignmentId: assignment.id,
          category: "ASSIGNMENT",
          name: assignment.title,
          maxScore: assignment.maxScore,
          isPublished: input.isPublished,
          publishedAt: input.isPublished ? now : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: input.isPublished ? "PUBLISH" : "CREATE",
          resourceType: "Assignment",
          resourceId: assignment.id,
        },
      });
      return assignment;
    });
  }

  async update(id: string, input: UpdateAssignmentInput, actor: AuthenticatedUser) {
    const assignment = await this.getManageableAssignment(id, actor);
    if (input.cohortIds) {
      await this.assertCohortsBelongToOffering(input.cohortIds, assignment.offeringId);
    }
    const maxScore = input.maxScore === undefined
      ? undefined
      : new Prisma.Decimal(input.maxScore);

    return prisma.$transaction(async (tx) => {
      if (input.cohortIds) {
        await tx.assignmentCohort.deleteMany({ where: { assignmentId: id } });
        await tx.assignmentCohort.createMany({
          data: input.cohortIds.map((cohortId) => ({ assignmentId: id, cohortId })),
        });
      }
      const updated = await tx.assignment.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          deadline: input.deadline,
          maxScore,
        },
        include: assignmentInclude,
      });
      await tx.gradeItem.updateMany({
        where: { assignmentId: id },
        data: { name: input.title, maxScore },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: "UPDATE",
          resourceType: "Assignment",
          resourceId: id,
        },
      });
      return updated;
    });
  }

  async publish(id: string, actor: AuthenticatedUser) {
    await this.getManageableAssignment(id, actor);
    const publishedAt = new Date();
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.update({
        where: { id },
        data: { isPublished: true, publishedAt },
        include: assignmentInclude,
      });
      await tx.gradeItem.updateMany({
        where: { assignmentId: id },
        data: { isPublished: true, publishedAt },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: "PUBLISH",
          resourceType: "Assignment",
          resourceId: id,
        },
      });
      return assignment;
    });
  }

  async grade(
    assignmentId: string,
    studentId: string,
    input: GradeAssignmentInput,
    actor: AuthenticatedUser
  ) {
    const assignment = await this.getManageableAssignment(assignmentId, actor);
    if (new Prisma.Decimal(input.score).greaterThan(assignment.maxScore)) {
      throw badRequest("Score cannot exceed the assignment maximum");
    }
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        offeringId: assignment.offeringId,
        studentId,
        isActive: true,
        student: { organizationId: actor.organizationId, role: "STUDENT" },
      },
    });
    if (!enrollment) throw badRequest("Student is not enrolled in this course offering");

    const publishedAt = input.publish ? new Date() : null;
    return prisma.assignmentGrade.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: {
        assignmentId,
        studentId,
        score: new Prisma.Decimal(input.score),
        feedback: input.feedback,
        gradedById: actor.id,
        publishedAt,
      },
      update: {
        score: new Prisma.Decimal(input.score),
        feedback: input.feedback,
        gradedById: actor.id,
        gradedAt: new Date(),
        publishedAt,
      },
    });
  }

  async gradebook(id: string, actor: AuthenticatedUser) {
    const assignment = await this.getManageableAssignment(id, actor);
    const students = await prisma.enrollment.findMany({
      where: { offeringId: assignment.offeringId, isActive: true },
      select: {
        student: {
          select: { id: true, universityId: true, fullName: true, email: true },
        },
      },
      orderBy: { student: { fullName: "asc" } },
    });
    const grades = await prisma.assignmentGrade.findMany({ where: { assignmentId: id } });
    const byStudent = new Map(grades.map((grade) => [grade.studentId, grade]));
    return {
      assignment: { id: assignment.id, title: assignment.title, maxScore: assignment.maxScore },
      rows: students.map(({ student }) => ({ student, grade: byStudent.get(student.id) ?? null })),
    };
  }

  private staffScope(actor: AuthenticatedUser): Prisma.AssignmentWhereInput {
    const base: Prisma.AssignmentWhereInput = { organizationId: actor.organizationId };
    if (actor.role === "SYSTEM_OWNER" || actor.role === "UNIVERSITY_ADMIN") return base;
    if (actor.role === "DEPARTMENT_ADMIN") {
      if (!actor.departmentId) throw forbidden("Your account has no department scope");
      return { ...base, departmentId: actor.departmentId };
    }
    if (actor.role === "INSTRUCTOR") {
      return {
        ...base,
        offering: {
          teachingAssignments: { some: { instructorId: actor.id, isActive: true } },
        },
      };
    }
    throw forbidden();
  }

  private async getManageableOffering(id: string, actor: AuthenticatedUser) {
    const offering = await prisma.courseOffering.findUnique({
      where: { id },
      include: { teachingAssignments: { where: { isActive: true } } },
    });
    if (!offering || offering.organizationId !== actor.organizationId) throw notFound();
    if (actor.role === "UNIVERSITY_ADMIN" || actor.role === "SYSTEM_OWNER") return offering;
    if (actor.role === "DEPARTMENT_ADMIN" && actor.departmentId === offering.departmentId) return offering;
    if (
      actor.role === "INSTRUCTOR" &&
      actor.departmentId === offering.departmentId &&
      offering.teachingAssignments.some((assignment) => assignment.instructorId === actor.id)
    ) return offering;
    throw forbidden("You are not assigned to this course offering");
  }

  private async getManageableAssignment(id: string, actor: AuthenticatedUser) {
    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment || assignment.organizationId !== actor.organizationId) throw notFound();
    await this.getManageableOffering(assignment.offeringId, actor);
    return assignment;
  }

  private async assertCohortsBelongToOffering(cohortIds: string[], offeringId: string) {
    if (cohortIds.length === 0) return;
    const unique = [...new Set(cohortIds)];
    const count = await prisma.courseOfferingCohort.count({
      where: { offeringId, cohortId: { in: unique } },
    });
    if (count !== unique.length) {
      throw badRequest("Every target cohort must belong to the course offering");
    }
  }
}
