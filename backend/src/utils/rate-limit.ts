import { Request } from "express";
import jwt from "jsonwebtoken";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limiting keyed by who is calling, not by where they are calling from.
 *
 * Per-IP limiting is the wrong model for a campus product. Every student on the
 * university WiFi leaves through one NAT address, so a single shared bucket has
 * to cover a 200-seat lecture hall scanning attendance at the same minute. The
 * bucket empties, the API starts answering 429, and attendance stops for
 * everybody during the exact minute it matters most.
 *
 * So: if a request carries a token we can verify, it is counted against that
 * principal. Only traffic we cannot attribute falls back to the IP address.
 *
 * The signature is verified rather than merely decoded, and that distinction is
 * the security of this file. A decoded-but-unverified token would let anyone
 * mint unlimited buckets by sending random ids, which is not a weaker limiter
 * but no limiter at all. Verification is a synchronous HMAC over a short string
 * and touches no database, so it costs nothing worth measuring.
 */

const WINDOW_MS = 15 * 60 * 1000;

/** The bearer token on a request, if it is shaped like one. */
const bearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
};

/**
 * The principal a request should be counted against.
 *
 * Returns null when the caller cannot be identified — an absent, malformed,
 * expired or forged token all land here, and all fall back to the IP bucket.
 */
export const principalKey = (req: Request): string | null => {
  // Populated when this runs after an auth middleware. Cheaper and more
  // authoritative than re-verifying, so it wins when it is available.
  if (req.user) {
    return `user:${req.user.id}`;
  }

  const token = bearerToken(req);

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { id?: string };
    return payload.id ? `user:${payload.id}` : null;
  } catch {
    return null;
  }
};

/**
 * The broad API limiter.
 *
 * Two ceilings rather than one: an identified caller gets a generous per-person
 * allowance, and unattributable traffic keeps the tighter shared-IP allowance it
 * has today. Nothing gets a smaller budget than it had before this change.
 */
export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: (req) =>
    principalKey(req) === null
      ? env.RATE_LIMIT_ANONYMOUS
      : env.RATE_LIMIT_AUTHENTICATED,
  keyGenerator: (req) => principalKey(req) ?? ipKeyGenerator(req.ip ?? ""),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  // Development stays effectively unlimited, as it was before.
  skip: () => !env.isProduction,
});

/**
 * Attendance scanning, per student.
 *
 * This is what per-IP limiting was reaching for and could not express. A single
 * student hammering the endpoint is stopped; the other 199 people in the room
 * are unaffected, because they are not sharing this student's bucket.
 *
 * Mounted after `authenticate`, so `req.user` is always populated here.
 */
export const scanLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.RATE_LIMIT_SCAN,
  keyGenerator: (req) =>
    req.user ? `scan:${req.user.id}` : ipKeyGenerator(req.ip ?? ""),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many scan attempts, please wait a moment and try again",
  },
  skip: () => !env.isProduction,
});

/**
 * The one-time-code endpoints: request a code, spend a code.
 *
 * IP-keyed, because none of these calls carries a token — the caller is, by
 * definition, someone who cannot yet prove who they are.
 *
 * This is the outer of two throttles and the weaker one. It bounds how much
 * traffic one network source can aim at the OTP surface; the limits that
 * actually protect an account — per-address cooldown, per-address hourly
 * ceiling, per-code attempt ceiling — live in EmailChallengeService, where the
 * address is known and cannot be changed by switching IP. A campus NAT shares
 * this bucket, which is why it is set well above what one person needs and why
 * it is not the security boundary.
 */
export const otpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.isProduction ? env.RATE_LIMIT_OTP : 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many attempts, please try again later",
  },
});
