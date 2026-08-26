import type { Request, Response } from "express";
import { AssignmentService } from "../services/assignment.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const assignments = new AssignmentService();

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  res.json({ assignments: await assignments.list(req.user!) });
});

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ assignment: await assignments.create(req.body, req.user!) });
});

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    assignment: await assignments.update(String(req.params.id), req.body, req.user!),
  });
});

export const publishAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.json({ assignment: await assignments.publish(String(req.params.id), req.user!) });
});

export const gradeAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    grade: await assignments.grade(
      String(req.params.id),
      String(req.params.studentId),
      req.body,
      req.user!
    ),
  });
});

export const getAssignmentGradebook = asyncHandler(async (req: Request, res: Response) => {
  res.json(await assignments.gradebook(String(req.params.id), req.user!));
});
