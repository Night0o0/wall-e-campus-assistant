import { Request, Response } from "express";
import { AttendanceLifecycleService } from "../services/attendance-lifecycle.service.js";
import { ScheduleService } from "../services/schedule.service.js";
import { ScheduleAttendanceLogQuery, ScheduleQuery } from "../types/schedule.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const scheduleService = new ScheduleService();
const lifecycleService = new AttendanceLifecycleService();

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

/**
 * GET /api/schedules/:id/attendance-log
 *
 * The only endpoint that can report NOT_RECORDED, because it is the only one
 * that reads from the timetable rather than from the session table — an
 * occurrence nobody opened attendance for leaves no row to find.
 */
export const getScheduleAttendanceLog = asyncHandler(
  async (req: Request, res: Response) => {
    const { weeks } = req.validatedQuery as ScheduleAttendanceLogQuery;

    const log = await lifecycleService.occurrenceStates(
      req.params.id as string,
      req.user!,
      { weeks }
    );

    res.status(200).json(log);
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
