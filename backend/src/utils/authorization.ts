import type { UserRole } from "@prisma/client";
import { forbidden } from "./AppError.js";

/**
 * The application authorization boundary.
 *
 * Client navigation may hide actions, but it never grants them. Every service
 * that reads or mutates university data supplies the authenticated actor and
 * the resource scope to this module (or to a feature-specific policy built on
 * top of it).
 */
export interface ScopeActor {
  id: string;
  role: UserRole;
  organizationId: string;
  departmentId: string | null;
}

export interface ResourceScope {
  organizationId: string;
  departmentId?: string | null;
  ownerId?: string | null;
}

export type Permission =
  | "university:manage"
  | "department:manage"
  | "people:read"
  | "people:create"
  | "student:approve"
  | "course:manage"
  | "schedule:manage"
  | "teaching:operate"
  | "assignment:manage"
  | "grade:manage"
  | "self:read";

const sameUniversity = (actor: ScopeActor, scope: ResourceScope) =>
  actor.organizationId === scope.organizationId;

const sameDepartment = (actor: ScopeActor, scope: ResourceScope) =>
  scope.departmentId !== null &&
  scope.departmentId !== undefined &&
  actor.departmentId !== null &&
  actor.departmentId === scope.departmentId;

/**
 * Pure role-and-scope decision. Instructor assignment checks are intentionally
 * not guessed here: feature policies must additionally prove that the actor is
 * assigned to the concrete CourseOffering or Cohort.
 */
export const hasPermission = (
  actor: ScopeActor,
  permission: Permission,
  scope: ResourceScope
): boolean => {
  if (actor.role === "SYSTEM_OWNER") return true;
  if (!sameUniversity(actor, scope)) return false;

  if (permission === "self:read") {
    return scope.ownerId === actor.id;
  }

  if (actor.role === "UNIVERSITY_ADMIN") {
    return true;
  }

  if (actor.role === "DEPARTMENT_ADMIN") {
    if (!sameDepartment(actor, scope)) return false;

    return permission !== "university:manage";
  }

  if (actor.role === "INSTRUCTOR") {
    if (!sameDepartment(actor, scope)) return false;

    return (
      permission === "people:read" ||
      permission === "student:approve" ||
      permission === "teaching:operate" ||
      permission === "assignment:manage" ||
      permission === "grade:manage"
    );
  }

  return false;
};

export const requirePermission = (
  actor: ScopeActor,
  permission: Permission,
  scope: ResourceScope,
  message = "You do not have permission to perform this action"
) => {
  if (!hasPermission(actor, permission, scope)) {
    throw forbidden(message);
  }
};

export const requireSameUniversity = (
  actor: ScopeActor,
  organizationId: string
) => {
  requirePermission(actor, "people:read", { organizationId });
};

export const requireSameDepartment = (
  actor: ScopeActor,
  organizationId: string,
  departmentId: string
) => {
  if (
    actor.role !== "SYSTEM_OWNER" &&
    actor.role !== "UNIVERSITY_ADMIN" &&
    (!sameUniversity(actor, { organizationId }) || actor.departmentId !== departmentId)
  ) {
    throw forbidden("This resource belongs to another department");
  }
};
