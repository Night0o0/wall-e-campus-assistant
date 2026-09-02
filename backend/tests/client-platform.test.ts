import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_PLATFORM_HEADER,
  MOBILE_ONLY_MESSAGE,
  WEB_ONLY_MESSAGE,
  assertClientAllowed,
  declaredPlatform,
  isMobileOnlyRole,
  isWebOnlyRole,
  requireMobileClient,
} from "../src/utils/client-platform.js";

const mobile = { [CLIENT_PLATFORM_HEADER]: "mobile" };
const web = { [CLIENT_PLATFORM_HEADER]: "web" };
const staffRoles = [
  "SYSTEM_OWNER",
  "UNIVERSITY_ADMIN",
  "DEPARTMENT_ADMIN",
  "INSTRUCTOR",
] as const;

describe("reading the declared platform", () => {
  it("recognises mobile and web", () => {
    expect(declaredPlatform(mobile)).toBe("mobile");
    expect(declaredPlatform(web)).toBe("web");
  });

  it("normalises values and leaves absent or unrecognised values unknown", () => {
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: "  MOBILE " })).toBe("mobile");
    expect(declaredPlatform({})).toBe("unknown");
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: "tablet" })).toBe("unknown");
    expect(declaredPlatform({ [CLIENT_PLATFORM_HEADER]: ["mobile", "web"] })).toBe("mobile");
  });
});

describe("role/platform boundary", () => {
  it("classifies students as mobile-only and every staff role as web-only", () => {
    expect(isMobileOnlyRole("STUDENT")).toBe(true);
    expect(isWebOnlyRole("STUDENT")).toBe(false);
    for (const role of staffRoles) {
      expect(isWebOnlyRole(role)).toBe(true);
      expect(isMobileOnlyRole(role)).toBe(false);
    }
  });

  it.each(staffRoles)("refuses %s on mobile", (role) => {
    expect(() => assertClientAllowed(role, mobile)).toThrow(
      expect.objectContaining({
        statusCode: 403,
        code: "WEB_ONLY_ACCOUNT",
        message: WEB_ONLY_MESSAGE,
      })
    );
  });

  it("refuses students on web", () => {
    expect(() => assertClientAllowed("STUDENT", web)).toThrow(
      expect.objectContaining({
        statusCode: 403,
        code: "MOBILE_ONLY_ACCOUNT",
        message: MOBILE_ONLY_MESSAGE,
      })
    );
  });

  it("allows each role on its intended client and keeps unknown clients compatible", () => {
    expect(() => assertClientAllowed("STUDENT", mobile)).not.toThrow();
    for (const role of staffRoles) {
      expect(() => assertClientAllowed(role, web)).not.toThrow();
    }
    expect(() => assertClientAllowed("STUDENT", {})).not.toThrow();
    expect(() => assertClientAllowed("SYSTEM_OWNER", {})).not.toThrow();
  });
});

describe("student registration client", () => {
  it("accepts mobile registration", () => {
    const next = vi.fn();
    requireMobileClient({ headers: mobile } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([web, {}])("rejects registration outside the mobile client", (headers) => {
    const next = vi.fn();
    requireMobileClient({ headers } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: "MOBILE_REGISTRATION_ONLY",
      })
    );
  });
});
