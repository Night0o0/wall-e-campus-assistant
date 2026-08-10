import { Request, Response } from "express";
import { LectureNotificationService } from "../services/lecture-notification.service.js";
import { NotificationDispatcher } from "../services/notification.dispatcher.js";
import { NotificationService } from "../services/notification.service.js";
import {
  GenerateRemindersInput,
  NotificationQuery,
  SimulateReminderInput,
} from "../types/notification.types.js";
import { badRequest, notFound } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const notificationService = new NotificationService();
const lectureNotifications = new LectureNotificationService();
const dispatcher = new NotificationDispatcher();

/* -------------------------------- Inbox ---------------------------------- */

export const getNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await notificationService.list(
      req.validatedQuery as NotificationQuery,
      req.user!
    );

    res.status(200).json(result);
  }
);

export const getUnreadCount = asyncHandler(
  async (req: Request, res: Response) => {
    res.status(200).json(await notificationService.unreadCount(req.user!));
  }
);

export const markNotificationRead = asyncHandler(
  async (req: Request, res: Response) => {
    const notification = await notificationService.markRead(
      req.params.id as string,
      req.user!
    );

    res.status(200).json({ message: "Notification marked as read", notification });
  }
);

export const markAllNotificationsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await notificationService.markAllRead(req.user!);

    res.status(200).json({ message: "All notifications marked as read", ...result });
  }
);

/* ----------------------------- Device tokens ----------------------------- */

export const registerDevice = asyncHandler(
  async (req: Request, res: Response) => {
    const device = await notificationService.registerDevice(req.body, req.user!);

    res.status(201).json({ message: "Device registered", device });
  }
);

export const deactivateDevice = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await notificationService.deactivateDevice(
      req.body.token,
      req.user!
    );

    res.status(200).json({ message: "Device deactivated", ...result });
  }
);

/* ---------------------------- Development only ---------------------------- */
/*
 * Mounted only when env.devToolsEnabled is true, which is never the case in
 * production — see app.ts. Nothing below may be relied on by a client.
 */

/** Runs a normal generation pass immediately instead of waiting for the timer. */
export const generateReminders = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as GenerateRemindersInput;

    const result = await lectureNotifications.generateUpcoming({
      horizonMinutes: body.horizonMinutes,
    });

    res.status(200).json({ message: "Reminder generation complete", ...result });
  }
);

/**
 * Fires a chosen lecture's reminders now. The reminders are the real ones —
 * same recipients, same wording — only brought forward, so a 24-hour rule can
 * be observed without waiting 24 hours.
 */
export const simulateReminders = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as SimulateReminderInput;

    const generated = await lectureNotifications.simulateForSchedule({
      lectureScheduleId: body.lectureScheduleId,
      // The caller's own tenant: a simulation cannot reach another university.
      organizationId: req.user!.organizationId,
      types: body.types,
    });

    if (!generated) {
      throw notFound(
        "No upcoming occurrence found for that lecture in this organization"
      );
    }

    if (generated.drafted === 0) {
      throw badRequest(
        "That lecture resolved no recipients — check the instructor is active and that students match its faculty, department, level, semester and section"
      );
    }

    const delivered = body.deliverNow ? await dispatcher.tick() : null;

    res.status(200).json({
      message: "Reminders simulated",
      simulated: generated,
      delivered,
    });
  }
);

/** Runs one delivery pass. */
export const dispatchNow = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    message: "Dispatch complete",
    ...(await dispatcher.tick()),
  });
});
