import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findMany: vi.fn(),
  findById: vi.fn(),
  userBreakdown: vi.fn(),
  findByCode: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const prisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../src/repositories/organization.repository.js", () => ({
  OrganizationRepository: class {
    findMany = repo.findMany;
    findById = repo.findById;
    userBreakdown = repo.userBreakdown;
    findByCode = repo.findByCode;
    update = repo.update;
    delete = repo.delete;
  },
}));

vi.mock("../src/lib/prisma.js", () => ({
  default: prisma,
}));

const { OrganizationService } = await import("../src/services/organization.service.js");

const QUERY = { page: 2, limit: 2, sortOrder: "desc" as const };

describe("organization service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizations with pagination metadata", async () => {
    repo.findMany.mockResolvedValue({
      data: [{ id: "org-3", code: "CU", name: "Cairo University" }],
      total: 3,
    });

    const service = new OrganizationService();
    const result = await service.list(QUERY);

    expect(repo.findMany).toHaveBeenCalledWith(QUERY);
    expect(result.data).toHaveLength(1);
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("returns one organization with its user-role breakdown", async () => {
    repo.findById.mockResolvedValue({
      id: "org-1",
      code: "NCTU",
      name: "New Cairo Technological University",
      _count: { users: 12, courses: 5, sessions: 8 },
    });
    repo.userBreakdown.mockResolvedValue({
      UNIVERSITY_ADMIN: 1,
      INSTRUCTOR: 4,
      STUDENT: 7,
    });

    const service = new OrganizationService();
    const result = await service.getById("org-1");

    expect(repo.userBreakdown).toHaveBeenCalledWith("org-1");
    expect(result.userBreakdown).toEqual({
      UNIVERSITY_ADMIN: 1,
      INSTRUCTOR: 4,
      STUDENT: 7,
    });
  });

  it("creates the organization and its first admin atomically", async () => {
    repo.findByCode.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    const tx = {
      organization: {
        create: vi.fn().mockResolvedValue({ id: "org-1" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "org-1",
          code: "NCTU",
          name: "New Cairo Technological University",
          _count: { users: 1, courses: 0, sessions: 0 },
        }),
      },
      user: {
        create: vi.fn().mockResolvedValue({ id: "admin-1" }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (client: any) => unknown) =>
      callback(tx)
    );

    const service = new OrganizationService();
    const result = await service.create({
      name: "New Cairo Technological University",
      code: "NCTU",
      email: "",
      admin: {
        universityId: "NCTU-ADM-1",
        fullName: "Nour Hassan",
        email: "nour@nctu.edu.eg",
        password: "password123",
      },
    });

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New Cairo Technological University",
        code: "NCTU",
        email: null,
      }),
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        universityId: "NCTU-ADM-1",
        role: "UNIVERSITY_ADMIN",
        isVerified: true,
        organizationId: "org-1",
      }),
    });
    expect(result.id).toBe("org-1");
  });

  it("refuses to delete an organization that still has users", async () => {
    repo.findById.mockResolvedValue({
      id: "org-1",
      _count: { users: 2, courses: 0, sessions: 0 },
    });

    const service = new OrganizationService();

    await expect(service.remove("org-1")).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty organization", async () => {
    repo.findById.mockResolvedValue({
      id: "org-1",
      _count: { users: 0, courses: 0, sessions: 0 },
    });

    const service = new OrganizationService();
    await service.remove("org-1");

    expect(repo.delete).toHaveBeenCalledWith("org-1");
  });
});
