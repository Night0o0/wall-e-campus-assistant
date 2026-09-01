import { AuditAction, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import type {
  AcademicTermQuery,
  CohortQuery,
  CreateAcademicTermInput,
  CreateCohortInput,
  CreateEnrollmentInput,
  CreateOfferingInput,
  CreateTeachingAssignmentInput,
  EnrollmentQuery,
  OfferingQuery,
  TeachingAssignmentQuery,
  UpdateAcademicTermInput,
  UpdateCohortInput,
  UpdateEnrollmentInput,
  UpdateOfferingInput,
  UpdateTeachingAssignmentInput,
} from "../types/academic.types.js";
import { buildOrderBy, toSkipTake } from "../utils/pagination.js";

const offeringInclude = {
  course: { select: { id: true, courseCode: true, courseName: true } },
  department: { select: { id: true, code: true, name: true } },
  term: {
    select: {
      id: true,
      name: true,
      academicYear: true,
      semester: true,
      isCurrent: true,
    },
  },
  cohorts: {
    include: {
      cohort: {
        select: {
          id: true,
          name: true,
          level: true,
          section: true,
          groupName: true,
        },
      },
    },
  },
  _count: { select: { teachingAssignments: true, enrollments: true, assignments: true } },
} satisfies Prisma.CourseOfferingInclude;

const assignmentInclude = {
  offering: { include: offeringInclude },
  instructor: {
    select: { id: true, fullName: true, email: true, universityId: true },
  },
  cohort: {
    select: { id: true, name: true, level: true, section: true, groupName: true },
  },
} satisfies Prisma.TeachingAssignmentInclude;

const enrollmentInclude = {
  offering: { include: offeringInclude },
  student: {
    select: {
      id: true,
      fullName: true,
      email: true,
      universityId: true,
      accountStatus: true,
      studentProfile: {
        select: { cohortId: true, level: true, section: true, groupName: true },
      },
    },
  },
} satisfies Prisma.EnrollmentInclude;

export class AcademicRepository {
  async findTerms(organizationId: string, query: AcademicTermQuery) {
    const where: Prisma.AcademicTermWhereInput = {
      organizationId,
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester !== undefined ? { semester: query.semester } : {}),
      ...(query.isCurrent !== undefined ? { isCurrent: query.isCurrent } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { academicYear: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.academicTerm.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          ["startsOn", "endsOn", "name", "academicYear", "createdAt"] as const,
          "startsOn"
        ),
      }),
      prisma.academicTerm.count({ where }),
    ]);
    return { data, total };
  }

  findTerm(id: string, organizationId: string) {
    return prisma.academicTerm.findFirst({ where: { id, organizationId } });
  }

  createTerm(organizationId: string, input: CreateAcademicTermInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicTerm.updateMany({
          where: { organizationId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.academicTerm.create({ data: { organizationId, ...input } });
    });
  }

  updateTerm(
    id: string,
    organizationId: string,
    input: UpdateAcademicTermInput
  ) {
    return prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicTerm.updateMany({
          where: { organizationId, isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });
      }
      return tx.academicTerm.update({ where: { id }, data: input });
    });
  }

  async findCohorts(
    organizationId: string,
    query: CohortQuery,
    scope: { departmentId?: string; instructorId?: string } = {}
  ) {
    const where: Prisma.CohortWhereInput = {
      organizationId,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.level !== undefined ? { level: query.level } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { section: { contains: query.search, mode: "insensitive" } },
              { groupName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      // Trusted actor scope is applied last so a client filter cannot replace it.
      ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
      ...(scope.instructorId
        ? { teachingAssignments: { some: { instructorId: scope.instructorId, isActive: true } } }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.cohort.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          ["name", "academicYear", "level", "createdAt"] as const,
          "name"
        ),
        include: {
          department: { select: { id: true, code: true, name: true } },
          _count: { select: { students: true, offeringTargets: true } },
        },
      }),
      prisma.cohort.count({ where }),
    ]);
    return { data, total };
  }

  findCohort(id: string, organizationId: string) {
    return prisma.cohort.findFirst({
      where: { id, organizationId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { students: true, offeringTargets: true } },
      },
    });
  }

  createCohort(organizationId: string, input: CreateCohortInput) {
    return prisma.cohort.create({ data: { organizationId, ...input } });
  }

  updateCohort(id: string, input: UpdateCohortInput) {
    return prisma.cohort.update({ where: { id }, data: input });
  }

  async findOfferings(
    organizationId: string,
    query: OfferingQuery,
    scope: { departmentId?: string; instructorId?: string; studentId?: string } = {}
  ) {
    const where: Prisma.CourseOfferingWhereInput = {
      organizationId,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.cohortId ? { cohorts: { some: { cohortId: query.cohortId } } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: "insensitive" } },
              { course: { courseCode: { contains: query.search, mode: "insensitive" } } },
              { course: { courseName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
      ...(scope.instructorId
        ? { teachingAssignments: { some: { instructorId: scope.instructorId, isActive: true } } }
        : {}),
      ...(scope.studentId
        ? { enrollments: { some: { studentId: scope.studentId, isActive: true } } }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.courseOffering.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          ["displayName", "createdAt", "updatedAt"] as const,
          "createdAt"
        ),
        include: offeringInclude,
      }),
      prisma.courseOffering.count({ where }),
    ]);
    return { data, total };
  }

  findOffering(id: string, organizationId: string) {
    return prisma.courseOffering.findFirst({
      where: { id, organizationId },
      include: offeringInclude,
    });
  }

  createOffering(organizationId: string, input: CreateOfferingInput) {
    const { cohortIds, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.create({
        data: { organizationId, ...data },
      });
      if (cohortIds.length > 0) {
        await tx.courseOfferingCohort.createMany({
          data: [...new Set(cohortIds)].map((cohortId) => ({
            offeringId: offering.id,
            cohortId,
          })),
        });
      }
      return tx.courseOffering.findUniqueOrThrow({
        where: { id: offering.id },
        include: offeringInclude,
      });
    });
  }

  updateOffering(id: string, input: UpdateOfferingInput) {
    const { cohortIds, ...data } = input;
    return prisma.$transaction(async (tx) => {
      await tx.courseOffering.update({ where: { id }, data });
      if (cohortIds) {
        await tx.courseOfferingCohort.deleteMany({ where: { offeringId: id } });
        if (cohortIds.length > 0) {
          await tx.courseOfferingCohort.createMany({
            data: [...new Set(cohortIds)].map((cohortId) => ({
              offeringId: id,
              cohortId,
            })),
          });
        }
      }
      return tx.courseOffering.findUniqueOrThrow({
        where: { id },
        include: offeringInclude,
      });
    });
  }

  async findTeachingAssignments(
    organizationId: string,
    query: TeachingAssignmentQuery,
    scope: { departmentId?: string; instructorId?: string } = {}
  ) {
    const where: Prisma.TeachingAssignmentWhereInput = {
      organizationId,
      ...(query.offeringId ? { offeringId: query.offeringId } : {}),
      ...(query.instructorId ? { instructorId: query.instructorId } : {}),
      ...(query.cohortId ? { cohortId: query.cohortId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(scope.departmentId ? { offering: { departmentId: scope.departmentId } } : {}),
      ...(scope.instructorId ? { instructorId: scope.instructorId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.teachingAssignment.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          ["createdAt", "updatedAt", "teachingRole"] as const,
          "createdAt"
        ),
        include: assignmentInclude,
      }),
      prisma.teachingAssignment.count({ where }),
    ]);
    return { data, total };
  }

  findTeachingAssignment(id: string, organizationId: string) {
    return prisma.teachingAssignment.findFirst({
      where: { id, organizationId },
      include: assignmentInclude,
    });
  }

  createTeachingAssignment(
    organizationId: string,
    input: CreateTeachingAssignmentInput
  ) {
    return prisma.teachingAssignment.create({
      data: { organizationId, ...input },
      include: assignmentInclude,
    });
  }

  updateTeachingAssignment(id: string, input: UpdateTeachingAssignmentInput) {
    return prisma.teachingAssignment.update({
      where: { id },
      data: input,
      include: assignmentInclude,
    });
  }

  async findEnrollments(
    organizationId: string,
    query: EnrollmentQuery,
    scope: { departmentId?: string; instructorId?: string; studentId?: string } = {}
  ) {
    const where: Prisma.EnrollmentWhereInput = {
      organizationId,
      ...(query.offeringId ? { offeringId: query.offeringId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            student: {
              OR: [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { universityId: { contains: query.search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
      ...(scope.departmentId ? { offering: { departmentId: scope.departmentId } } : {}),
      ...(scope.instructorId
        ? {
            offering: {
              teachingAssignments: {
                some: { instructorId: scope.instructorId, isActive: true },
              },
            },
          }
        : {}),
      ...(scope.studentId ? { studentId: scope.studentId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        ...toSkipTake(query),
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          ["enrolledAt"] as const,
          "enrolledAt"
        ),
        include: enrollmentInclude,
      }),
      prisma.enrollment.count({ where }),
    ]);
    return { data, total };
  }

  findEnrollment(id: string, organizationId: string) {
    return prisma.enrollment.findFirst({
      where: { id, organizationId },
      include: enrollmentInclude,
    });
  }

  createEnrollment(organizationId: string, input: CreateEnrollmentInput) {
    return prisma.enrollment.create({
      data: { organizationId, ...input },
      include: enrollmentInclude,
    });
  }

  updateEnrollment(id: string, input: UpdateEnrollmentInput) {
    return prisma.enrollment.update({
      where: { id },
      data: input,
      include: enrollmentInclude,
    });
  }

  findDepartment(id: string, organizationId: string) {
    return prisma.department.findFirst({ where: { id, organizationId } });
  }

  findCourse(id: string, organizationId: string) {
    return prisma.course.findFirst({ where: { id, organizationId } });
  }

  findInstructor(id: string, organizationId: string) {
    return prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: "INSTRUCTOR",
        accountStatus: "ACTIVE",
        isVerified: true,
        isActive: true,
      },
      select: { id: true, departmentId: true },
    });
  }

  findStudent(id: string, organizationId: string) {
    return prisma.user.findFirst({
      where: { id, organizationId, role: "STUDENT", isActive: true },
      select: {
        id: true,
        accountStatus: true,
        isVerified: true,
        studentProfile: { select: { cohortId: true } },
      },
    });
  }

  async audit(input: {
    organizationId: string;
    actorId: string;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.auditLog.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
