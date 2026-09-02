import { Router } from "express";
import {
  register,
  login,
  mobileLogin,
  getProfile,
  changePassword,
  updateProfile,
  startEmailVerification,
  confirmEmailVerification,
  forgotPassword,
  resetPassword,
  completeSupabaseRegistration,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authenticateSupabaseIdentity } from "../middleware/identity.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  mobileLoginSchema,
  startEmailVerificationSchema,
  confirmEmailVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  completeSupabaseRegistrationSchema,
} from "../types/auth.types.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "../types/user.types.js";
import { otpLimiter } from "../utils/rate-limit.js";
import { requireMobileClient } from "../utils/client-platform.js";

const router = Router();

router.post("/register", requireMobileClient, validate(registerSchema), register);
router.post(
  "/register/supabase",
  requireMobileClient,
  authenticateSupabaseIdentity,
  validate(completeSupabaseRegistrationSchema),
  completeSupabaseRegistration
);
router.post("/login", validate(loginSchema), login);
router.post("/mobile-login", validate(mobileLoginSchema), mobileLogin);

/**
 * The unauthenticated one-time-code surface.
 *
 * Every route here is rate limited at the transport as well as per address in
 * EmailChallengeService, and none of them reveals whether an account exists —
 * both properties are the point of the group, so they are mounted together
 * rather than scattered among the authenticated routes below.
 *
 * Registration is deliberately three requests rather than one. The address has
 * to be proven before an account exists, or an abandoned signup leaves a User
 * row holding the unique claim on an email and a university ID that somebody
 * else may legitimately need:
 *
 *   1. POST /verify-email/start    → a code is mailed
 *   2. POST /verify-email/confirm  → the code is spent, a ticket comes back
 *   3. POST /register              → the ticket is presented with the account
 */
router.post(
  "/verify-email/start",
  otpLimiter,
  validate(startEmailVerificationSchema),
  startEmailVerification
);

router.post(
  "/verify-email/confirm",
  otpLimiter,
  validate(confirmEmailVerificationSchema),
  confirmEmailVerification
);

router.post(
  "/forgot-password",
  otpLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);

router.post(
  "/reset-password",
  otpLimiter,
  validate(resetPasswordSchema),
  resetPassword
);

router.get("/profile", authenticate, getProfile);
router.patch(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  updateProfile
);
router.patch(
  "/password",
  authenticate,
  validate(changePasswordSchema),
  changePassword
);

export default router;
