import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateStudentProfileSchema } from "../types/student.types.js";
import {
  getMyProfile,
  updateMyProfile,
} from "../controllers/student.controller.js";
import { getMySchedule } from "../controllers/schedule.controller.js";

const router = Router();

router.use(authenticate);

// Self-service only: a student reads and edits their own academic profile.
// No approval step in this version.
router.get("/me/profile", requireRole("STUDENT"), getMyProfile);
router.patch(
  "/me/profile",
  requireRole("STUDENT"),
  validate(updateStudentProfileSchema),
  updateMyProfile
);

// The student's weekly timetable, matched from their own stored profile — no
// academic filter is read from the request.
router.get("/me/schedule", requireRole("STUDENT"), getMySchedule);

export default router;
