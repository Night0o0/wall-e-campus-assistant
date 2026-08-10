import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import { PaginationQuery } from "../utils/pagination.js";

const paymentService = new PaymentService();

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentService.list(req.validatedQuery as PaginationQuery);
  res.status(200).json(serialize(result));
});

export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.getById(req.params.id as string);
  res.status(200).json(serialize(payment));
});

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.create(req.body);
  res.status(201).json(serialize(payment));
});

export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.update(req.params.id as string, req.body);
  res.status(200).json(serialize(payment));
});

export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.refund(req.params.id as string);
  res.status(200).json(serialize(payment));
});
