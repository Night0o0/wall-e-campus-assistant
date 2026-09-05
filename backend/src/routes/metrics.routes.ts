import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { getOverview } from "../controllers/metrics.controller.js";
import { validateQuery } from "../middleware/validate.middleware.js";
import { metricsQuerySchema } from "../types/metrics.types.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/overview", validateQuery(metricsQuerySchema), getOverview);

export default router;
