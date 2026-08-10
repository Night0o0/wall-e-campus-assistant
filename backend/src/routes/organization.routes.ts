import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  organizationQuerySchema,
} from "../types/organization.types.js";
import {
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "../controllers/organization.controller.js";

const router = Router();

// Platform-owner surface: every route here spans all tenants.
router.use(authenticate, requireOwner);

router.get("/", validateQuery(organizationQuerySchema), listOrganizations);
router.get("/:id", getOrganization);
router.post("/", validate(createOrganizationSchema), createOrganization);
router.patch("/:id", validate(updateOrganizationSchema), updateOrganization);
router.delete("/:id", deleteOrganization);

export default router;
