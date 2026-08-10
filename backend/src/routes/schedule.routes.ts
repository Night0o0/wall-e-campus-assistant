import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createScheduleSchema,
  scheduleQuerySchema,
  updateScheduleSchema,
} from "../types/schedule.types.js";
import {
  createSchedule,
  deactivateSchedule,
  getSchedule,
  getSchedules,
  updateSchedule,
} from "../controllers/schedule.controller.js";

const router = Router();

router.use(authenticate);

/**
 * Managing the timetable belongs to the university's super admin. SYSTEM_OWNER
 * keeps the access it has on every other admin route, but is still confined to
 * its own organization like everyone else.
 *
 * A plain ADMIN is an instructor here, not a planner: read-only, and only the
 * lectures assigned to them. Every read below is narrowed by role inside
 * ScheduleService.
 */
const canManage = requireRole("UNIVERSITY_SUPER_ADMIN", "SYSTEM_OWNER");

router.post("/", canManage, validate(createScheduleSchema), createSchedule);

// Readable by any authenticated user; the result set depends on the role.
router.get("/", validateQuery(scheduleQuerySchema), getSchedules);
router.get("/:id", getSchedule);

router.patch("/:id", canManage, validate(updateScheduleSchema), updateSchedule);

// Soft delete, so history keeps resolving the lecture it belonged to.
router.patch("/:id/deactivate", canManage, deactivateSchedule);

export default router;
