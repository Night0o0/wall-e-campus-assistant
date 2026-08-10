import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import prisma from "../lib/prisma.js";
import { forbidden, unauthorized } from "../utils/AppError.js";

export interface AuthenticatedUser {
  id: string;
  universityId: string;
  fullName: string;
  email: string;
  role: string;
  isVerified: boolean;
  isActive: boolean;
  organizationId: string;
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

  let decoded: { id: string };

  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as { id: string };
  } catch {
    next(unauthorized("Invalid or expired token"));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        universityId: true,
        fullName: true,
        email: true,
        role: true,
        isVerified: true,
        isActive: true,
        organizationId: true,
      },
    });

    if (!user) {
      next(unauthorized("User not found"));
      return;
    }

    // A deactivated account must stop working immediately, even while its
    // token is still within its validity window.
    if (!user.isActive) {
      next(unauthorized("This account has been deactivated"));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles: string[]) => {
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
