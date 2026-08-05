import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { scanAttendanceSchema } from "../types/attendance.types.js";
import { scanAttendance, getSessionAttendance, getMyAttendance, getSessionStats, getAdminAnalytics } from "../controllers/attendance.controller.js";

const router = Router();

router.use(authenticate);

router.post("/scan", requireRole('STUDENT'), validate(scanAttendanceSchema), scanAttendance);
router.get("/history", requireRole('STUDENT'), getMyAttendance);
router.get("/session/:sessionId", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getSessionAttendance);
router.get("/session/:sessionId/stats", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getSessionStats);
router.get("/analytics", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getAdminAnalytics);

export default router;
