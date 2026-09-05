import { AuditAction } from "@prisma/client";
import type { AuthenticatedUser } from "../middleware/auth.middleware.js";
import { AcademicRepository } from "../repositories/academic.repository.js";
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
import { badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";
import { requirePermission } from "../utils/authorization.js";
import { paginate } from "../utils/pagination.js";

export class AcademicService {
  constructor(private readonly academic = new AcademicRepository()) {}

  async listTerms(query: AcademicTermQuery, actor: AuthenticatedUser) {
    const { data, total } = await this.academic.findTerms(
      actor.organizationId,
      query
    );
    return paginate(data, total, query);
  }

  async getTerm(id: string, actor: AuthenticatedUser) {
    const term = await this.academic.findTerm(id, actor.organizationId);
    if (!term) throw notFound("Academic term not found");
    return term;
  }

  async createTerm(input: CreateAcademicTermInput, actor: AuthenticatedUser) {
    requirePermission(actor, "university:manage", {
      organizationId: actor.organizationId,
    });
    const term = await this.academic.createTerm(actor.organizationId, input);
    await this.audit(actor, AuditAction.CREATE, "AcademicTerm", term.id);
    return term;
  }

  async updateTerm(
    id: string,
    input: UpdateAcademicTermInput,
    actor: AuthenticatedUser
  ) {
    const existing = await this.getTerm(id, actor);
    requirePermission(actor, "university:manage", {
      organizationId: existing.organizationId,
    });

    const startsOn = input.startsOn ?? existing.startsOn;
    const endsOn = input.endsOn ?? existing.endsOn;
    if (startsOn >= endsOn) {
      throw badRequest("startsOn must be before endsOn");
    }

    const term = await this.academic.updateTerm(
      id,
      actor.organizationId,
      input
    );
    await this.audit(actor, AuditAction.UPDATE, "AcademicTerm", id);
    return term;
  }

  async listCohorts(query: CohortQuery, actor: AuthenticatedUser) {
    const scope =
      actor.role === "DEPARTMENT_ADMIN"
        ? { departmentId: this.linkedDepartment(actor) }
        : actor.role === "INSTRUCTOR"
          ? {
              departmentId: actor.departmentId ?? undefined,
              instructorId: actor.id,
            }
          : {};
    const { data, total } = await this.academic.findCohorts(
      actor.organizationId,
      query,
      scope
    );
    return paginate(data, total, query);
  }

  async getCohort(id: string, actor: AuthenticatedUser) {
    const cohort = await this.academic.findCohort(id, actor.organizationId);
    if (!cohort) throw notFound("Cohort not found");
    requirePermission(actor, "people:read", {
      organizationId: cohort.organizationId,
      departmentId: cohort.departmentId,
    });
    if (actor.role === "INSTRUCTOR") {
      const visible = await this.academic.findTeachingAssignments(
        actor.organizationId,
        {
          page: 1,
          limit: 1,
          sortOrder: "desc",
          cohortId: id,
          instructorId: actor.id,
          isActive: true,
        },
        { instructorId: actor.id }
      );
      if (visible.total === 0) throw notFound("Cohort not found");
    }
    return cohort;
  }

  async createCohort(input: CreateCohortInput, actor: AuthenticatedUser) {
    await this.requireManagedDepartment(input.departmentId, actor);
    const cohort = await this.academic.createCohort(actor.organizationId, input);
    await this.audit(actor, AuditAction.CREATE, "Cohort", cohort.id, {
      departmentId: input.departmentId,
    });
    return cohort;
  }

  async updateCohort(
    id: string,
    input: UpdateCohortInput,
    actor: AuthenticatedUser
  ) {
    const existing = await this.academic.findCohort(id, actor.organizationId);
    if (!existing) throw notFound("Cohort not found");
    await this.requireManagedDepartment(existing.departmentId, actor);
    const cohort = await this.academic.updateCohort(id, input);
    await this.audit(actor, AuditAction.UPDATE, "Cohort", id, {
      departmentId: existing.departmentId,
    });
    return cohort;
  }

  async listOfferings(query: OfferingQuery, actor: AuthenticatedUser) {
    const scope =
      actor.role === "DEPARTMENT_ADMIN"
        ? { departmentId: this.linkedDepartment(actor) }
        : actor.role === "INSTRUCTOR"
          ? { instructorId: actor.id }
          : actor.role === "STUDENT"
            ? { studentId: actor.id }
            : {};
    const { data, total } = await this.academic.findOfferings(
      actor.organizationId,
      query,
      scope
    );
    return paginate(data, total, query);
  }

  async getOffering(id: string, actor: AuthenticatedUser) {
    const offering = await this.academic.findOffering(id, actor.organizationId);
    if (!offering) throw notFound("Course offering not found");

    if (actor.role === "DEPARTMENT_ADMIN") {
      requirePermission(actor, "people:read", {
        organizationId: offering.organizationId,
        departmentId: offering.departmentId,
      });
    } else if (actor.role === "INSTRUCTOR") {
      const visible = await this.academic.findTeachingAssignments(
        actor.organizationId,
        {
          page: 1,
          limit: 1,
          sortOrder: "desc",
          offeringId: id,
          instructorId: actor.id,
          isActive: true,
        },
        { instructorId: actor.id }
      );
      if (visible.total === 0) throw notFound("Course offering not found");
    } else if (actor.role === "STUDENT") {
      const visible = await this.academic.findEnrollments(
        actor.organizationId,
        {
          page: 1,
          limit: 1,
          sortOrder: "desc",
          offeringId: id,
          studentId: actor.id,
          isActive: true,
        },
        { studentId: actor.id }
      );
      if (visible.total === 0) throw notFound("Course offering not found");
    }

    return offering;
  }

  async createOffering(input: CreateOfferingInput, actor: AuthenticatedUser) {
    await this.validateOfferingReferences(input, actor);
    const offering = await this.academic.createOffering(
      actor.organizationId,
      input
    );
    await this.audit(actor, AuditAction.CREATE, "CourseOffering", offering.id, {
      departmentId: input.departmentId,
      courseId: input.courseId,
      termId: input.termId,
    });
    return offering;
  }

  async updateOffering(
    id: string,
    input: UpdateOfferingInput,
    actor: AuthenticatedUser
  ) {
    const existing = await this.academic.findOffering(id, actor.organizationId);
    if (!existing) throw notFound("Course offering not found");
    await this.requireManagedDepartment(existing.departmentId, actor);
    if (input.cohortIds) {
      await this.validateCohorts(input.cohortIds, existing.departmentId, actor);
    }
    const offering = await this.academic.updateOffering(id, input);
    await this.audit(actor, AuditAction.UPDATE, "CourseOffering", id, {
      departmentId: existing.departmentId,
    });
    return offering;
  }

  async listTeachingAssignments(
    query: TeachingAssignmentQuery,
    actor: AuthenticatedUser
  ) {
    const scope =
      actor.role === "DEPARTMENT_ADMIN"
        ? { departmentId: this.linkedDepartment(actor) }
        : actor.role === "INSTRUCTOR"
          ? { instructorId: actor.id }
          : {};
    const { data, total } = await this.academic.findTeachingAssignments(
      actor.organizationId,
      query,
      scope
    );
    return paginate(data, total, query);
  }

  async getTeachingAssignment(id: string, actor: AuthenticatedUser) {
    const assignment = await this.academic.findTeachingAssignment(
      id,
      actor.organizationId
    );
    if (!assignment) throw notFound("Teaching assignment not found");
    if (actor.role === "INSTRUCTOR" && assignment.instructorId !== actor.id) {
      throw notFound("Teaching assignment not found");
    }
    if (actor.role === "DEPARTMENT_ADMIN") {
      requirePermission(actor, "people:read", {
        organizationId: assignment.organizationId,
        departmentId: assignment.offering.departmentId,
      });
    }
    return assignment;
  }

  async createTeachingAssignment(
    input: CreateTeachingAssignmentInput,
    actor: AuthenticatedUser
  ) {
    const offering = await this.academic.findOffering(
      input.offeringId,
      actor.organizationId
    );
    if (!offering) throw notFound("Course offering not found");
    await this.requireManagedDepartment(offering.departmentId, actor);
    const instructor = await this.academic.findInstructor(
      input.instructorId,
      actor.organizationId
    );
    if (!instructor) throw notFound("Instructor not found");
    if (
      instructor.departmentId &&
      instructor.departmentId !== offering.departmentId
    ) {
      throw badRequest("Instructor belongs to another department");
    }
    if (input.cohortId) {
      this.assertOfferingTargetsCohort(offering, input.cohortId);
    }
    const assignment = await this.academic.createTeachingAssignment(
      actor.organizationId,
      input
    );
    await this.audit(
      actor,
      AuditAction.CREATE,
      "TeachingAssignment",
      assignment.id,
      { offeringId: input.offeringId, instructorId: input.instructorId }
    );
    return assignment;
  }

  async updateTeachingAssignment(
    id: string,
    input: UpdateTeachingAssignmentInput,
    actor: AuthenticatedUser
  ) {
    const existing = await this.academic.findTeachingAssignment(
      id,
      actor.organizationId
    );
    if (!existing) throw notFound("Teaching assignment not found");
    await this.requireManagedDepartment(existing.offering.departmentId, actor);
    if (input.cohortId) {
      this.assertOfferingTargetsCohort(existing.offering, input.cohortId);
    }
    const assignment = await this.academic.updateTeachingAssignment(id, input);
    await this.audit(actor, AuditAction.UPDATE, "TeachingAssignment", id, {
      offeringId: existing.offeringId,
    });
    return assignment;
  }

  async listEnrollments(query: EnrollmentQuery, actor: AuthenticatedUser) {
    const scope =
      actor.role === "DEPARTMENT_ADMIN"
        ? { departmentId: this.linkedDepartment(actor) }
        : actor.role === "INSTRUCTOR"
          ? { instructorId: actor.id }
          : actor.role === "STUDENT"
            ? { studentId: actor.id }
            : {};
    const { data, total } = await this.academic.findEnrollments(
      actor.organizationId,
      query,
      scope
    );
    return paginate(data, total, query);
  }

  async getEnrollment(id: string, actor: AuthenticatedUser) {
    const enrollment = await this.academic.findEnrollment(id, actor.organizationId);
    if (!enrollment) throw notFound("Enrollment not found");
    if (actor.role === "STUDENT" && enrollment.studentId !== actor.id) {
      throw notFound("Enrollment not found");
    }
    if (actor.role === "DEPARTMENT_ADMIN") {
      requirePermission(actor, "people:read", {
        organizationId: enrollment.organizationId,
        departmentId: enrollment.offering.departmentId,
      });
    }
    if (actor.role === "INSTRUCTOR") {
      const assigned = await this.academic.findTeachingAssignments(
        actor.organizationId,
        {
          page: 1,
          limit: 1,
          sortOrder: "desc",
          offeringId: enrollment.offeringId,
          instructorId: actor.id,
          isActive: true,
        },
        { instructorId: actor.id }
      );
      if (assigned.total === 0) throw notFound("Enrollment not found");
    }
    return enrollment;
  }

  async createEnrollment(
    input: CreateEnrollmentInput,
    actor: AuthenticatedUser
  ) {
    const offering = await this.academic.findOffering(
      input.offeringId,
      actor.organizationId
    );
    if (!offering) throw notFound("Course offering not found");
    await this.requireManagedDepartment(offering.departmentId, actor);
    if (!offering.isActive) throw conflict("Course offering is inactive");

    const student = await this.academic.findStudent(
      input.studentId,
      actor.organizationId
    );
    if (!student) throw notFound("Student not found");
    if (student.accountStatus !== "ACTIVE" || !student.isVerified) {
      throw conflict("Student account is not active and approved");
    }

    const targets = offering.cohorts.map((row) => row.cohort.id);
    if (
      targets.length > 0 &&
      (!student.studentProfile?.cohortId ||
        !targets.includes(student.studentProfile.cohortId))
    ) {
      throw badRequest("Student does not belong to a cohort targeted by this offering");
    }

    const enrollment = await this.academic.createEnrollment(
      actor.organizationId,
      input
    );
    await this.audit(actor, AuditAction.CREATE, "Enrollment", enrollment.id, {
      offeringId: input.offeringId,
      studentId: input.studentId,
    });
    return enrollment;
  }

  async updateEnrollment(
    id: string,
    input: UpdateEnrollmentInput,
    actor: AuthenticatedUser
  ) {
    const existing = await this.academic.findEnrollment(id, actor.organizationId);
    if (!existing) throw notFound("Enrollment not found");
    await this.requireManagedDepartment(existing.offering.departmentId, actor);
    const enrollment = await this.academic.updateEnrollment(id, input);
    await this.audit(
      actor,
      input.isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
      "Enrollment",
      id,
      { offeringId: existing.offeringId, studentId: existing.studentId }
    );
    return enrollment;
  }

  private async validateOfferingReferences(
    input: CreateOfferingInput,
    actor: AuthenticatedUser
  ) {
    await this.requireManagedDepartment(input.departmentId, actor);
    const course = await this.academic.findCourse(input.courseId, actor.organizationId);
    if (!course) throw notFound("Course not found");
    if (course.departmentId && course.departmentId !== input.departmentId) {
      throw badRequest("Course belongs to another department");
    }
    const term = await this.academic.findTerm(input.termId, actor.organizationId);
    if (!term) throw notFound("Academic term not found");
    await this.validateCohorts(input.cohortIds, input.departmentId, actor);
  }

  private async validateCohorts(
    cohortIds: string[],
    departmentId: string,
    actor: AuthenticatedUser
  ) {
    for (const cohortId of new Set(cohortIds)) {
      const cohort = await this.academic.findCohort(
        cohortId,
        actor.organizationId
      );
      if (!cohort || cohort.departmentId !== departmentId) {
        throw notFound("Cohort not found");
      }
    }
  }

  private async requireManagedDepartment(
    departmentId: string,
    actor: AuthenticatedUser
  ) {
    const department = await this.academic.findDepartment(
      departmentId,
      actor.organizationId
    );
    if (!department) throw notFound("Department not found");
    requirePermission(actor, "department:manage", {
      organizationId: department.organizationId,
      departmentId: department.id,
    });
  }

  private assertOfferingTargetsCohort(
    offering: { cohorts: Array<{ cohort: { id: string } }> },
    cohortId: string
  ) {
    if (!offering.cohorts.some((row) => row.cohort.id === cohortId)) {
      throw badRequest("Cohort is not targeted by this course offering");
    }
  }

  private linkedDepartment(actor: AuthenticatedUser) {
    if (!actor.departmentId) {
      throw forbidden("This account is not linked to a department");
    }
    return actor.departmentId;
  }

  private audit(
    actor: AuthenticatedUser,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, unknown>
  ) {
    return this.academic.audit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  }
}
