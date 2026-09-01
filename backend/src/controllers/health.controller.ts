import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serviceUnavailable } from "../utils/AppError.js";

export const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    project: "Leornian Campus Assistant",
    version: "1.0.0",
    timestamp: new Date(),
  });
};

export const readinessCheck = asyncHandler(
  async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw serviceUnavailable("Database is not ready");
    }

    res.status(200).json({
      status: "READY",
      checks: { database: "up" },
      timestamp: new Date(),
    });
  }
);
