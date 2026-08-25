import { describe, expect, it } from "vitest";
import { AdminRepository } from "../src/repositories/admin.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AdminService } from "../src/services/admin.service.js";
import {
  createCampusUserSchema,
  updateCampusUserSchema,
} from "../src/types/admin.types.js";

/**
 * A university staffing itself.
 *
 * Until now only SYSTEM_OWNER could create an account, which meant no
 * university could appoint its own professors. These endpoints close that gap
 * without reopening the one /api/users has: the organization comes from the
 * token, and the set of roles that can be minted is closed.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

const SUPER_ADMIN = {
  id: "a-super",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};

interface Row {
  id: string;
  organizationId: string;
  role: string;
  email: string;
}

const EXISTING: Row[] = [
  { id: "a-staff", organizationId: ORG_A, role: "ADMIN", email: "adel@nctu.edu.eg" },
  { id: "a-student", organizationId: ORG_A, role: "STUDENT", email: "b1@nctu.edu.eg" },
  { id: "a-peer", organizationId: ORG_A, role: "UNIVERSITY_SUPER_ADMIN", email: "peer@nctu.edu.eg" },
  { id: "b-staff", organizationId: ORG_B, role: "ADMIN", email: "staff@cu.edu.eg" },
];

const build = () => {
  const created: Record<string, unknown>[] = [];
  const passwords: { id: string; hash: string }[] = [];

  class FakeUsers extends UserRepository {
    override async findInOrganization(id: string, organizationId: string) {
      const found = EXISTING.find(
        (row) => row.id === id && row.organizationId === organizationId
      );

      return (found ? { ...found, fullName: "Adel Mansour" } : null) as never;
    }

    override async findByEmail(email: string) {
      return (EXISTING.find((row) => row.email === email) ?? null) as never;
    }

    override async findByUniversityId(universityId: string) {
      return (universityId === "NCTU-TAKEN" ? EXISTING[0] : null) as never;
    }

    override async createInOrganization(data: Record<string, unknown>) {
      created.push(data);
      return { id: "new-user", ...data } as never;
    }

    override async update(id: string, data: Record<string, unknown>) {
      return { id, ...data } as never;
    }

    override async updatePassword(id: string, passwordHash: string) {
      passwords.push({ id, hash: passwordHash });
      return { id } as never;
    }
  }

  return {
    created,
    passwords,
    service: new AdminService(new AdminRepository(), new FakeUsers()),
  };
};

describe("which roles a university may create", () => {
  it("refuses to mint a platform owner", () => {
    expect(() =>
      createCampusUserSchema.parse({
        universityId: "NCTU-X1",
        fullName: "Escalation Attempt",
        email: "x@nctu.edu.eg",
        password: "password123",
        role: "SYSTEM_OWNER",
      })
    ).toThrow();
  });

  it("refuses to mint another super admin", () => {
    // A super admin creating a super admin is escalation with no ceiling. The
    // role is granted by the platform owner through /api/users and nowhere else.
    expect(() =>
      createCampusUserSchema.parse({
        universityId: "NCTU-X2",
        fullName: "Escalation Attempt",
        email: "x2@nctu.edu.eg",
        password: "password123",
        role: "UNIVERSITY_SUPER_ADMIN",
      })
    ).toThrow();
  });

  it("requires a job title for an ADMIN and rejects one for a STUDENT", () => {
    const base = {
      universityId: "NCTU-X3",
      fullName: "Adel Mansour",
      email: "x3@nctu.edu.eg",
      password: "password123",
    };

    // AdminProfile.jobTitle is non-nullable, and it is where "Dr." lives.
    expect(() => createCampusUserSchema.parse({ ...base, role: "ADMIN" })).toThrow();

    expect(() =>
      createCampusUserSchema.parse({
        ...base,
        role: "STUDENT",
        jobTitle: "Dr.",
      })
    ).toThrow();

    expect(
      createCampusUserSchema.parse({ ...base, role: "ADMIN", jobTitle: "Dr." })
    ).toMatchObject({ role: "ADMIN", jobTitle: "Dr." });
  });

  it("does not accept a role on an edit", () => {
    // Moving an account between roles is not an edit, and a role field here
    // would be the shortest path from "edit a student" to "mint a super admin".
    const parsed = updateCampusUserSchema.parse({
      fullName: "Adel Mansour",
      role: "UNIVERSITY_SUPER_ADMIN",
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty("role");
  });
});

describe("creating a campus account", () => {
  it("takes the organization from the token, never from the body", async () => {
    const { service, created } = build();

    await service.createUser(
      createCampusUserSchema.parse({
        universityId: "NCTU-NEW",
        fullName: "Nour Hassan",
        email: "nour@nctu.edu.eg",
        password: "password123",
        role: "ADMIN",
        jobTitle: "Dr.",
        // Not declared by the schema, so it never survives validation.
        organizationId: ORG_B,
      } as Record<string, unknown>),
      SUPER_ADMIN
    );

    expect(created[0].organizationId).toBe(ORG_A);
  });

  it("marks an administrator-created account as already approved", async () => {
    const { service, created } = build();

    await service.createUser(
      createCampusUserSchema.parse({
        universityId: "NCTU-NEW2",
        fullName: "Nour Hassan",
        email: "nour2@nctu.edu.eg",
        password: "password123",
        role: "STUDENT",
      }),
      SUPER_ADMIN
    );

    // The decision was made at the moment of creation; only self-registration
    // produces a pending student.
    expect(created[0].isVerified).toBe(true);
  });

  it("never stores the plaintext password", async () => {
    const { service, created } = build();

    await service.createUser(
      createCampusUserSchema.parse({
        universityId: "NCTU-NEW3",
        fullName: "Nour Hassan",
        email: "nour3@nctu.edu.eg",
        password: "password123",
        role: "STUDENT",
      }),
      SUPER_ADMIN
    );

    expect(created[0]).not.toHaveProperty("password");
    expect(created[0].passwordHash).not.toBe("password123");
    expect(String(created[0].passwordHash)).toMatch(/^\$2[aby]\$/);
  });

  it("409s on an email or university ID already in use anywhere", async () => {
    const { service } = build();

    // Both columns are globally unique, so the clash can cross tenants.
    await expect(
      service.createUser(
        createCampusUserSchema.parse({
          universityId: "NCTU-FREE",
          fullName: "Nour Hassan",
          email: "staff@cu.edu.eg",
          password: "password123",
          role: "STUDENT",
        }),
        SUPER_ADMIN
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      service.createUser(
        createCampusUserSchema.parse({
          universityId: "NCTU-TAKEN",
          fullName: "Nour Hassan",
          email: "free@nctu.edu.eg",
          password: "password123",
          role: "STUDENT",
        }),
        SUPER_ADMIN
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("editing a campus account", () => {
  it("404s on a user from another university", async () => {
    const { service } = build();

    await expect(
      service.updateUser("b-staff", { fullName: "Renamed" }, SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(service.getUser("b-staff", SUPER_ADMIN)).rejects.toMatchObject({
      statusCode: 404,
    });

    await expect(
      service.resetPassword("b-staff", "password123", SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s rather than editing a fellow super admin", async () => {
    const { service } = build();

    // Administering staff and students is the job. Editing a peer is not.
    await expect(
      service.updateUser("a-peer", { isActive: false }, SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses a job title on a student", async () => {
    const { service } = build();

    await expect(
      service.updateUser("a-student", { jobTitle: "Dr." }, SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("hashes a reset password", async () => {
    const { service, passwords } = build();

    await service.resetPassword("a-student", "password123", SUPER_ADMIN);

    expect(passwords).toHaveLength(1);
    expect(passwords[0].hash).not.toBe("password123");
    expect(passwords[0].hash).toMatch(/^\$2[aby]\$/);
  });
});
