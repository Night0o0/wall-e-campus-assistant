/**
 * Error carrying an HTTP status code, so the error middleware can respond
 * accurately instead of turning every failure into a 500.
 *
 * `code` is an optional stable machine-readable identifier. It exists because a
 * client cannot branch on an HTTP status alone — the scan flow answers 409 for
 * four genuinely different situations — and must never branch on a message,
 * which is prose that will be reworded and eventually translated. The status
 * says how the request failed in HTTP terms, the code says what happened in
 * domain terms, and the message is for a human reading a log.
 *
 * Optional rather than required so that adding it changed no existing thrower.
 * A response simply carries no `code` where none was set.
 */
export class AppError extends Error {
  statusCode: number;
  details?: unknown;
  code?: string;

  constructor(
    message: string,
    statusCode = 400,
    details?: unknown,
    code?: string
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
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

/**
 * 429, for a throttle the application itself enforces.
 *
 * Distinct from the express-rate-limit responses, which are transport-level and
 * counted per IP or per principal. This one is a domain rule — "one code per
 * minute to one address" — so it belongs with the logic that knows what a code
 * is, and it carries `retryAfterSeconds` because a client that is told to wait
 * should be told how long.
 */
export const tooManyRequests = (
  message: string,
  retryAfterSeconds?: number,
  code?: string
) =>
  new AppError(
    message,
    429,
    retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
    code
  );
