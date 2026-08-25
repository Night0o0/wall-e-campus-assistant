import { Request, Response } from "express";
import { MaterialService } from "../services/material.service.js";
import { MaterialQuery } from "../types/material.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const materialService = new MaterialService();

/**
 * GET /api/materials/my
 *
 * The student is the token. No cohort, level or section is read from the
 * request, so there is no parameter through which one student could ask for
 * another year's folders.
 */
export const getMyMaterials = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await materialService.listForStudent(req.user!);
    res.status(200).json(result);
  }
);

/** GET /api/materials — the staff-side listing. */
export const getMaterials = asyncHandler(
  async (req: Request, res: Response) => {
    const materials = await materialService.list(
      (req.validatedQuery ?? {}) as MaterialQuery,
      req.user!
    );

    res.status(200).json(materials);
  }
);

/** POST /api/materials */
export const createMaterial = asyncHandler(
  async (req: Request, res: Response) => {
    const material = await materialService.create(req.body, req.user!);
    res.status(201).json(material);
  }
);

/** PATCH /api/materials/:id */
export const updateMaterial = asyncHandler(
  async (req: Request, res: Response) => {
    const material = await materialService.update(
      req.params.id as string,
      req.body,
      req.user!
    );

    res.status(200).json(material);
  }
);

/** PATCH /api/materials/:id/deactivate — soft delete. */
export const deactivateMaterial = asyncHandler(
  async (req: Request, res: Response) => {
    const material = await materialService.deactivate(
      req.params.id as string,
      req.user!
    );

    res.status(200).json(material);
  }
);
