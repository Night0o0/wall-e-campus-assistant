import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

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

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}
