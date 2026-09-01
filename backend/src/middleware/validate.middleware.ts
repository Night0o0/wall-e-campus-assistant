import { Request, Response, NextFunction, type RequestParamHandler } from "express";
import { z, ZodSchema } from "zod";

/** Validates and replaces req.body with the parsed result. */
export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(result.error);
      return;
    }

    req.body = result.data;
    next();
  };
};

/**
 * Validates req.query. Express 5 exposes a getter-only `query`, so the parsed
 * result is stashed on `req.validatedQuery` for handlers to read.
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(result.error);
      return;
    }

    req.validatedQuery = result.data;
    next();
  };
};

/**
 * Validates UUID route parameters before any controller or service sees them.
 *
 * Express router parameters otherwise arrive as arbitrary strings. Passing an
 * invalid value to Prisma produces a database-shaped validation error after
 * authentication and service work has already happened; rejecting it here
 * gives every resource route the same 400/VALIDATION_ERROR contract.
 */
export const validateUuidParam = (name: string): RequestParamHandler => {
  const schema = z.string().uuid(`${name} must be a valid id`);

  return (_req, _res, next, value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      next(result.error);
      return;
    }
    next();
  };
};

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}
