import type { NextFunction, Request, Response } from "express";
import {
  looksLikeSupabaseToken,
  verifySupabaseIdentity,
} from "../lib/supabase-auth.js";
import { unauthorized } from "../utils/AppError.js";

export interface VerifiedIdentity {
  authUserId: string;
  email: string;
  registration?: unknown;
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
    const identity = await verifySupabaseIdentity(token);

    if (!identity.email) {
      next(unauthorized("The authenticated identity has no email address"));
      return;
    }

    req.identity = {
      authUserId: identity.authUserId,
      email: identity.email,
      // Supabase user_metadata is controlled by the user. It carries only the
      // three non-authoritative form fields needed to resume registration on a
      // second device. AuthService validates them and still forces role,
      // account status, email and tenant lookup server-side.
      registration: identity.userMetadata.registration,
    };
    next();
  } catch (error) {
    next(error);
  }
};
