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
  cohortId: "14f02be0-0b00-4c5f-9dcf-f0f6737de001",
  phoneNumber: "+201012345678",
  nationalId: "30001011234567",
  dateOfBirth: "2000-01-01",
};

const METADATA = {
  universityId: DETAILS.universityId,
  fullName: DETAILS.fullName,
  organizationCode: DETAILS.organizationCode,
  cohortId: DETAILS.cohortId,
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

    override async findRegistrationCohort(id: string, organizationId: string) {
      if (id !== DETAILS.cohortId || organizationId !== "org-nctu") return null;
      return {
        id,
        organizationId,
        departmentId: "dept-mec",
        department: { id: "dept-mec", code: "MEC", name: "Mechatronics" },
        academicYear: "2026/2027",
        level: 2,
        section: "A",
        groupName: null,
        lectureSchedules: [
          { faculty: "Faculty of Engineering", department: "MEC", semester: 1 },
        ],
      } as never;
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
  it("returns only configured university-owned academic choices", async () => {
    class FakeUsers extends UserRepository {
      override async findRegistrationOptionsByOrganizationCode(code: string) {
        if (code !== "NCTU") return null;
        return {
          id: "org-nctu",
          code,
          name: "New Cairo Technological University",
          academicTerms: [
            { name: "First Semester", academicYear: "2026/2027", semester: 1 },
          ],
          cohorts: [
            {
              id: DETAILS.cohortId,
              name: "Mechatronics L2 — A",
              academicYear: "2026/2027",
              level: 2,
              section: "A",
              groupName: null,
              department: { id: "dept-mec", code: "MEC", name: "Mechatronics" },
              lectureSchedules: [
                { faculty: "Faculty of Engineering", department: "MEC", semester: 1 },
                { faculty: "Faculty of Engineering", department: "MEC", semester: 1 },
              ],
            },
          ],
        } as never;
      }
    }

    const result = await new AuthService(new FakeUsers()).getRegistrationOptions(
      " nctu "
    );

    expect(result.organization.code).toBe("NCTU");
    expect(result.options).toEqual([
      expect.objectContaining({
        cohortId: DETAILS.cohortId,
        faculty: "Faculty of Engineering",
        department: "Mechatronics",
        level: 2,
        semesterLabel: "First Semester",
        section: "A",
        academicYear: "2026/2027",
      }),
    ]);
  });

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
        departmentId: "dept-mec",
        studentProfile: expect.objectContaining({
          faculty: "Faculty of Engineering",
          department: "MEC",
          level: 2,
          semester: "First Semester",
          section: "A",
          cohortId: DETAILS.cohortId,
          phoneNumber: DETAILS.phoneNumber,
          nationalId: DETAILS.nationalId,
        }),
      }),
    ]);
  });

  it("does not copy personal identity data into cross-device metadata", async () => {
    const fixture = build();

    await expect(
      fixture.service.completeSupabaseRegistration(
        { ...IDENTITY, registration: METADATA },
        {}
      )
    ).rejects.toMatchObject({ code: "REGISTRATION_DETAILS_REQUIRED" });
    expect(fixture.creates).toHaveLength(0);
  });

  it("lets same-device form data override stale non-authoritative metadata", async () => {
    const fixture = build();

    await fixture.service.completeSupabaseRegistration(
      {
        ...IDENTITY,
        registration: { ...METADATA, fullName: "Old Name" },
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
