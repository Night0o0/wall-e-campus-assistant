import prisma from "../lib/prisma.js";
import { SubscriptionRepository } from "../repositories/subscription.repository.js";
import {
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
} from "../types/billing.types.js";
import { conflict, notFound } from "../utils/AppError.js";
import { paginate, PaginationQuery } from "../utils/pagination.js";

const subscriptionRepo = new SubscriptionRepository();

type SubscriptionQuery = PaginationQuery & {
  status?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  planId?: string;
};

/** Advances a date by one billing period. */
export const addPeriod = (from: Date, cycle: "MONTHLY" | "YEARLY") => {
  const end = new Date(from);

  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  return end;
};

export class SubscriptionService {
  async list(query: SubscriptionQuery) {
    const { data, total } = await subscriptionRepo.findMany(query);
    return paginate(data, total, query);
  }

  async getById(id: string) {
    const subscription = await subscriptionRepo.findById(id);

    if (!subscription) {
      throw notFound("Subscription not found");
    }

    return subscription;
  }

  async create(input: CreateSubscriptionInput) {
    const [organization, plan] = await Promise.all([
      prisma.organization.findUnique({ where: { id: input.organizationId } }),
      prisma.subscriptionPlan.findUnique({ where: { id: input.planId } }),
    ]);

    if (!organization) {
      throw notFound("Organization not found");
    }

    if (!plan) {
      throw notFound("Plan not found");
    }

    if (organization.subscriptionId) {
      throw conflict(
        "This organization already has a subscription. Update the existing one instead."
      );
    }

    const now = new Date();
    const trialEndsAt =
      input.trialDays && input.trialDays > 0
        ? new Date(now.getTime() + input.trialDays * 24 * 60 * 60 * 1000)
        : null;

    // The subscription and the organization link must land together.
    return prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          planId: input.planId,
          status: input.status,
          billingCycle: input.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: addPeriod(now, input.billingCycle),
          trialEndsAt,
        },
      });

      await tx.organization.update({
        where: { id: input.organizationId },
        data: { subscriptionId: subscription.id },
      });

      return tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: {
          plan: true,
          organization: {
            select: { id: true, name: true, code: true, logo: true },
          },
        },
      });
    });
  }

  async update(id: string, input: UpdateSubscriptionInput) {
    const subscription = await subscriptionRepo.findById(id);

    if (!subscription) {
      throw notFound("Subscription not found");
    }

    if (input.planId && input.planId !== subscription.planId) {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });

      if (!plan) {
        throw notFound("Plan not found");
      }
    }

    const data: Record<string, unknown> = { ...input };

    // Cancelling stamps the time; reactivating clears it.
    if (input.status === "CANCELLED" && subscription.status !== "CANCELLED") {
      data.cancelledAt = new Date();
    }

    if (input.status && input.status !== "CANCELLED") {
      data.cancelledAt = null;
    }

    return subscriptionRepo.update(id, data);
  }

  async cancel(id: string) {
    const subscription = await subscriptionRepo.findById(id);

    if (!subscription) {
      throw notFound("Subscription not found");
    }

    if (subscription.status === "CANCELLED") {
      throw conflict("This subscription is already cancelled");
    }

    return subscriptionRepo.update(id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
    });
  }

  /** Starts a fresh billing period from today. */
  async renew(id: string) {
    const subscription = await subscriptionRepo.findById(id);

    if (!subscription) {
      throw notFound("Subscription not found");
    }

    const now = new Date();

    return subscriptionRepo.update(id, {
      status: "ACTIVE",
      cancelledAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: addPeriod(now, subscription.billingCycle),
    });
  }
}
