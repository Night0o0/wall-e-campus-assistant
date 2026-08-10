import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createUserSchema,
  updateUserSchema,
  userQuerySchema,
  resetUserPasswordSchema,
} from "../types/user.types.js";
import {
  listUsers,
  getUserStats,
  getUser,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} from "../controllers/user.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/", validateQuery(userQuerySchema), listUsers);
router.get("/stats", getUserStats);
router.get("/:id", getUser);
router.post("/", validate(createUserSchema), createUser);
router.patch("/:id", validate(updateUserSchema), updateUser);
router.patch(
  "/:id/password",
  validate(resetUserPasswordSchema),
  resetUserPassword
);
router.delete("/:id", deleteUser);

export default router;
