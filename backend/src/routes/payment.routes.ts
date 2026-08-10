import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentQuerySchema,
} from "../types/billing.types.js";
import {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  refundPayment,
} from "../controllers/payment.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/", validateQuery(paymentQuerySchema), listPayments);
router.get("/:id", getPayment);
router.post("/", validate(createPaymentSchema), createPayment);
router.patch("/:id", validate(updatePaymentSchema), updatePayment);
router.patch("/:id/refund", refundPayment);

export default router;
