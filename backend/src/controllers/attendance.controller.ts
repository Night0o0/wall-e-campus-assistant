import { Request, Response } from "express";
import { AttendanceService } from "../services/attendance.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const attendanceService = new AttendanceService();

export const scanAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.body;
    const attendance = await attendanceService.scanAttendance(
      token,
      req.user!.id,
      req.user!.organizationId
    );

    res.status(201).json({
      message: "Attendance recorded successfully",
      attendance,
    });
  }
);

export const getSessionAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const attendances = await attendanceService.getSessionAttendance(
      req.params.sessionId as string,
      req.user!.organizationId
    );
    res.status(200).json(attendances);
  }
);

export const getMyAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const attendances = await attendanceService.getMyAttendance(req.user!.id);
    res.status(200).json(attendances);
  }
);

export const getSessionStats = asyncHandler(
  async (req: Request, res: Response) => {
    const stats = await attendanceService.getSessionStats(
      req.params.sessionId as string,
      req.user!.organizationId
    );
    res.status(200).json(stats);
  }
);

export const getAdminAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const analytics = await attendanceService.getAdminAnalytics(
      req.user!.id,
      req.user!.organizationId
    );
    res.status(200).json(analytics);
  }
);
