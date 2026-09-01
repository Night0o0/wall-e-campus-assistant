import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

interface ErrorResponse {
  message: string;
  /** Stable machine-readable identifier. Absent when the thrower set none. */
  code?: string;
  errors?: unknown;
  stack?: string;
}

const resolve = (err: unknown): { status: number; body: ErrorResponse } => {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { message: err.message, code: err.code, errors: err.details },
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        errors: err.issues,
      },
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 unique constraint, P2025 record not found, P2003 FK violation
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ");
      return {
        status: 409,
        body: {
          code: "UNIQUE_CONSTRAINT_VIOLATION",
          message: target
            ? `A record with this ${target} already exists`
            : "A record with these values already exists",
        },
      };
    }

    if (err.code === "P2025") {
      return {
        status: 404,
        body: { message: "Record not found", code: "RECORD_NOT_FOUND" },
      };
    }

    if (err.code === "P2003") {
      return {
        status: 409,
        body: {
          code: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
          message: "This record is still referenced by other records",
        },
      };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      body: {
        message: "Invalid query parameters",
        code: "INVALID_QUERY_PARAMETERS",
      },
    };
  }

  const message =
    err instanceof Error ? err.message : "Internal Server Error";

  return { status: 500, body: { message } };
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const { status, body } = resolve(err);

  if (status >= 500) {
    console.error("[error]", err);
  }

  if (body.errors === undefined) {
    delete body.errors;
  }

  if (body.code === undefined) {
    delete body.code;
  }

  if (!env.isProduction && err instanceof Error) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: "ROUTE_NOT_FOUND",
  });
};
