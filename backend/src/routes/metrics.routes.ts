import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { getOverview } from "../controllers/metrics.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/overview", getOverview);

export default router;
