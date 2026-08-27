import { describe, expect, it } from "vitest";
import {
  CLIENT_PLATFORM_HEADER,
  WEB_ONLY_MESSAGE,
  assertClientAllowed,
  declaredPlatform,
  isWebOnlyRole,
} from "../src/utils/client-platform.js";
import { AppError } from "../src/utils/AppError.js";

/**
 * The platform owner is web-only.
 *
 * The rule used to live on POST /api/auth/mobile-login, which mobile stopped
 * calling when it moved to Supabase — so it silently stopped being enforced.
 * These tests pin it to authentication instead, where every mobile request
 * passes.
 *
 * Note what is deliberately NOT asserted: that this cannot be bypassed. It is a
 * product rule, not a security boundary. An owner who forges the header gains
 * nothing they did not already have, because they already hold the highest
 * privilege in the system. Real boundaries come from the database record.
 */

const mobile = { [CLIENT_PLATFORM_HEADER]: "mobile" };
const web = { [CLIENT_PLATFORM_HEADER]: "web" };

describe("reading the declared platform", () => {
  it("recognises mobile and web", () => {
    expect(declaredPlatform(mobile)).toBe("mobile");
    expect(declaredPlatform(web)).toBe("web");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: "  MOBILE " })).toBe("mobile");
  });

  it("treats an absent header as unknown", () => {
    expect(declaredPlatform({})).toBe("unknown");
  });

  it("treats an unrecognised value as unknown rather than guessing", () => {
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: "tablet" })).toBe("unknown");
  });

  it("takes the first value when a header is repeated", () => {
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: ["mobile", "web"] })).toBe("mobile");
  });
});

describe("which roles are web-only", () => {
  it("is the platform owner, and only the platform owner", () => {
    expect(isWebOnlyRole("SYSTEM_OWNER")).toBe(true);
    for (const role of ["UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN", "INSTRUCTOR", "STUDENT"] as const) {
      expect(isWebOnlyRole(role)).toBe(false);
    }
  });
});

describe("refusing a web-only role on mobile", () => {
  it("refuses the owner when the client declares mobile", () => {
    expect(() => assertClientAllowed("SYSTEM_OWNER", mobile)).toThrow(AppError);
  });

  it("refuses with 403 and a code the client can branch on", () => {
    try {
      assertClientAllowed("SYSTEM_OWNER", mobile);
      expect.unreachable("should have thrown");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.statusCode).toBe(403);
      expect(appError.code).toBe("WEB_ONLY_ACCOUNT");
      expect(appError.message).toBe(WEB_ONLY_MESSAGE);
    }
  });

  it("allows the owner on web", () => {
    expect(() => assertClientAllowed("SYSTEM_OWNER", web)).not.toThrow();
  });

  it("allows the owner when no platform is declared", () => {
    // An absent header must not lock out curl, tests, or an older client.
    expect(() => assertClientAllowed("SYSTEM_OWNER", {})).not.toThrow();
  });

  it("allows every other role on mobile", () => {
    for (const role of ["UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN", "INSTRUCTOR", "STUDENT"] as const) {
      expect(() => assertClientAllowed(role, mobile)).not.toThrow();
    }
  });
});
