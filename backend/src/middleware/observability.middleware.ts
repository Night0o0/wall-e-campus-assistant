import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const requestIdHeader = "x-request-id";
const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestObservability = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const supplied = req.header(requestIdHeader);
  const requestId = supplied && validRequestId.test(supplied) ? supplied : randomUUID();
  const startedAt = performance.now();

  req.requestId = requestId;
  res.setHeader(requestIdHeader, requestId);

  res.once("finish", () => {
    logger.info("http.request", {
      requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      principalId: req.user?.id,
      userAgent: req.get("user-agent"),
    });
  });

  next();
};
