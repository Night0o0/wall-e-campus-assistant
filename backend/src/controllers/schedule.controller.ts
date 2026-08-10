import { Request, Response } from "express";
import { ScheduleService } from "../services/schedule.service.js";
import { ScheduleQuery } from "../types/schedule.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const scheduleService = new ScheduleService();

export const createSchedule = asyncHandler(
  async (req: Request, res: Response) => {
    const schedule = await scheduleService.createSchedule(req.body, req.user!);
    res.status(201).json({ message: "Schedule created", schedule });
  }
);

export const getSchedules = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await scheduleService.listSchedules(
      req.validatedQuery as ScheduleQuery,
      req.user!
    );
    res.status(200).json(result);
  }
);

export const getSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await scheduleService.getSchedule(
    req.params.id as string,
    req.user!
  );
  res.status(200).json({ schedule });
});

export const updateSchedule = asyncHandler(
  async (req: Request, res: Response) => {
    const schedule = await scheduleService.updateSchedule(
      req.params.id as string,
      req.body,
      req.user!
    );
    res.status(200).json({ message: "Schedule updated", schedule });
  }
);

export const deactivateSchedule = asyncHandler(
  async (req: Request, res: Response) => {
    const schedule = await scheduleService.deactivateSchedule(
      req.params.id as string,
      req.user!
    );
    res.status(200).json({ message: "Schedule deactivated", schedule });
  }
);

/** GET /api/students/me/schedule */
export const getMySchedule = asyncHandler(
  async (req: Request, res: Response) => {
    const timetable = await scheduleService.getStudentTimetable(req.user!);
    res.status(200).json(timetable);
  }
);

/** GET /api/admin/schedule */
export const getMyTeachingSchedule = asyncHandler(
  async (req: Request, res: Response) => {
    const timetable = await scheduleService.getInstructorTimetable(req.user!);
    res.status(200).json(timetable);
  }
);
