import { Router } from "express";
import {
  authenticate,
  requireApproved,
  requireRole,
} from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import {
  createMaterialSchema,
  materialQuerySchema,
  updateMaterialSchema,
} from "../types/material.types.js";
import {
  createMaterial,
  deactivateMaterial,
  getMaterials,
  getMyMaterials,
  getTeachableAudiences,
  updateMaterial,
} from "../controllers/material.controller.js";

const router = Router();
router.param("id", validateUuidParam("id"));

router.use(authenticate);

/**
 * The student's own material, grouped by subject.
 *
 * Behind `requireApproved`: an unapproved student is not yet a member of a
 * cohort as far as this system is concerned, and course folders are the
 * university's material rather than public reading.
 *
 * Mounted before "/" so the literal path is matched ahead of any parameterised
 * one added later.
 */
router.get("/my", requireRole("STUDENT"), requireApproved, getMyMaterials);

const isStaff = requireRole("INSTRUCTOR", "UNIVERSITY_ADMIN", "SYSTEM_OWNER");

/**
 * The academic audiences the caller may publish to, built from their own
 * teaching assignments. This is what the publish form's dependent dropdowns are
 * populated from, so an instructor is only ever offered a course and audience
 * they teach — and the create endpoint re-checks the same set server-side.
 *
 * Mounted before "/" so the literal path is matched ahead of any parameterised
 * one, exactly like "/my".
 */
router.get("/audiences", isStaff, getTeachableAudiences);

router.get("/", isStaff, validateQuery(materialQuerySchema), getMaterials);

/**
 * Publishing.
 *
 * Open to a plain INSTRUCTOR, because keeping a course's folder current is the
 * instructor's own work — the whole point of the feature is that nobody has to
 * go through the university to update a link. Which audience they may address is
 * the constrained part, and it is constrained inside MaterialService: an
 * instructor may only name a course and audience drawn from their own teaching
 * assignments, and only a super admin may name an academic audience directly.
 */
router.post("/", isStaff, validate(createMaterialSchema), createMaterial);

router.patch("/:id", isStaff, validate(updateMaterialSchema), updateMaterial);

// Soft delete, so a link withdrawn mid-term stops appearing without erasing the
// record that it was published.
router.patch("/:id/deactivate", isStaff, deactivateMaterial);

export default router;
