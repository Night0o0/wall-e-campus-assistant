import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  adminUserQuerySchema,
  createCampusUserSchema,
  pendingStudentQuerySchema,
  resetCampusPasswordSchema,
  updateCampusUserSchema,
} from "../types/admin.types.js";
import { getMyTeachingSchedule } from "../controllers/schedule.controller.js";
import {
  approveStudent,
  createOrganizationUser,
  getOrganizationOverview,
  getOrganizationUser,
  getOrganizationUsers,
  getPendingStudents,
  rejectStudent,
  resetOrganizationUserPassword,
  updateOrganizationUser,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(authenticate);

// Self-service teaching timetable for the signed-in instructor. An INSTRUCTOR sees
// only the lectures assigned to them; a super admin uses /api/schedules for
// the university-wide view.
router.get("/schedule", requireRole("INSTRUCTOR"), getMyTeachingSchedule);

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
const canAdminister = requireRole("UNIVERSITY_ADMIN", "SYSTEM_OWNER");

router.get("/overview", canAdminister, getOrganizationOverview);

router.get(
  "/users",
  canAdminister,
  validateQuery(adminUserQuerySchema),
  getOrganizationUsers
);

router.get("/users/:id", canAdminister, getOrganizationUser);

/**
 * Creating and editing campus accounts.
 *
 * Super admin only, even though the approval queue below admits a plain INSTRUCTOR.
 * Approving a student who registered themselves is a decision about somebody
 * who already turned up; minting an account from nothing is a decision about
 * who gets to exist, and an instructor has no business making it.
 *
 * The role a created account may hold is constrained by createCampusUserSchema
 * to INSTRUCTOR or STUDENT — a university cannot promote itself, and the platform
 * role is unreachable from here entirely.
 */
router.post(
  "/users",
  canAdminister,
  validate(createCampusUserSchema),
  createOrganizationUser
);

router.patch(
  "/users/:id",
  canAdminister,
  validate(updateCampusUserSchema),
  updateOrganizationUser
);

router.patch(
  "/users/:id/password",
  canAdminister,
  validate(resetCampusPasswordSchema),
  resetOrganizationUserPassword
);

/**
 * The student approval queue.
 *
 * A student registers themselves and lands here, inert, until a member of
 * teaching staff lets them in — see requireApproved in auth.middleware.ts for
 * what "inert" means and why it stops short of blocking login.
 *
 * Deliberately open to a plain INSTRUCTOR, unlike everything above it. Vetting a
 * first-year who has just signed up is routine departmental work, and routing
 * every registration through one super admin would make that person the
 * bottleneck for the entire university at the start of every term.
 */
const canApprove = requireRole(
  "INSTRUCTOR",
  "DEPARTMENT_ADMIN",
  "UNIVERSITY_ADMIN",
  "SYSTEM_OWNER"
);

router.get(
  "/students/pending",
  canApprove,
  validateQuery(pendingStudentQuerySchema),
  getPendingStudents
);

router.patch("/students/:id/approve", canApprove, approveStudent);

// Deactivates rather than deletes: the university ID stays claimed, so a
// rejected registration cannot be replayed by somebody else.
router.patch("/students/:id/reject", canApprove, rejectStudent);

export default router;
