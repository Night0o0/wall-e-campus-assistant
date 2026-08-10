import { z } from "zod";
import { paginationSchema } from "../utils/pagination.js";

const money = z.coerce.number().min(0, "Amount cannot be negative").max(9_999_999);

/* ----------------------------- Subscription plans ----------------------------- */

export const createPlanSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional().or(z.literal("")),
  monthlyPrice: money,
  yearlyPrice: money,
  maxUsers: z.coerce.number().int().min(1),
  maxRobots: z.coerce.number().int().min(0),
  maxCourses: z.coerce.number().int().min(1),
  features: z.array(z.string().max(120)).max(30).optional(),
  isActive: z.boolean().default(true),
});

export const updatePlanSchema = createPlanSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" }
);

/* ------------------------------- Subscriptions ------------------------------- */

export const createSubscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  status: z
    .enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"])
    .default("TRIAL"),
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
});

export const updateSubscriptionSchema = z
  .object({
    planId: z.string().uuid().optional(),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]).optional(),
    status: z
      .enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"])
      .optional(),
    currentPeriodEnd: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const subscriptionQuerySchema = paginationSchema.extend({
  status: z
    .enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"])
    .optional(),
  planId: z.string().uuid().optional(),
});

/* ---------------------------------- Invoices ---------------------------------- */

export const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  amount: money,
  tax: money.default(0),
  currency: z.string().length(3).default("USD"),
  status: z
    .enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"])
    .default("DRAFT"),
  dueDate: z.coerce.date(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const updateInvoiceSchema = z
  .object({
    amount: money.optional(),
    tax: money.optional(),
    status: z
      .enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"])
      .optional(),
    dueDate: z.coerce.date().optional(),
    notes: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const invoiceQuerySchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  organizationId: z.string().uuid().optional(),
});

/* ---------------------------------- Payments ---------------------------------- */

export const createPaymentSchema = z.object({
  organizationId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: money,
  currency: z.string().length(3).default("USD"),
  status: z
    .enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"])
    .default("COMPLETED"),
  paymentMethod: z.string().max(60).optional().or(z.literal("")),
  transactionId: z.string().max(120).optional().or(z.literal("")),
  description: z.string().max(255).optional().or(z.literal("")),
});

export const updatePaymentSchema = z
  .object({
    status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
    paymentMethod: z.string().max(60).optional().or(z.literal("")),
    description: z.string().max(255).optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const paymentQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
  organizationId: z.string().uuid().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
