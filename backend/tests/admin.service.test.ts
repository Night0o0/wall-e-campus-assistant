import { describe, expect, it } from "vitest";
import {
  AdminRepository,
  OrganizationOverviewWindow,
} from "../src/repositories/admin.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AdminService } from "../src/services/admin.service.js";
import { adminUserQuerySchema } from "../src/types/admin.types.js";
import { AdminUserQuery } from "../src/types/admin.types.js";

/**
 * The university administration console.
 *
 * These endpoints exist because the platform-owner equivalents could not be
 * safely opened up — /api/users reads its organization from the query string.
 * So the property under test throughout is the same one: whatever the request
 * says, the tenant comes from the authenticated user.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

const SUPER_ADMIN = {
  id: "super-admin",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};

const FOREIGN_SUPER_ADMIN = {
  id: "cu-super-admin",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_B,
};

interface UserFixture {
  id: string;
  organizationId: string;
  fullName: string;
  universityId: string;
  email: string;
  role: string;
  isActive: boolean;
  profileStatus?: "INCOMPLETE" | "COMPLETED";
}

const USERS: UserFixture[] = [
  {
    id: "a-student",
    organizationId: ORG_A,
    fullName: "Youssef Nasser",
    universityId: "NCTU-B1",
    email: "b1@student.nctu.edu.eg",
    role: "STUDENT",
    isActive: true,
    profileStatus: "COMPLETED",
  },
  {
    id: "a-staff",
    organizationId: ORG_A,
    fullName: "Adel Mansour",
    universityId: "NCTU-ADM-DR1",
    email: "adel@nctu.edu.eg",
    role: "ADMIN",
    isActive: true,
  },
  {
    id: "b-student",
    organizationId: ORG_B,
    fullName: "Cairo Student",
    universityId: "CU-B1",
    email: "b1@student.cu.edu.eg",
    role: "STUDENT",
    isActive: true,
    profileStatus: "COMPLETED",
  },
];

/** Records the organizationId it was called with, and honours it. */
class FakeUserRepository extends UserRepository {
  calledWith: string[] = [];

  override async findManyInOrganization(
    organizationId: string,
    query: AdminUserQuery
  ) {
    this.calledWith.push(organizationId);

    const matched = USERS.filter(
      (user) =>
        user.organizationId === organizationId &&
        (!query.role || user.role === query.role)
    );

    return {
      data: matched.map((user) => ({
        id: user.id,
        universityId: user.universityId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: true,
        isActive: user.isActive,
        organizationId: user.organizationId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        studentProfile: user.profileStatus
          ? {
              status: user.profileStatus,
              faculty: "Faculty of Engineering",
              department: "Mechatronics",
              level: 2,
              semester: "First Semester",
              section: "B",
            }
          : null,
      })) as never,
      total: matched.length,
    };
  }
}

class FakeAdminRepository extends AdminRepository {
  calledWith: string[] = [];
  lastWindow: OrganizationOverviewWindow | null = null;

  override async findOrganization(organizationId: string) {
    if (organizationId !== ORG_A) {
      return null;
    }

    return { id: ORG_A, name: "New Cairo Technological University", code: "NCTU" };
  }

  override async organizationOverview(
    organizationId: string,
    window: OrganizationOverviewWindow
  ) {
    this.calledWith.push(organizationId);
    this.lastWindow = window;

    return {
      activeStudents: 24,
      inactiveStudents: 2,
      staff: 5,
      incompleteProfiles: 6,
      courses: 9,
      activeLectures: 8,
      activeSessions: 1,
      sessionsToday: 3,
      sessionsClosedThisWeek: 4,
      scansThisWeek: 70,
    };
  }
}

const build = () => {
  const admin = new FakeAdminRepository();
  const users = new FakeUserRepository();

  return {
    admin,
    users,
    service: new AdminService(admin, users, "Africa/Cairo"),
  };
};

const parseQuery = (raw: Record<string, string>) =>
  adminUserQuerySchema.parse(raw);

describe("university overview", () => {
  it("counts only the caller's own organization", async () => {
    const { service, admin } = build();

    const overview = await service.getOverview(SUPER_ADMIN);

    expect(admin.calledWith).toEqual([ORG_A]);
    expect(overview.organization.code).toBe("NCTU");
    expect(overview.people).toEqual({
      activeStudents: 24,
      inactiveStudents: 2,
      staff: 5,
      incompleteProfiles: 6,
    });
    expect(overview.academics).toEqual({ courses: 9, activeLectures: 8 });
    expect(overview.sessions).toEqual({
      today: 3,
      active: 1,
      closedThisWeek: 4,
    });
  });

  it("reports attendance as a measurement, not an invented rate", async () => {
    const { service } = build();

    const overview = await service.getOverview(SUPER_ADMIN);

    // 70 scans over 4 closed sessions.
    expect(overview.attendance.scansThisWeek).toBe(70);
    expect(overview.attendance.averageAttendeesPerSession).toBe(17.5);
  });

  it("starts the week on Sunday, on the campus clock", async () => {
    const { service, admin } = build();

    await service.getOverview(SUPER_ADMIN);

    const { startOfWeek, startOfToday } = admin.lastWindow!;

    // Sunday is 0 in the local calendar the week is measured in.
    const weekdayInCairo = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      weekday: "long",
    }).format(startOfWeek);

    expect(weekdayInCairo).toBe("Sunday");
    expect(startOfWeek.getTime()).toBeLessThanOrEqual(startOfToday.getTime());

    // Both are local midnight, so neither is more than a week apart.
    expect(startOfToday.getTime() - startOfWeek.getTime()).toBeLessThan(
      7 * 24 * 60 * 60 * 1000
    );
  });

  it("does not invent an average when no session has closed", async () => {
    const { service, admin } = build();

    admin.organizationOverview = (async () => ({
      activeStudents: 3,
      inactiveStudents: 0,
      staff: 1,
      incompleteProfiles: 3,
      courses: 1,
      activeLectures: 0,
      activeSessions: 0,
      sessionsToday: 0,
      sessionsClosedThisWeek: 0,
      scansThisWeek: 0,
    })) as never;

    const overview = await service.getOverview(SUPER_ADMIN);

    expect(overview.attendance.averageAttendeesPerSession).toBeNull();
  });

  it("404s when the caller's organization no longer exists", async () => {
    const { service } = build();

    await expect(
      service.getOverview(FOREIGN_SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("university user directory", () => {
  it("lists only the caller's own organization", async () => {
    const { service, users } = build();

    const result = await service.listUsers(parseQuery({}), SUPER_ADMIN);

    expect(users.calledWith).toEqual([ORG_A]);
    expect(result.meta.total).toBe(2);
    expect(result.data.map((user) => user.id).sort()).toEqual([
      "a-staff",
      "a-student",
    ]);
    expect(result.data.map((user) => user.id)).not.toContain("b-student");
  });

  it("ignores an organizationId smuggled in through the query string", async () => {
    // This is the exact attack the separate endpoint exists to prevent: the
    // platform-owner route reads organizationId from the query, so reusing it
    // would have let one university read another's directory.
    const { service, users } = build();

    const query = parseQuery({
      organizationId: ORG_B,
      organisationId: ORG_B,
      role: "STUDENT",
    } as Record<string, string>);

    // The schema does not declare the field, so Zod strips it before it can
    // reach a service or a repository.
    expect(query).not.toHaveProperty("organizationId");

    const result = await service.listUsers(query, SUPER_ADMIN);

    expect(users.calledWith).toEqual([ORG_A]);
    expect(result.data.map((user) => user.id)).toEqual(["a-student"]);
  });

  it("never exposes a password hash or a national ID", async () => {
    const { service } = build();

    const result = await service.listUsers(parseQuery({}), SUPER_ADMIN);
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain("passwordHash");
    expect(serialised).not.toContain("nationalId");
    expect(serialised).not.toContain("phoneNumber");
    expect(serialised).not.toContain("dateOfBirth");

    const student = result.data.find((user) => user.id === "a-student")!;

    expect(student.profile).toEqual({
      status: "COMPLETED",
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: "First Semester",
      section: "B",
    });

    // Staff carry an AdminProfile, which is not part of a directory listing.
    expect(result.data.find((user) => user.id === "a-staff")!.profile).toBeNull();
  });

  it("refuses SYSTEM_OWNER as a role filter", () => {
    // A platform role is not a campus one, so it is not offered as a filter.
    expect(() => parseQuery({ role: "SYSTEM_OWNER" })).toThrow();
  });
});
