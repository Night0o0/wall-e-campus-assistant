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

// Update a course (Admin who created it)
router.patch("/:id", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), validate(updateCourseSchema), updateCourse);

// Delete a course (Admin who created it)
router.delete("/:id", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), deleteCourse);

export default router;
