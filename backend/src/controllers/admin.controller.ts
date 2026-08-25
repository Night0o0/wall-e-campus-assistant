import { Request, Response } from "express";
import { AdminService } from "../services/admin.service.js";
import { AdminUserQuery, PendingStudentQuery } from "../types/admin.types.js";
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

/** GET /api/admin/students/pending — students waiting to be let in. */
export const getPendingStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await adminService.listPendingStudents(
      req.validatedQuery as PendingStudentQuery,
      req.user!
    );

    res.status(200).json(result);
  }
);

/** PATCH /api/admin/students/:id/approve */
export const approveStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await adminService.approveStudent(req.params.id as string, req.user!);
    res.status(200).json(result);
  }
);

/** PATCH /api/admin/students/:id/reject */
export const rejectStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await adminService.rejectStudent(req.params.id as string, req.user!);
    res.status(200).json(result);
  }
);

/** GET /api/admin/users/:id */
export const getOrganizationUser = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await adminService.getUser(req.params.id as string, req.user!);
    res.status(200).json(user);
  }
);

/** POST /api/admin/users — create a member of staff or a student. */
export const createOrganizationUser = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await adminService.createUser(req.body, req.user!);
    res.status(201).json(user);
  }
);

/** PATCH /api/admin/users/:id */
export const updateOrganizationUser = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await adminService.updateUser(
      req.params.id as string,
      req.body,
      req.user!
    );

    res.status(200).json(user);
  }
);

/** PATCH /api/admin/users/:id/password */
export const resetOrganizationUserPassword = asyncHandler(
  async (req: Request, res: Response) => {
    await adminService.resetPassword(
      req.params.id as string,
      req.body.newPassword,
      req.user!
    );

    res.status(200).json({ message: "Password updated" });
  }
);
