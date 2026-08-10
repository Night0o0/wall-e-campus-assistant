import prisma from "../lib/prisma.js";
import { PaymentRepository } from "../repositories/payment.repository.js";
import { CreatePaymentInput, UpdatePaymentInput } from "../types/billing.types.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";
import { paginate, PaginationQuery } from "../utils/pagination.js";

const paymentRepo = new PaymentRepository();

type PaymentQuery = PaginationQuery & {
  status?: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  organizationId?: string;
};

export class PaymentService {
  async list(query: PaymentQuery) {
    const { data, total } = await paymentRepo.findMany(query);
    return paginate(data, total, query);
  }

  async getById(id: string) {
    const payment = await paymentRepo.findById(id);

    if (!payment) {
      throw notFound("Payment not found");
    }

    return payment;
  }

  async create(input: CreatePaymentInput) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
    });

    if (!organization) {
      throw notFound("Organization not found");
    }

    if (input.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: input.invoiceId },
      });

      if (!invoice) {
        throw notFound("Invoice not found");
      }

      if (invoice.organizationId !== input.organizationId) {
        throw badRequest(
          "That invoice belongs to a different organization"
        );
      }
    }

    if (input.transactionId) {
      const duplicate = await prisma.payment.findUnique({
        where: { transactionId: input.transactionId },
      });

      if (duplicate) {
        throw conflict("A payment with this transaction ID already exists");
      }
    }

    return paymentRepo.create({
      organization: { connect: { id: input.organizationId } },
      invoice: input.invoiceId ? { connect: { id: input.invoiceId } } : undefined,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      paymentMethod: input.paymentMethod || null,
      transactionId: input.transactionId || null,
      description: input.description || null,
      paidAt: input.status === "COMPLETED" ? new Date() : null,
    });
  }

  async update(id: string, input: UpdatePaymentInput) {
    const payment = await paymentRepo.findById(id);

    if (!payment) {
      throw notFound("Payment not found");
    }

    const data: Record<string, unknown> = {
      ...input,
      paymentMethod:
        input.paymentMethod === undefined
          ? undefined
          : input.paymentMethod || null,
      description:
        input.description === undefined ? undefined : input.description || null,
    };

    if (input.status === "COMPLETED" && payment.status !== "COMPLETED") {
      data.paidAt = new Date();
    }

    if (input.status && input.status !== "COMPLETED") {
      data.paidAt = null;
    }

    return paymentRepo.update(id, data);
  }

  async refund(id: string) {
    const payment = await paymentRepo.findById(id);

    if (!payment) {
      throw notFound("Payment not found");
    }

    if (payment.status !== "COMPLETED") {
      throw badRequest("Only completed payments can be refunded");
    }

    // Refunding the payment reopens the invoice it settled.
    return prisma.$transaction(async (tx) => {
      if (payment.invoiceId) {
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: "SENT", paidAt: null },
        });
      }

      return tx.payment.update({
        where: { id },
        data: { status: "REFUNDED" },
        include: {
          organization: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
      });
    });
  }
}
