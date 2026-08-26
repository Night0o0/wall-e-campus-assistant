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
      : email.startsWith("super")
        ? "UNIVERSITY_ADMIN"
        : email.startsWith("admin")
          ? "INSTRUCTOR"
          : "STUDENT";

    return {
      id: `user-${role}`,
      universityId: `ID-${role}`,
      fullName: "Mobile Test User",
      email,
      passwordHash,
      role,
      isVerified: true,
      verifiedAt: null,
      verifiedById: null,
      isActive: true,
      organizationId: "org-mobile",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
  }
}

describe("mobile account boundary", () => {
  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  it.each([
    ["super@campus.edu", "UNIVERSITY_ADMIN"],
    ["admin@campus.edu", "INSTRUCTOR"],
    ["student@campus.edu", "STUDENT"],
  ])("issues an app token to %s", async (email, role) => {
    const result = await new AuthService(new FakeUsers()).loginForMobile({
      email,
      password: PASSWORD,
    });

    expect(result.token).toBeTruthy();
    expect(result.user.role).toBe(role);
  });

  it("refuses the web-only system owner before returning a token", async () => {
    await expect(
      new AuthService(new FakeUsers()).loginForMobile({
        email: "owner@wall-e.io",
        password: PASSWORD,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "WEB_ONLY_ACCOUNT",
    });
  });
});
