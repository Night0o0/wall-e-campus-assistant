import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler so rejected promises reach the error middleware
 * instead of being swallowed into a generic response inside each controller.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
