import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const response: Record<string, unknown> = {
    message: err.message || "Internal Server Error",
  };

  if (env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  res.status(500).json(response);
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};
