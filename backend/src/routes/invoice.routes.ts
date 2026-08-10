import { Router } from "express";
import { authenticate, requireOwner } from "../middleware/auth.middleware.js";
import { validate, validateQuery } from "../middleware/validate.middleware.js";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceQuerySchema,
} from "../types/billing.types.js";
import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  deleteInvoice,
} from "../controllers/invoice.controller.js";

const router = Router();

router.use(authenticate, requireOwner);

router.get("/", validateQuery(invoiceQuerySchema), listInvoices);
router.get("/:id", getInvoice);
router.post("/", validate(createInvoiceSchema), createInvoice);
router.patch("/:id", validate(updateInvoiceSchema), updateInvoice);
router.patch("/:id/pay", markInvoicePaid);
router.delete("/:id", deleteInvoice);

export default router;
