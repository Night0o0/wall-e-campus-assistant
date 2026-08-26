import type { NextFunction, Request, Response } from "express";
import { decodeJwt } from "jose";
import {
  looksLikeSupabaseToken,
  verifySupabaseAccessToken,
} from "../lib/supabase-auth.js";
import { unauthorized } from "../utils/AppError.js";

export interface VerifiedIdentity {
  authUserId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      identity?: VerifiedIdentity;
    }
  }
}

/**
 * Verifies a Supabase identity before an application User exists. This is used
 * only to complete student registration; normal routes use `authenticate`,
 * which additionally loads account status and authorization scope.
 */
export const authenticateSupabaseIdentity = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!token || !looksLikeSupabaseToken(token)) {
    next(unauthorized("A valid Supabase access token is required"));
    return;
  }

  try {
    const authUserId = await verifySupabaseAccessToken(token);
    const payload = decodeJwt(token);
    const email = typeof payload.email === "string" ? payload.email : null;

    if (!email) {
      next(unauthorized("The authenticated identity has no email address"));
      return;
    }

    req.identity = { authUserId, email: email.trim().toLowerCase() };
    next();
  } catch (error) {
    next(error);
  }
};
