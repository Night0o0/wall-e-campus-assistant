import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creating a campus account while AUTH_PROVIDER=supabase.
 *
 * This branch was untested, and the gap had teeth: the suite reads the
 * developer's .env, so once AUTH_PROVIDER was flipped to "supabase" locally,
 * tests that had always taken the bcrypt path silently started calling the real
 * Supabase Admin API and provisioned live identities from test fixtures.
 *
 * Two things prevent a repeat. vitest.config.ts pins AUTH_PROVIDER for the
 * suite, so the network path is never entered by accident; and this file opts
 * into it deliberately, with the admin client mocked, so the branch is covered
 * without a project, a key, or a socket.
 */

const createUser = vi.fn();
const deleteUser = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { createUser, deleteUser } } }),
  looksLikeSupabaseToken: () => false,
  verifySupabaseAccessToken: async () => "unused",
}));

// Static imports: vitest hoists vi.mock above them, so these still get the mock.
import { env } from "../src/config/env.js";
import { AdminRepository } from "../src/repositories/admin.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AdminService } from "../src/services/admin.service.js";

const ACTOR = { id: "a-super", role: "UNIVERSITY_ADMIN", organizationId: "org-a" };

const INPUT = {
  universityId: "NCTU-NEW",
  fullName: "Nour Hassan",
  email: "nour@nctu.edu.eg",
  password: "password123",
  role: "INSTRUCTOR" as const,
  jobTitle: "Lecturer",
};

const build = (createFails = false) => {
  const created: Record<string, unknown>[] = [];

  class FakeUsers extends UserRepository {
    override async findByEmail() {
      return null as never;
    }
    override async findByUniversityId() {
      return null as never;
    }
    override async createInOrganization(data: Record<string, unknown>) {
      if (createFails) throw new Error("database write failed");
      created.push(data);
      return { id: "new-user", ...data } as never;
    }
  }

  return { created, service: new AdminService(new AdminRepository(), new FakeUsers()) };
};

let originalProvider: string;

beforeEach(() => {
  originalProvider = env.AUTH_PROVIDER;
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = "supabase";
  createUser.mockReset();
  deleteUser.mockReset();
  createUser.mockResolvedValue({ data: { user: { id: "supabase-uid-1" } }, error: null });
  deleteUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = originalProvider;
});

describe("provisioning the login identity", () => {
  it("creates the Supabase identity and stores its id as authUserId", async () => {
    const { created, service } = build();

    await service.createUser(INPUT as never, ACTOR as never);

    expect(createUser).toHaveBeenCalledTimes(1);
    expect(created[0]!.authUserId).toBe("supabase-uid-1");
  });

  it("stores no password hash — the password lives in Supabase alone", async () => {
    const { created, service } = build();

    await service.createUser(INPUT as never, ACTOR as never);

    expect(created[0]!.passwordHash).toBeUndefined();
  });

  it("confirms the address so an administrator-created account can sign in at once", async () => {
    const { service } = build();

    await service.createUser(INPUT as never, ACTOR as never);

    expect(createUser.mock.calls[0]![0]).toMatchObject({
      email: INPUT.email,
      email_confirm: true,
    });
  });

  it("refuses rather than writing a user when the identity cannot be created", async () => {
    const { created, service } = build();
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "boom" } });

    await expect(service.createUser(INPUT as never, ACTOR as never)).rejects.toThrow(
      /provision the login identity/i
    );
    expect(created).toHaveLength(0);
  });

  it("deletes the identity again when the database write fails", async () => {
    // Otherwise a failed creation leaves a login that maps to no account —
    // exactly the orphan this suite once created against the live project.
    const { service } = build(true);

    await expect(service.createUser(INPUT as never, ACTOR as never)).rejects.toThrow(
      /database write failed/
    );

    expect(deleteUser).toHaveBeenCalledWith("supabase-uid-1");
  });
});

describe("the legacy branch is still reachable", () => {
  it("hashes a password and creates no identity when AUTH_PROVIDER=legacy", async () => {
    (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = "legacy";
    const { created, service } = build();

    await service.createUser(INPUT as never, ACTOR as never);

    expect(createUser).not.toHaveBeenCalled();
    expect(created[0]!.authUserId).toBeUndefined();
    expect(typeof created[0]!.passwordHash).toBe("string");
    expect(created[0]!.passwordHash).not.toBe(INPUT.password);
  });
});
