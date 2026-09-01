import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError.js";

interface ErrorResponse {
  message: string;
  /** Stable machine-readable identifier. Absent when the thrower set none. */
  code?: string;
  errors?: unknown;
}

const statusCodeName = (status: number) =>
  ({
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
  })[status] ?? "INTERNAL_SERVER_ERROR";

export const resolveError = (err: unknown): { status: number; body: ErrorResponse } => {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: {
        message: err.message,
        code: err.code ?? statusCodeName(err.statusCode),
        errors: err.details,
      },
    };
  }

  if (
    err instanceof SyntaxError &&
    "status" in err &&
    err.status === 400 &&
    "type" in err &&
    err.type === "entity.parse.failed"
  ) {
    return {
      status: 400,
      body: { message: "Request body contains invalid JSON", code: "INVALID_JSON" },
    };
  }

  if (
    err instanceof Error &&
    "type" in err &&
    err.type === "entity.too.large"
  ) {
    return {
      status: 413,
      body: { message: "Request body is too large", code: "PAYLOAD_TOO_LARGE" },
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

  return {
    status: 500,
    body: { message: "Internal Server Error", code: "INTERNAL_SERVER_ERROR" },
  };
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const { status, body } = resolveError(err);

  if (status >= 500) {
    console.error("[error]", err);
  }

  if (body.errors === undefined) {
    delete body.errors;
  }

  if (body.code === undefined) {
    delete body.code;
  }

  res.status(status).json(body);
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: "ROUTE_NOT_FOUND",
  });
};
