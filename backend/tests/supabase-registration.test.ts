import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { completeSupabaseRegistrationSchema } from "../src/types/auth.types.js";

const IDENTITY = {
  authUserId: "auth-student-1",
  email: "verified@student.example.edu",
};

const DETAILS = {
  universityId: "STU-2026-1001",
  fullName: "Verified Student",
  organizationCode: "nctu",
};

type CreateInput = Parameters<UserRepository["create"]>[0];

const build = (options: { failCreate?: boolean; installRaceWinner?: boolean } = {}) => {
  let identityUser: Record<string, unknown> | null = null;
  const creates: CreateInput[] = [];

  class FakeUsers extends UserRepository {
    override async findByAuthUserId(authUserId: string) {
      return identityUser?.authUserId === authUserId ? (identityUser as never) : null;
    }

    override async findOrganizationByCode(code: string) {
      return code === "NCTU" ? ({ id: "org-nctu", code } as never) : null;
    }

    override async findByEmail(email: string) {
      return identityUser?.email === email ? (identityUser as never) : null;
    }

    override async findByUniversityId(universityId: string) {
      return identityUser?.universityId === universityId
        ? (identityUser as never)
        : null;
    }

    override async create(data: CreateInput) {
      creates.push(data);

      if (options.failCreate) {
        if (options.installRaceWinner) {
          identityUser = { id: "winner", ...data };
        }
        throw new Error("database write failed");
      }

      identityUser = { id: "created-user", ...data };
      return identityUser as never;
    }
  }

  return {
    creates,
    get user() {
      return identityUser;
    },
    service: new AuthService(new FakeUsers()),
  };
};

describe("public Supabase registration completion", () => {
  it("uses the verified identity and forces a pending student", async () => {
    const fixture = build();

    const result = await fixture.service.completeSupabaseRegistration(
      { ...IDENTITY, registration: DETAILS },
      {}
    );

    expect(result.created).toBe(true);
    expect(fixture.creates).toEqual([
      expect.objectContaining({
        authUserId: IDENTITY.authUserId,
        email: IDENTITY.email,
        universityId: DETAILS.universityId,
        fullName: DETAILS.fullName,
        organizationId: "org-nctu",
        role: "STUDENT",
        accountStatus: "PENDING",
        isVerified: false,
        passwordHash: undefined,
      }),
    ]);
  });

  it("can finish on another browser from non-authoritative user metadata", async () => {
    const fixture = build();

    await fixture.service.completeSupabaseRegistration(
      { ...IDENTITY, registration: DETAILS },
      {}
    );

    expect(fixture.creates).toHaveLength(1);
  });

  it("lets same-device form data override stale non-authoritative metadata", async () => {
    const fixture = build();

    await fixture.service.completeSupabaseRegistration(
      {
        ...IDENTITY,
        registration: { ...DETAILS, fullName: "Old Name" },
      },
      { ...DETAILS, fullName: "Current Name" }
    );

    expect(fixture.creates[0]?.fullName).toBe("Current Name");
  });

  it("does not accept role or account authority in the public request", () => {
    const parsed = completeSupabaseRegistrationSchema.safeParse({
      ...DETAILS,
      role: "SYSTEM_OWNER",
      accountStatus: "ACTIVE",
      isVerified: true,
      organizationId: "some-other-tenant",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires complete details when neither device nor metadata has them", async () => {
    const fixture = build();

    await expect(
      fixture.service.completeSupabaseRegistration(IDENTITY, {})
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "REGISTRATION_DETAILS_REQUIRED",
    });
    expect(fixture.creates).toHaveLength(0);
  });

  it("is idempotent when completion is repeated", async () => {
    const fixture = build();

    const first = await fixture.service.completeSupabaseRegistration(
      { ...IDENTITY, registration: DETAILS },
      {}
    );
    const second = await fixture.service.completeSupabaseRegistration(
      IDENTITY,
      {}
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.user).toEqual(first.user);
    expect(fixture.creates).toHaveLength(1);
  });

  it("turns a concurrent duplicate callback into the idempotent result", async () => {
    const fixture = build({ failCreate: true, installRaceWinner: true });

    const result = await fixture.service.completeSupabaseRegistration(
      { ...IDENTITY, registration: DETAILS },
      {}
    );

    expect(result).toMatchObject({ created: false, user: { id: "winner" } });
    expect(fixture.creates).toHaveLength(1);
  });

  it("does not hide a genuine partial database failure", async () => {
    const fixture = build({ failCreate: true });

    await expect(
      fixture.service.completeSupabaseRegistration(
        { ...IDENTITY, registration: DETAILS },
        {}
      )
    ).rejects.toThrow("database write failed");
  });
});

describe("Supabase email projection", () => {
  let originalProvider: string;

  beforeEach(() => {
    originalProvider = env.AUTH_PROVIDER;
    (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = "supabase";
  });

  afterEach(() => {
    (env as { AUTH_PROVIDER: string }).AUTH_PROVIDER = originalProvider;
  });

  it("refuses a request-body email that has not been confirmed by Supabase", async () => {
    class FakeUsers extends UserRepository {
      override async findById() {
        return { id: "user-1", email: "old@example.edu" } as never;
      }

      override async update(): Promise<never> {
        throw new Error("must not write");
      }
    }

    await expect(
      new AuthService(new FakeUsers()).updateProfile("user-1", {
        email: "unconfirmed@example.edu",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
