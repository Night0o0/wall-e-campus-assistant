import { Router } from "express";
import {
  createCohort,
  createEnrollment,
  createOffering,
  createTeachingAssignment,
  createTerm,
  getCohort,
  getEnrollment,
  getOffering,
  getTeachingAssignment,
  getTerm,
  listCohorts,
  listEnrollments,
  listOfferings,
  listTeachingAssignments,
  listTerms,
  updateCohort,
  updateEnrollment,
  updateOffering,
  updateTeachingAssignment,
  updateTerm,
} from "../controllers/academic.controller.js";
import { authenticate, requireApproved, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import {
  academicTermQuerySchema,
  cohortQuerySchema,
  createAcademicTermSchema,
  createCohortSchema,
  createEnrollmentSchema,
  createOfferingSchema,
  createTeachingAssignmentSchema,
  enrollmentQuerySchema,
  offeringQuerySchema,
  teachingAssignmentQuerySchema,
  updateAcademicTermSchema,
  updateCohortSchema,
  updateEnrollmentSchema,
  updateOfferingSchema,
  updateTeachingAssignmentSchema,
} from "../types/academic.types.js";

const router = Router();
router.param("id", validateUuidParam("id"));
router.use(authenticate, requireApproved);

const staff = requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN", "INSTRUCTOR");
const managers = requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN");
const universityManagers = requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN");
const offeringReaders = requireRole(
  "SYSTEM_OWNER",
  "UNIVERSITY_ADMIN",
  "DEPARTMENT_ADMIN",
  "INSTRUCTOR",
  "STUDENT"
);

router.get("/terms", offeringReaders, validateQuery(academicTermQuerySchema), listTerms);
router.post("/terms", universityManagers, validate(createAcademicTermSchema), createTerm);
router.get("/terms/:id", offeringReaders, getTerm);
router.patch("/terms/:id", universityManagers, validate(updateAcademicTermSchema), updateTerm);

router.get("/cohorts", staff, validateQuery(cohortQuerySchema), listCohorts);
router.post("/cohorts", managers, validate(createCohortSchema), createCohort);
router.get("/cohorts/:id", staff, getCohort);
router.patch("/cohorts/:id", managers, validate(updateCohortSchema), updateCohort);

router.get("/offerings", offeringReaders, validateQuery(offeringQuerySchema), listOfferings);
router.post("/offerings", managers, validate(createOfferingSchema), createOffering);
router.get("/offerings/:id", offeringReaders, getOffering);
router.patch("/offerings/:id", managers, validate(updateOfferingSchema), updateOffering);

router.get(
  "/teaching-assignments",
  staff,
  validateQuery(teachingAssignmentQuerySchema),
  listTeachingAssignments
);
router.post(
  "/teaching-assignments",
  managers,
  validate(createTeachingAssignmentSchema),
  createTeachingAssignment
);
router.get("/teaching-assignments/:id", staff, getTeachingAssignment);
router.patch(
  "/teaching-assignments/:id",
  managers,
  validate(updateTeachingAssignmentSchema),
  updateTeachingAssignment
);

router.get("/enrollments", offeringReaders, validateQuery(enrollmentQuerySchema), listEnrollments);
router.post("/enrollments", managers, validate(createEnrollmentSchema), createEnrollment);
router.get("/enrollments/:id", offeringReaders, getEnrollment);
router.patch("/enrollments/:id", managers, validate(updateEnrollmentSchema), updateEnrollment);

export default router;
