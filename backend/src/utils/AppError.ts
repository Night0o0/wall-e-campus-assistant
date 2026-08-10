/**
 * Error carrying an HTTP status code, so the error middleware can respond
 * accurately instead of turning every failure into a 500.
 */
export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, details);

export const unauthorized = (message = "Unauthorized") =>
  new AppError(message, 401);

export const forbidden = (message = "Forbidden: insufficient permissions") =>
  new AppError(message, 403);

export const notFound = (message = "Resource not found") =>
  new AppError(message, 404);

export const conflict = (message: string) => new AppError(message, 409);
