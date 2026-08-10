import { Router } from "express";
import {
  register,
  login,
  getProfile,
  changePassword,
  updateProfile,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "../types/auth.types.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "../types/user.types.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

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
