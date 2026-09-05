import { Router } from "express";

import { healthCheck, readinessCheck } from "../controllers/health.controller.js";

const router = Router();

router.get("/", healthCheck);
router.get("/ready", readinessCheck);

export default router;
