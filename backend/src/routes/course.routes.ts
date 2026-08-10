import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createCourseSchema, updateCourseSchema } from "../types/course.types.js";
import { 
    createCourse, 
    getMyCourses, 
    getOrgCourses, 
    getCourse, 
    getCourseWithSessions, 
    updateCourse, 
    deleteCourse 
} from "../controllers/course.controller.js";
import { exportCourseStudents } from "../controllers/export.controller.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create a new course (Admin only)
router.post("/", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), validate(createCourseSchema), createCourse);

// Get all courses in the organization (All authenticated users)
router.get("/", getOrgCourses);

// Get courses created by the current user (Admin only)
router.get("/my", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getMyCourses);

// Get a single course by ID
router.get("/:id", getCourse);

// Get a course with its sessions
router.get("/:id/sessions", getCourseWithSessions);

// Export the course's student roster as .xlsx. Staff only — a student cannot
// download their classmates' details. Which courses a given member of staff may
// export is decided inside StudentExportService, not here: an ADMIN gets only
// the courses they are assigned to, and every role is confined to its own
// organization.
router.get(
    "/:id/students/export",
    requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'),
    exportCourseStudents
);

// Update a course (Admin who created it)
router.patch("/:id", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), validate(updateCourseSchema), updateCourse);

// Delete a course (Admin who created it)
router.delete("/:id", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), deleteCourse);

export default router;
