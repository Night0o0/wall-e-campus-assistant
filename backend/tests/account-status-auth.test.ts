import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/prisma.js", () => ({
  default: { user: { findUnique, update } },
}));

vi.mock("../src/lib/supabase-auth.js", () => ({
  looksLikeSupabaseToken: () => true,
  verifySupabaseIdentity: async () => ({
    authUserId: "auth-student-1",
    email: "student@example.edu",
    userMetadata: {},
  }),
}));

import { authenticate } from "../src/middleware/auth.middleware.js";
import { env } from "../src/config/env.js";

let originalProvider: string;

beforeAll(() => {
  originalProvider = env.AUTH_PROVIDER;
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = "supabase";
});

afterAll(() => {
  (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = originalProvider;
});

const baseUser = {
  id: "student-1",
  universityId: "STU-1001",
  fullName: "Student",
  email: "student@example.edu",
  role: "STUDENT",
  accountStatus: "ACTIVE",
  isVerified: true,
  isActive: true,
  organizationId: "org-1",
  departmentId: null,
};

async function run(user: Record<string, unknown>) {
  findUnique.mockResolvedValueOnce(user);
  const request = {
    headers: { authorization: "Bearer verified.supabase.token" },
  } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;

  await authenticate(request, {} as Response, next);
  return { request, next: next as unknown as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe("account lifecycle authentication", () => {
  it("lets a pending student authenticate so they can complete their profile", async () => {
    const { request, next } = await run({
      ...baseUser,
      accountStatus: "PENDING",
      isVerified: false,
    });

    expect(next).toHaveBeenCalledWith();
    expect(request.user).toMatchObject({
      accountStatus: "PENDING",
      isVerified: false,
    });
  });

  it.each([
    [{ ...baseUser, accountStatus: "REJECTED", isActive: false }, /rejected/i],
    [{ ...baseUser, accountStatus: "DISABLED", isActive: false }, /deactivated/i],
    [{ ...baseUser, accountStatus: "ACTIVE", isActive: false }, /deactivated/i],
  ])("refuses rejected and disabled identities immediately", async (user, message) => {
    const { request, next } = await run(user);

    expect(request.user).toBeUndefined();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
    expect(next.mock.calls[0]?.[0].message).toMatch(message);
  });
});
