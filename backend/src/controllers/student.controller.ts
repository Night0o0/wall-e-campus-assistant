import { Request, Response } from "express";
import { StudentService } from "../services/student.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const studentService = new StudentService();

export const getMyProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const profile = await studentService.getMyProfile(req.user!.id);
    res.status(200).json({ profile });
  }
);

export const updateMyProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const profile = await studentService.updateMyProfile(
      req.user!.id,
      req.body
    );
    res.status(200).json({ message: "Profile updated", profile });
  }
);
