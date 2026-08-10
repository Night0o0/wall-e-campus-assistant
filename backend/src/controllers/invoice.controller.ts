import { Request, Response } from "express";
import { InvoiceService } from "../services/invoice.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import { PaginationQuery } from "../utils/pagination.js";

const invoiceService = new InvoiceService();

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const result = await invoiceService.list(req.validatedQuery as PaginationQuery);
  res.status(200).json(serialize(result));
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.getById(req.params.id as string);
  res.status(200).json(serialize(invoice));
});

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.create(req.body);
  res.status(201).json(serialize(invoice));
});

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.update(req.params.id as string, req.body);
  res.status(200).json(serialize(invoice));
});

export const markInvoicePaid = asyncHandler(
  async (req: Request, res: Response) => {
    const invoice = await invoiceService.markPaid(
      req.params.id as string,
      req.body?.paymentMethod
    );
    res.status(200).json(serialize(invoice));
  }
);

export const deleteInvoice = asyncHandler(async (req: Request, res: Response) => {
  await invoiceService.remove(req.params.id as string);
  res.status(200).json({ message: "Invoice deleted successfully" });
});
