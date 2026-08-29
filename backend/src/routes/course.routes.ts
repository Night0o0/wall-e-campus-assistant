import { Router } from "express";
import { authenticate, requireApproved, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import { courseQuerySchema, createCourseSchema, updateCourseSchema } from "../types/course.types.js";
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

// Every course route is academic: pending students may complete their profile,
// but cannot browse the catalogue before approval.
router.use(authenticate, requireApproved);

// Create a new course (Admin only)
router.post("/", requireRole('UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), validate(createCourseSchema), createCourse);

// Scope comes from the authenticated role: enrollment for a student, teaching
// assignment for an instructor, linked department for a department admin.
router.get("/", validateQuery(courseQuerySchema), getOrgCourses);

// Get courses created by the current user (Admin only)
router.get("/my", requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), getMyCourses);

// Get a single course by ID
router.get("/:id", getCourse);

// Get a course with its sessions
router.get(
    "/:id/sessions",
    requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'),
    getCourseWithSessions
);

// Export the course's student roster as .xlsx. Staff only — a student cannot
// download their classmates' details. Which courses a given member of staff may
// export is decided inside StudentExportService, not here: an INSTRUCTOR gets only
// the courses they are assigned to, and every role is confined to its own
// organization.
router.get(
    "/:id/students/export",
    requireRole('DEPARTMENT_ADMIN', 'INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'),
    exportCourseStudents
);

// Department admins are checked against the course's trusted departmentId.
router.patch("/:id", requireRole('DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), validate(updateCourseSchema), updateCourse);

// Delete follows the same trusted department/tenant policy as update.
router.delete("/:id", requireRole('DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER'), deleteCourse);

export default router;
