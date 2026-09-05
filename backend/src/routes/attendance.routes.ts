import { Router } from "express";
import {
  authenticate,
  requireApproved,
  requireRole,
} from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import { myAttendanceQuerySchema, scanAttendanceSchema } from "../types/attendance.types.js";
import { scanAttendance, getSessionAttendance, getMyAttendance, getMyAttendanceSummary, getSessionStats, getAdminAnalytics } from "../controllers/attendance.controller.js";
import { scanLimiter } from "../utils/rate-limit.js";

const router = Router();
router.param("sessionId", validateUuidParam("sessionId"));

router.use(authenticate);

// Per-student, not per-address. Mounted after `authenticate`, so the limiter
// counts against the student who is scanning — one person hammering the
// endpoint is stopped without costing the rest of the lecture hall their
// attendance, which is what a shared IP bucket would have done.
//
// `requireApproved` sits before the limiter on the scan route: an unapproved
// account is rejected without consuming anyone's rate-limit budget.
router.post("/scan", requireRole('STUDENT'), requireApproved, scanLimiter, validate(scanAttendanceSchema), scanAttendance);
// The student's own history, optionally narrowed to one subject, and the
// per-subject tallies behind it. Both read the student from the token.
router.get("/history", requireRole('STUDENT'), requireApproved, validateQuery(myAttendanceQuerySchema), getMyAttendance);
router.get("/summary", requireRole('STUDENT'), requireApproved, getMyAttendanceSummary);
router.get("/session/:sessionId", requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), getSessionAttendance);
router.get("/session/:sessionId/stats", requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), getSessionStats);
router.get("/analytics", requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), getAdminAnalytics);

export default router;
