import { Router } from "express";
import {
  createDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from "../controllers/department.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { validate, validateQuery, validateUuidParam } from "../middleware/validate.middleware.js";
import {
  createDepartmentSchema,
  departmentQuerySchema,
  updateDepartmentSchema,
} from "../types/department.types.js";

const router = Router();
router.param("id", validateUuidParam("id"));
router.use(authenticate);

router.get(
  "/",
  requireRole(
    "SYSTEM_OWNER",
    "UNIVERSITY_ADMIN",
    "DEPARTMENT_ADMIN",
    "INSTRUCTOR"
  ),
  validateQuery(departmentQuerySchema),
  listDepartments
);
router.get(
  "/:id",
  requireRole(
    "SYSTEM_OWNER",
    "UNIVERSITY_ADMIN",
    "DEPARTMENT_ADMIN",
    "INSTRUCTOR"
  ),
  getDepartment
);
router.post(
  "/",
  requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN"),
  validate(createDepartmentSchema),
  createDepartment
);
router.patch(
  "/:id",
  requireRole("SYSTEM_OWNER", "UNIVERSITY_ADMIN"),
  validate(updateDepartmentSchema),
  updateDepartment
);

export default router;
