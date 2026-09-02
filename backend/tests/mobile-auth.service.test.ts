import bcrypt from "bcrypt";
import { beforeAll, describe, expect, it } from "vitest";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";

const PASSWORD = "Mobile@12345";
let passwordHash = "";

class FakeUsers extends UserRepository {
  override async findByEmail(email: string) {
    const role = email.startsWith("owner")
      ? "SYSTEM_OWNER"
      : email.startsWith("university")
        ? "UNIVERSITY_ADMIN"
        : email.startsWith("department")
          ? "DEPARTMENT_ADMIN"
          : email.startsWith("instructor")
            ? "INSTRUCTOR"
            : "STUDENT";

    return {
      id: `user-${role}`,
      universityId: `ID-${role}`,
      fullName: "Mobile Test User",
      email,
      passwordHash,
      role,
      accountStatus: "ACTIVE",
      isVerified: true,
      verifiedAt: null,
      verifiedById: null,
      isActive: true,
      organizationId: "org-mobile",
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
  }
}

describe("mobile account boundary", () => {
  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  it("issues an app token only to a student", async () => {
    const result = await new AuthService(new FakeUsers()).loginForMobile({
      email: "student@campus.edu",
      password: PASSWORD,
    });
    expect(result.token).toBeTruthy();
    expect(result.user.role).toBe("STUDENT");
  });

  it.each([
    "owner@campus.edu",
    "university@campus.edu",
    "department@campus.edu",
    "instructor@campus.edu",
  ])("refuses staff account %s before returning a token", async (email) => {
    await expect(
      new AuthService(new FakeUsers()).loginForMobile({ email, password: PASSWORD })
    ).rejects.toMatchObject({ statusCode: 403, code: "WEB_ONLY_ACCOUNT" });
  });
});

describe("web account boundary", () => {
  it("issues a web token to staff", async () => {
    const result = await new AuthService(new FakeUsers()).loginForWeb({
      email: "instructor@campus.edu",
      password: PASSWORD,
    });
    expect(result.user.role).toBe("INSTRUCTOR");
  });

  it("refuses a student before returning a web token", async () => {
    await expect(
      new AuthService(new FakeUsers()).loginForWeb({
        email: "student@campus.edu",
        password: PASSWORD,
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "MOBILE_ONLY_ACCOUNT" });
  });
});
