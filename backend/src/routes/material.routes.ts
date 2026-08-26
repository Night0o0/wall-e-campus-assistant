import { Router } from "express";
import {
  authenticate,
  requireApproved,
  requireRole,
} from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
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
  updateMaterial,
} from "../controllers/material.controller.js";

const router = Router();

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

router.get("/", isStaff, validateQuery(materialQuerySchema), getMaterials);

/**
 * Publishing.
 *
 * Open to a plain INSTRUCTOR, because keeping a course's folder current is the
 * instructor's own work — the whole point of the feature is that nobody has to
 * go through the university to update a link. Which cohort they may address is
 * the constrained part, and it is constrained inside MaterialService: an
 * instructor publishes against one of their own lectures, and only a super
 * admin may name an academic address directly.
 */
router.post("/", isStaff, validate(createMaterialSchema), createMaterial);

router.patch("/:id", isStaff, validate(updateMaterialSchema), updateMaterial);

// Soft delete, so a link withdrawn mid-term stops appearing without erasing the
// record that it was published.
router.patch("/:id/deactivate", isStaff, deactivateMaterial);

export default router;
