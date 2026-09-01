import { Request, Response } from "express";
import { MetricsService } from "../services/metrics.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import type { MetricsQuery } from "../types/metrics.types.js";

const metricsService = new MetricsService();

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const { months } = req.validatedQuery as MetricsQuery;
  const overview = await metricsService.overview(months);
  res.status(200).json(serialize(overview));
});
