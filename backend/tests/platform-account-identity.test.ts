import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const deleteUser = vi.fn();
const updateUserById = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { createUser, deleteUser, updateUserById } },
  }),
}));

import { env } from "../src/config/env.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { UserService } from "../src/services/user.service.js";

class FakeUsers extends UserRepository {
  created: Record<string, unknown> | null = null;
  user = {
    id: "user-1",
    authUserId: "supabase-user-1",
    email: "old@example.edu",
    role: "UNIVERSITY_ADMIN",
    organizationId: "11111111-1111-4111-8111-111111111111",
  };

  override async findByEmail() {
    return null as never;
  }
  override async findByUniversityId() {
    return null as never;
  }
  override async findById() {
    return this.user as never;
  }
  override async findByIdSafe() {
    return this.user as never;
  }
  override async create(data: Record<string, unknown>) {
    this.created = data;
    return { ...this.user, ...data } as never;
  }
  override async update() {
    return this.user as never;
  }
  override async updatePassword(): Promise<never> {
    throw new Error("must not write a local password");
  }
}

const db = {
  organization: { findUnique: vi.fn().mockResolvedValue({ id: "org-1" }) },
  user: { count: vi.fn().mockResolvedValue(1) },
};

let originalProvider: string;

beforeEach(() => {
  originalProvider = env.AUTH_PROVIDER;
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = "supabase";
  createUser.mockReset().mockResolvedValue({
    data: { user: { id: "supabase-new-user" } },
    error: null,
  });
  deleteUser.mockReset().mockResolvedValue({ error: null });
  updateUserById.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = originalProvider;
});

describe("platform account identity lifecycle", () => {
  it("creates a Supabase identity instead of a local password", async () => {
    const users = new FakeUsers();
    await new UserService(users, db as never).create({
      universityId: "ADMIN-1001",
      fullName: "University Admin",
      email: "admin@example.edu",
      password: "password-123",
      role: "UNIVERSITY_ADMIN",
      organizationId: "11111111-1111-4111-8111-111111111111",
      isVerified: true,
      jobTitle: "Administrator",
    });

    expect(users.created).toMatchObject({
      authUserId: "supabase-new-user",
      passwordHash: undefined,
    });
  });

  it("resets a linked password with the Supabase Admin API", async () => {
    await new UserService(new FakeUsers(), db as never).resetPassword(
      "user-1",
      "new-password-123"
    );

    expect(updateUserById).toHaveBeenCalledWith("supabase-user-1", {
      password: "new-password-123",
    });
  });

  it("coordinates a linked email update through Supabase", async () => {
    await new UserService(new FakeUsers(), db as never).update(
      "user-1",
      { email: "new@example.edu" },
      "owner-1"
    );

    expect(updateUserById).toHaveBeenCalledWith("supabase-user-1", {
      email: "new@example.edu",
      email_confirm: true,
    });
  });
});
