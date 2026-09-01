import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import { createSessionSchema } from "../types/session.types.js";
import { paginationSchema } from "../utils/pagination.js";
import { createSession, getMySessions, getSession, closeSession, getQrToken } from "../controllers/session.controller.js";

const router = Router();
router.param("id", validateUuidParam("id"));

router.use(authenticate);

const isStaff = requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER');

router.post("/", isStaff, validate(createSessionSchema), createSession);
router.get("/", isStaff, validateQuery(paginationSchema), getMySessions);
router.get("/:id", isStaff, getSession);
// QR payloads are credentials for recording attendance. Students scan them;
// only authorized staff may mint them. This is deliberately not configurable:
// the retired robot/device flow no longer supplies a legitimate non-staff
// caller, so a rollback flag would only reopen proxy-attendance abuse.
router.get("/:id/qr", isStaff, getQrToken);
router.patch("/:id/close", isStaff, closeSession);

export default router;
