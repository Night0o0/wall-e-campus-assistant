import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createPlanSchema, updatePlanSchema } from "../types/billing.types.js";
import {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
} from "../controllers/plan.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/", listPlans);
router.get("/:id", getPlan);
router.post("/", validate(createPlanSchema), createPlan);
router.patch("/:id", validate(updatePlanSchema), updatePlan);
router.delete("/:id", deletePlan);

export default router;
