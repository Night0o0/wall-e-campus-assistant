import { Request, Response } from "express";
import { AttendanceService } from "../services/attendance.service.js";
import { MyAttendanceQuery } from "../types/attendance.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const attendanceService = new AttendanceService();

/**
 * POST /api/attendance/scan
 *
 * The student being recorded is `req.user`, taken from the authenticated token.
 * Nothing about their identity, cohort or organization is read from the body —
 * the validated body carries a `token` and nothing else — so there is no
 * parameter through which one student could record another's attendance.
 *
 * The service returns the whole response shape, including its message, because
 * that shape is the contract the Flutter scan page will be written against and
 * it belongs somewhere type-checked. See types/scan.types.ts.
 */
export const scanAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.body;

    const result = await attendanceService.scanAttendance(token, req.user!);

    res.status(201).json(result);
  }
);

// The whole actor, not just the tenant: an INSTRUCTOR is an instructor and reads the
// rosters of the sessions they opened. See utils/session-access.ts.
export const getSessionAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const attendances = await attendanceService.getSessionAttendance(
      req.params.sessionId as string,
      req.user!
    );
    res.status(200).json(attendances);
  }
);

export const getMyAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId } = (req.validatedQuery ?? {}) as MyAttendanceQuery;

    const attendances = await attendanceService.getMyAttendance(req.user!.id, {
      courseId,
    });

    res.status(200).json(attendances);
  }
);

/**
 * GET /api/attendance/summary
 *
 * The per-subject and overall tallies behind the student's achievement pages.
 * The student is the token, so there is no id to pass and none to tamper with.
 */
export const getMyAttendanceSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const summary = await attendanceService.getMyAttendanceSummary(req.user!.id);
    res.status(200).json(summary);
  }
);

export const getSessionStats = asyncHandler(
  async (req: Request, res: Response) => {
    const stats = await attendanceService.getSessionStats(
      req.params.sessionId as string,
      req.user!
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
