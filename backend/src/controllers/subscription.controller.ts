import { Request, Response } from "express";
import { SubscriptionService } from "../services/subscription.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import { PaginationQuery } from "../utils/pagination.js";

const subscriptionService = new SubscriptionService();

export const listSubscriptions = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await subscriptionService.list(
      req.validatedQuery as PaginationQuery
    );
    res.status(200).json(serialize(result));
  }
);

export const getSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const subscription = await subscriptionService.getById(
      req.params.id as string
    );
    res.status(200).json(serialize(subscription));
  }
);

export const createSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const subscription = await subscriptionService.create(req.body);
    res.status(201).json(serialize(subscription));
  }
);

export const updateSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const subscription = await subscriptionService.update(
      req.params.id as string,
      req.body
    );
    res.status(200).json(serialize(subscription));
  }
);

export const cancelSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const subscription = await subscriptionService.cancel(
      req.params.id as string
    );
    res.status(200).json(serialize(subscription));
  }
);

export const renewSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const subscription = await subscriptionService.renew(
      req.params.id as string
    );
    res.status(200).json(serialize(subscription));
  }
);
