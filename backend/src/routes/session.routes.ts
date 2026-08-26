import { Router, RequestHandler } from "express";
import { env } from "../config/env.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import { createSessionSchema } from "../types/session.types.js";
import { paginationSchema } from "../utils/pagination.js";
import { createSession, getMySessions, getSession, closeSession, getQrToken } from "../controllers/session.controller.js";

const router = Router();

router.use(authenticate);

const isStaff = requireRole('INSTRUCTOR', 'UNIVERSITY_ADMIN', 'SYSTEM_OWNER');

/**
 * The QR guard, and why it is a flag rather than a plain middleware.
 *
 * This route has been reachable by any authenticated user, students included.
 * A QR token is an ordinary JWT whose payload can be read without any secret,
 * so a student who scans once legitimately learns the session id and can then
 * mint fresh 30-second codes here for as long as the session stays open —
 * which defeats the short expiry that is the only thing standing between this
 * system and unlimited proxy attendance.
 *
 * Staff now own QR projection. The guard is still a flag for rollout safety:
 * set QR_ENDPOINT_STAFF_ONLY=true once the web and mobile staff flows are
 * verified. A flag rather than an edit makes that rollout instant and its
 * rollback instant too, which matters when attendance is happening live.
 */
const qrGuard: RequestHandler[] = env.QR_ENDPOINT_STAFF_ONLY ? [isStaff] : [];

router.post("/", isStaff, validate(createSessionSchema), createSession);
router.get("/", isStaff, validateQuery(paginationSchema), getMySessions);
router.get("/:id", isStaff, getSession);
router.get("/:id/qr", ...qrGuard, getQrToken);
router.patch("/:id/close", isStaff, closeSession);

export default router;
