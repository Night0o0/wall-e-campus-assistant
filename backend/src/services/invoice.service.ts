import prisma from "../lib/prisma.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { CreateInvoiceInput, UpdateInvoiceInput } from "../types/billing.types.js";
import { badRequest, notFound } from "../utils/AppError.js";
import { paginate, PaginationQuery } from "../utils/pagination.js";
import { toNumber } from "../utils/serialize.js";

const invoiceRepo = new InvoiceRepository();

type InvoiceQuery = PaginationQuery & {
  status?: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  organizationId?: string;
};

export class InvoiceService {
  async list(query: InvoiceQuery) {
    const { data, total } = await invoiceRepo.findMany(query);
    return paginate(data, total, query);
  }

  async getById(id: string) {
    const invoice = await invoiceRepo.findById(id);

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    return invoice;
  }

  async create(input: CreateInvoiceInput) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
    });

    if (!organization) {
      throw notFound("Organization not found");
    }

    const invoiceNumber = await invoiceRepo.nextInvoiceNumber();

    return invoiceRepo.create({
      invoiceNumber,
      organization: { connect: { id: input.organizationId } },
      amount: input.amount,
      tax: input.tax,
      total: input.amount + input.tax,
      currency: input.currency,
      status: input.status,
      dueDate: input.dueDate,
      notes: input.notes || null,
      paidAt: input.status === "PAID" ? new Date() : null,
    });
  }

  async update(id: string, input: UpdateInvoiceInput) {
    const invoice = await invoiceRepo.findById(id);

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    const amount = input.amount ?? toNumber(invoice.amount);
    const tax = input.tax ?? toNumber(invoice.tax);

    const data: Record<string, unknown> = {
      ...input,
      notes: input.notes === undefined ? undefined : input.notes || null,
    };

    if (input.amount !== undefined || input.tax !== undefined) {
      data.total = amount + tax;
    }

    if (input.status === "PAID" && invoice.status !== "PAID") {
      data.paidAt = new Date();
    }

    if (input.status && input.status !== "PAID") {
      data.paidAt = null;
    }

    return invoiceRepo.update(id, data);
  }

  /** Marks an invoice paid and records a matching payment in one step. */
  async markPaid(id: string, paymentMethod?: string) {
    const invoice = await invoiceRepo.findById(id);

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (invoice.status === "PAID") {
      throw badRequest("This invoice is already paid");
    }

    if (invoice.status === "CANCELLED") {
      throw badRequest("A cancelled invoice cannot be paid");
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          status: "COMPLETED",
          paymentMethod: paymentMethod || "manual",
          description: `Payment for invoice ${invoice.invoiceNumber}`,
          paidAt: now,
        },
      });

      return tx.invoice.update({
        where: { id },
        data: { status: "PAID", paidAt: now },
        include: {
          organization: { select: { id: true, name: true, code: true } },
          payments: {
            select: { id: true, amount: true, status: true, paidAt: true },
          },
        },
      });
    });
  }

  async remove(id: string) {
    const invoice = await invoiceRepo.findById(id);

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (invoice.payments.length > 0) {
      throw badRequest(
        "This invoice has recorded payments. Cancel it instead of deleting it."
      );
    }

    await invoiceRepo.delete(id);
  }
}
