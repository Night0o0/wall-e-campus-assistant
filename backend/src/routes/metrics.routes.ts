import { Router } from "express";
import { env } from "../config/env.js";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import {
  getOverview,
  getRevenueMetrics,
} from "../controllers/metrics.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/overview", getOverview);

// Revenue is pure billing output — it stays dark with the rest of it.
if (env.BILLING_ENABLED) {
  router.get("/revenue", getRevenueMetrics);
}

export default router;
