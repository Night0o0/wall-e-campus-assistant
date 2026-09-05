import type { AuthenticatedUser } from "../middleware/auth.middleware.js";
import { DepartmentRepository } from "../repositories/department.repository.js";
import type {
  CreateDepartmentInput,
  DepartmentQuery,
  UpdateDepartmentInput,
} from "../types/department.types.js";
import { conflict, notFound } from "../utils/AppError.js";
import { requirePermission } from "../utils/authorization.js";
import { paginate } from "../utils/pagination.js";

export class DepartmentService {
  constructor(private readonly departments = new DepartmentRepository()) {}

  async list(query: DepartmentQuery, actor: AuthenticatedUser) {
    const departmentId =
      actor.role === "DEPARTMENT_ADMIN" || actor.role === "INSTRUCTOR"
        ? actor.departmentId ?? undefined
        : undefined;

    const { data, total } = await this.departments.findMany(
      actor.organizationId,
      query,
      departmentId
    );

    return paginate(data, total, query);
  }

  async get(id: string, actor: AuthenticatedUser) {
    const department = await this.departments.findById(id, actor.organizationId);
    if (!department) throw notFound("Department not found");

    requirePermission(actor, "people:read", {
      organizationId: department.organizationId,
      departmentId: department.id,
    });

    return department;
  }

  async create(input: CreateDepartmentInput, actor: AuthenticatedUser) {
    requirePermission(actor, "university:manage", {
      organizationId: actor.organizationId,
    });

    if (await this.departments.findByCode(input.code, actor.organizationId)) {
      throw conflict("Department code already exists");
    }

    return this.departments.create(actor.organizationId, input);
  }

  async update(
    id: string,
    input: UpdateDepartmentInput,
    actor: AuthenticatedUser
  ) {
    const department = await this.departments.findById(id, actor.organizationId);
    if (!department) throw notFound("Department not found");

    requirePermission(actor, "university:manage", {
      organizationId: department.organizationId,
      departmentId: department.id,
    });

    if (input.code && input.code !== department.code) {
      const existing = await this.departments.findByCode(
        input.code,
        actor.organizationId
      );
      if (existing) throw conflict("Department code already exists");
    }

    return this.departments.update(id, input);
  }
}
