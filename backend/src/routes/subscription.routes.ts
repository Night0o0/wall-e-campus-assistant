import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  subscriptionQuerySchema,
} from "../types/billing.types.js";
import {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
} from "../controllers/subscription.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/", validateQuery(subscriptionQuerySchema), listSubscriptions);
router.get("/:id", getSubscription);
router.post("/", validate(createSubscriptionSchema), createSubscription);
router.patch("/:id", validate(updateSubscriptionSchema), updateSubscription);
router.patch("/:id/cancel", cancelSubscription);
router.patch("/:id/renew", renewSubscription);

export default router;
