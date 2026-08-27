import type { UserRole } from "@prisma/client";
import { AppError } from "./AppError.js";

/**
 * Keeping the platform owner out of the mobile application.
 *
 * WHY THIS MOVED
 *
 * The rule used to live in `AuthService.loginForMobile`, which the Flutter app
 * reached at POST /api/auth/mobile-login. That worked while mobile logged in
 * with a password. It does not survive the Supabase cutover: mobile now signs
 * in against Supabase directly and never calls that endpoint, so the check was
 * simply never reached. (The endpoint itself is now inert anyway — seeded users
 * have no `passwordHash`, so it answers 401 for everyone.)
 *
 * The enforcement therefore has to sit where every mobile request passes, which
 * is authentication, rather than on one login route.
 *
 * WHAT THIS IS, AND IS NOT
 *
 * It is a product rule, not a security boundary, and it is important not to
 * confuse the two. The platform owner already holds the highest privilege in
 * the system; a header is trivially forged, and an owner who forges it gains
 * nothing they did not already have. What this prevents is the owner's console
 * — organization management, platform-wide metrics — being driven from a phone
 * that was never designed or tested for it.
 *
 * Anything that IS a security boundary (tenant isolation, role permissions,
 * approval gates) is derived from the database record, never from a header.
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

/** Roles that exist only in the web console. */
export const isWebOnlyRole = (role: UserRole): boolean => role === "SYSTEM_OWNER";

export const WEB_ONLY_MESSAGE =
  "System owner accounts are available on the web console only";

/**
 * Throws when a web-only role is driving a mobile client.
 *
 * Returns silently in every other case, including `unknown`.
 */
export const assertClientAllowed = (
  role: UserRole,
  headers: Record<string, string | string[] | undefined>
): void => {
  if (declaredPlatform(headers) === "mobile" && isWebOnlyRole(role)) {
    throw new AppError(WEB_ONLY_MESSAGE, 403, undefined, "WEB_ONLY_ACCOUNT");
  }
};
