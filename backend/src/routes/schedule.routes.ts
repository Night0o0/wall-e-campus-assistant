import { Router } from "express";
import { authenticate, requireApproved, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import {
  createScheduleSchema,
  scheduleAttendanceLogQuerySchema,
  scheduleQuerySchema,
  updateScheduleSchema,
} from "../types/schedule.types.js";
import {
  createSchedule,
  deactivateSchedule,
  getSchedule,
  getScheduleAttendanceLog,
  getSchedules,
  updateSchedule,
} from "../controllers/schedule.controller.js";

const router = Router();
router.param("id", validateUuidParam("id"));

router.use(authenticate, requireApproved);

/**
 * Managing the timetable belongs to the university's super admin. SYSTEM_OWNER
 * keeps the access it has on every other admin route, but is still confined to
 * its own organization like everyone else.
 *
 * A plain INSTRUCTOR is an instructor here, not a planner: read-only, and only the
 * lectures assigned to them. Every read below is narrowed by role inside
 * ScheduleService.
 */
const canManage = requireRole("UNIVERSITY_ADMIN", "SYSTEM_OWNER");

router.post("/", canManage, validate(createScheduleSchema), createSchedule);

// Readable by any authenticated user; the result set depends on the role.
router.get("/", validateQuery(scheduleQuerySchema), getSchedules);
router.get("/:id", getSchedule);

/**
 * What happened to each of this lecture's recent occurrences: NOT_RECORDED,
 * OPEN, PENDING or RECORDED.
 *
 * Teaching staff, not students. Which lectures nobody bothered to take
 * attendance for is a question about the institution's own record-keeping, and
 * the answer names the instructor responsible. An INSTRUCTOR sees only their own
 * lectures; the narrowing happens inside the service.
 */
router.get(
  "/:id/attendance-log",
  requireRole("INSTRUCTOR", "UNIVERSITY_ADMIN", "SYSTEM_OWNER"),
  validateQuery(scheduleAttendanceLogQuerySchema),
  getScheduleAttendanceLog
);

router.patch("/:id", canManage, validate(updateScheduleSchema), updateSchedule);

// Soft delete, so history keeps resolving the lecture it belonged to.
router.patch("/:id/deactivate", canManage, deactivateSchedule);

export default router;
