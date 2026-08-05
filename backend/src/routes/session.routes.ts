import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createSessionSchema } from "../types/session.types.js";
import { createSession, getMySessions, getSession, closeSession, getQrToken } from "../controllers/session.controller.js";

const router = Router();

router.use(authenticate);

router.post("/", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), validate(createSessionSchema), createSession);
router.get("/", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getMySessions);
router.get("/:id", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), getSession);
router.get("/:id/qr", getQrToken);
router.patch("/:id/close", requireRole('ADMIN', 'UNIVERSITY_SUPER_ADMIN', 'SYSTEM_OWNER'), closeSession);

export default router;
