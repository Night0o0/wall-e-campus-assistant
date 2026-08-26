import { Request, Response } from "express";
import { MetricsService } from "../services/metrics.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";

const metricsService = new MetricsService();

const parseMonths = (value: unknown) => {
  const months = Number(value);
  if (!Number.isFinite(months)) return 8;
  return Math.min(24, Math.max(3, Math.trunc(months)));
};

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const overview = await metricsService.overview(parseMonths(req.query.months));
  res.status(200).json(serialize(overview));
});
