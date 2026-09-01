import { Router } from "express";
import {
  createAssignment,
  getManageableOfferings,
  getAssignmentGradebook,
  gradeAssignment,
  listAssignments,
  publishAssignment,
  updateAssignment,
} from "../controllers/assignment.controller.js";
import { authenticate, requireApproved, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  assignmentQuerySchema,
  createAssignmentSchema,
  gradeAssignmentSchema,
  updateAssignmentSchema,
} from "../types/assignment.types.js";

const router = Router();
const staff = requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN", "INSTRUCTOR");

router.use(authenticate);
router.get("/", requireApproved, validateQuery(assignmentQuerySchema), listAssignments);
router.get("/options", staff, getManageableOfferings);
router.post("/", staff, validate(createAssignmentSchema), createAssignment);
router.patch("/:id", staff, validate(updateAssignmentSchema), updateAssignment);
router.post("/:id/publish", staff, publishAssignment);
router.get("/:id/gradebook", staff, getAssignmentGradebook);
router.put("/:id/grades/:studentId", staff, validate(gradeAssignmentSchema), gradeAssignment);

export default router;
