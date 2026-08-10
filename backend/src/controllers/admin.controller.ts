import { Request, Response } from "express";
import { AdminService } from "../services/admin.service.js";
import { AdminUserQuery } from "../types/admin.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const adminService = new AdminService();

/** GET /api/admin/overview — the signed-in user's own university, in numbers. */
export const getOrganizationOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const overview = await adminService.getOverview(req.user!);
    res.status(200).json(overview);
  }
);

/** GET /api/admin/users — the signed-in user's own university's directory. */
export const getOrganizationUsers = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await adminService.listUsers(
      // Validated and stripped of anything the schema does not declare — an
      // organizationId in the query string does not survive to here.
      req.validatedQuery as AdminUserQuery,
      req.user!
    );

    res.status(200).json(result);
  }
);
