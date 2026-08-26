import type { Request, Response } from "express";
import { DepartmentService } from "../services/department.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const service = new DepartmentService();

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.list(req.query as never, req.user!));
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.get(String(req.params.id), req.user!) });
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.create(req.body, req.user!) });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    data: await service.update(String(req.params.id), req.body, req.user!),
  });
});
