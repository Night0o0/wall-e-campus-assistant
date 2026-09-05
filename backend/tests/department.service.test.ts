import { beforeEach, describe, expect, it, vi } from "vitest";
import { DepartmentService } from "../src/services/department.service.js";

const ORG = "org-a";
const DEPT = "dept-a";
const QUERY = { page: 1, limit: 10, sortOrder: "desc" as const };

const SUPER_ADMIN = {
  id: "ua-1",
  universityId: "NCTU-ADM-1",
  fullName: "Nour Hassan",
  email: "nour@nctu.edu.eg",
  role: "UNIVERSITY_ADMIN" as const,
  accountStatus: "ACTIVE" as const,
  isVerified: true,
  isActive: true,
  organizationId: ORG,
  departmentId: null,
};

const DEPARTMENT_ADMIN = {
  id: "da-1",
  universityId: "NCTU-DA-1",
  fullName: "Salma Adel",
  email: "salma@nctu.edu.eg",
  role: "DEPARTMENT_ADMIN" as const,
  accountStatus: "ACTIVE" as const,
  isVerified: true,
  isActive: true,
  organizationId: ORG,
  departmentId: DEPT,
};

const INSTRUCTOR = {
  id: "inst-1",
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

const buildRepo = () => ({
  findMany: vi.fn(),
  findById: vi.fn(),
  findByCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
});

describe("department service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("scopes a department admin's list to their linked department", async () => {
    const departments = buildRepo();
    departments.findMany.mockResolvedValue({
      data: [{ id: DEPT, code: "MECH", name: "Mechatronics" }],
      total: 1,
    });

    const service = new DepartmentService(departments as never);
    const result = await service.list(QUERY, DEPARTMENT_ADMIN);

    expect(departments.findMany).toHaveBeenCalledWith(ORG, QUERY, DEPT);
    expect(result.meta.total).toBe(1);
  });

  it("scopes an instructor list to their own department as well", async () => {
    const departments = buildRepo();
    departments.findMany.mockResolvedValue({
      data: [{ id: DEPT, code: "MECH", name: "Mechatronics" }],
      total: 1,
    });

    const service = new DepartmentService(departments as never);
    await service.list(QUERY, INSTRUCTOR);

    expect(departments.findMany).toHaveBeenCalledWith(ORG, QUERY, DEPT);
  });

  it("creates a department inside the caller's organization", async () => {
    const departments = buildRepo();
    departments.findByCode.mockResolvedValue(null);
    departments.create.mockResolvedValue({
      id: DEPT,
      organizationId: ORG,
      code: "MECH",
      name: "Mechatronics",
    });

    const service = new DepartmentService(departments as never);
    const created = await service.create(
      { code: "MECH", name: "Mechatronics" },
      SUPER_ADMIN
    );

    expect(departments.create).toHaveBeenCalledWith(ORG, {
      code: "MECH",
      name: "Mechatronics",
    });
    expect(created.organizationId).toBe(ORG);
  });

  it("refuses a duplicate department code in the same organization", async () => {
    const departments = buildRepo();
    departments.findByCode.mockResolvedValue({ id: DEPT });

    const service = new DepartmentService(departments as never);

    await expect(
      service.create({ code: "MECH", name: "Mechatronics" }, SUPER_ADMIN)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
  });

  it("lets an instructor read only a department they are authorized for", async () => {
    const departments = buildRepo();
    departments.findById.mockResolvedValue({
      id: DEPT,
      organizationId: ORG,
      code: "MECH",
      name: "Mechatronics",
    });

    const service = new DepartmentService(departments as never);
    const department = await service.get(DEPT, INSTRUCTOR);

    expect(department.id).toBe(DEPT);
  });

  it("refuses an instructor reading another department", async () => {
    const departments = buildRepo();
    departments.findById.mockResolvedValue({
      id: "dept-b",
      organizationId: ORG,
      code: "EE",
      name: "Electrical",
    });

    const service = new DepartmentService(departments as never);

    await expect(service.get("dept-b", INSTRUCTOR)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});
