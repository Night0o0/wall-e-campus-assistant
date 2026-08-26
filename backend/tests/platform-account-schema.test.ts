import { describe, expect, it } from "vitest";
import {
  createUserSchema,
  updateUserSchema,
} from "../src/types/user.types.js";

const base = {
  universityId: "CU-ADM-900",
  fullName: "Test Account",
  email: "account@example.edu",
  password: "Password123",
  organizationId: "11111111-1111-4111-8111-111111111111",
  isVerified: true,
};
const departmentId = "22222222-2222-4222-8222-222222222222";

describe("platform account role/profile contract", () => {
  it.each(["INSTRUCTOR", "DEPARTMENT_ADMIN", "UNIVERSITY_ADMIN"] as const)(
    "requires an AdminProfile title when creating %s",
    (role) => {
      expect(createUserSchema.safeParse({ ...base, role }).success).toBe(false);
      const scoped =
        role === "UNIVERSITY_ADMIN" ? {} : { departmentId };
      expect(
        createUserSchema.safeParse({ ...base, role, jobTitle: "Professor", ...scoped })
          .success
      ).toBe(true);
    }
  );

  it("requires departmentId for department-scoped staff", () => {
    expect(
      createUserSchema.safeParse({ ...base, role: "INSTRUCTOR", jobTitle: "Professor" })
        .success
    ).toBe(false);
    expect(
      createUserSchema.safeParse({
        ...base,
        role: "DEPARTMENT_ADMIN",
        jobTitle: "Coordinator",
      }).success
    ).toBe(false);
  });

  it("does not accept staff profile fields for a student", () => {
    expect(
      createUserSchema.safeParse({
        ...base,
        role: "STUDENT",
        jobTitle: "Professor",
      }).success
    ).toBe(false);
  });

  it("rejects role changes after account creation", () => {
    expect(
      updateUserSchema.safeParse({ fullName: "Updated Name", role: "INSTRUCTOR" })
        .success
    ).toBe(false);
  });
});
