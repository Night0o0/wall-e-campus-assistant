import { Request, Response } from "express";
import { PlanService } from "../services/plan.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";

const planService = new PlanService();

export const listPlans = asyncHandler(async (req: Request, res: Response) => {
  const plans = await planService.list(req.query.includeInactive === "true");
  res.status(200).json(serialize(plans));
});

export const getPlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await planService.getById(req.params.id as string);
  res.status(200).json(serialize(plan));
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await planService.create(req.body);
  res.status(201).json(serialize(plan));
});

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await planService.update(req.params.id as string, req.body);
  res.status(200).json(serialize(plan));
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  await planService.remove(req.params.id as string);
  res.status(200).json({ message: "Plan deleted successfully" });
});
