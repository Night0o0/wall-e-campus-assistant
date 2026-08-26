import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import prisma from "../lib/prisma.js";
import type { AccountStatus, UserRole } from "@prisma/client";
import { AppError, forbidden, unauthorized } from "../utils/AppError.js";
import {
  looksLikeSupabaseToken,
  verifySupabaseAccessToken,
} from "../lib/supabase-auth.js";

export interface AuthenticatedUser {
  id: string;
  universityId: string;
  fullName: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  isVerified: boolean;
  isActive: boolean;
  organizationId: string;
  departmentId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(unauthorized("No token provided or invalid format"));
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    let userWhere: { id: string } | { authUserId: string };
    const supabaseToken = looksLikeSupabaseToken(token);

    if (supabaseToken) {
      if (env.AUTH_PROVIDER === "legacy") {
        next(unauthorized("This deployment does not accept Supabase sessions"));
        return;
      }

      userWhere = { authUserId: await verifySupabaseAccessToken(token) };
    } else {
      if (env.AUTH_PROVIDER === "supabase") {
        next(unauthorized("Legacy sessions are no longer accepted"));
        return;
      }

      let decoded: { id: string };
      try {
        decoded = jwt.verify(token, env.JWT_SECRET) as { id: string };
      } catch {
        next(unauthorized("Invalid or expired token"));
        return;
      }

      userWhere = { id: decoded.id };
    }

    const user = await prisma.user.findUnique({
      where: userWhere,
      select: {
        id: true,
        universityId: true,
        fullName: true,
        email: true,
        role: true,
        accountStatus: true,
        isVerified: true,
        isActive: true,
        organizationId: true,
        departmentId: true,
      },
    });

    if (!user) {
      next(unauthorized("User not found"));
      return;
    }

    // A deactivated account must stop working immediately, even while its
    // token is still within its validity window.
    if (!user.isActive || user.accountStatus === "DISABLED") {
      next(unauthorized("This account has been deactivated"));
      return;
    }

    if (user.accountStatus === "REJECTED") {
      next(unauthorized("This account registration was rejected"));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }

    next();
  };
};

/** Convenience guard for platform-owner-only routes. */
export const requireOwner = requireRole("SYSTEM_OWNER");

/**
 * The student approval gate: a self-registered student is inert until a member
 * of staff approves them.
 *
 * `isVerified` already defaulted to false and `AuthService.register` never sets
 * it, so every self-registered student was already pending in the database.
 * This guard is what finally makes that column mean something.
 *
 * Note where it is NOT. It is not part of `authenticate`, and not a check in
 * `login`, and that is the whole design. A pending student has to be able to
 * sign in and fill in their academic profile, because that profile — faculty,
 * department, level, section — is precisely what the approving admin reads
 * before deciding. Gating the token itself would leave staff approving a row
 * that carries nothing but a name and an email address, which is not an
 * approval, it is a rubber stamp.
 *
 * So the guard goes on the feature routes a student cannot usefully reach while
 * unapproved — timetable, scanning, attendance history, materials — and never
 * on /api/auth or /api/students/me/profile.
 *
 * Only STUDENT is gated. Staff accounts are created by an administrator who has
 * already made the decision at the moment of creation; there is nobody left to
 * approve them, and a role that cannot be self-registered cannot be pending.
 */
export const requireApproved = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    next(unauthorized());
    return;
  }

  if (
    req.user.role === "STUDENT" &&
    (req.user.accountStatus !== "ACTIVE" || !req.user.isVerified)
  ) {
    next(
      new AppError(
        "Your account is waiting for approval from your university",
        403,
        undefined,
        // The client branches on this to show a "pending approval" screen
        // rather than a generic permission error.
        "ACCOUNT_PENDING_APPROVAL"
      )
    );
    return;
  }

  next();
};
