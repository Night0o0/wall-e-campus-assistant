import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "./AppError.js";

/**
 * First-party product boundary: students use mobile; staff and administrators
 * use web. Supabase sign-in happens outside the API, so the rule is repeated in
 * authenticated middleware rather than existing only on legacy login routes.
 *
 * The header identifies a first-party client; it is not device attestation and
 * must never grant authority. Tenant, role, approval and resource permissions
 * continue to come exclusively from the verified database identity.
 */

/** The header a first-party client uses to say what it is. */
export const CLIENT_PLATFORM_HEADER = "x-client-platform";

export type ClientPlatform = "web" | "mobile" | "unknown";

/**
 * What the caller claims to be.
 *
 * Absent means `unknown`, which is treated as permitted: the header is a
 * declaration by first-party clients, and an absent one must not lock out
 * curl, tests, or a client that predates the convention.
 */
export const declaredPlatform = (
  headers: Record<string, string | string[] | undefined>
): ClientPlatform => {
  const raw = headers[CLIENT_PLATFORM_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();

  if (value === "mobile") return "mobile";
  if (value === "web") return "web";
  return "unknown";
};

/** Every staff and administrator role exists only in the web console. */
export const isWebOnlyRole = (role: UserRole): boolean => role !== "STUDENT";

/** Students register and sign in only through the mobile application. */
export const isMobileOnlyRole = (role: UserRole): boolean => role === "STUDENT";

export const WEB_ONLY_MESSAGE =
  "Staff and administrator accounts are available on the web console only";
export const MOBILE_ONLY_MESSAGE =
  "Student accounts are available in the mobile app only";

/**
 * Throws when a role is driving the wrong first-party client.
 *
 * Returns silently in every other case, including `unknown`.
 */
export const assertClientAllowed = (
  role: UserRole,
  headers: Record<string, string | string[] | undefined>
): void => {
  const platform = declaredPlatform(headers);

  if (platform === "mobile" && isWebOnlyRole(role)) {
    throw new AppError(WEB_ONLY_MESSAGE, 403, undefined, "WEB_ONLY_ACCOUNT");
  }

  if (platform === "web" && isMobileOnlyRole(role)) {
    throw new AppError(MOBILE_ONLY_MESSAGE, 403, undefined, "MOBILE_ONLY_ACCOUNT");
  }
};

/** Registration is a student mobile-app operation, including Supabase completion. */
export const requireMobileClient = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (declaredPlatform(req.headers) !== "mobile") {
    next(
      new AppError(
        "Student registration is available in the mobile app only",
        403,
        undefined,
        "MOBILE_REGISTRATION_ONLY"
      )
    );
    return;
  }

  next();
};
