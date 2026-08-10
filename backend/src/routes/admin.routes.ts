import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validate.middleware.js";
import { adminUserQuerySchema } from "../types/admin.types.js";
import { getMyTeachingSchedule } from "../controllers/schedule.controller.js";
import {
  getOrganizationOverview,
  getOrganizationUsers,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(authenticate);

// Self-service teaching timetable for the signed-in instructor. An ADMIN sees
// only the lectures assigned to them; a super admin uses /api/schedules for
// the university-wide view.
router.get("/schedule", requireRole("ADMIN"), getMyTeachingSchedule);

/**
 * The university administration console.
 *
 * These are the organization-scoped counterparts of two platform-owner routes,
 * and they exist separately on purpose. /api/metrics/overview aggregates across
 * every university on the platform, and /api/users takes its organization from
 * a client-supplied query parameter — safe only because SYSTEM_OWNER is the
 * only role that can reach it. Neither could be opened to a university super
 * admin without leaking another university's data, so the tenant here is taken
 * from the authenticated user and never from the request. See AdminService.
 */
const canAdminister = requireRole("UNIVERSITY_SUPER_ADMIN", "SYSTEM_OWNER");

router.get("/overview", canAdminister, getOrganizationOverview);

router.get(
  "/users",
  canAdminister,
  validateQuery(adminUserQuerySchema),
  getOrganizationUsers
);

export default router;
