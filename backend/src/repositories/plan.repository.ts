import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";

export class PlanRepository {
  async findMany(includeInactive: boolean) {
    return prisma.subscriptionPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { monthlyPrice: "asc" },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });
  }

  async findById(id: string) {
    return prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });
  }

  async findByName(name: string) {
    return prisma.subscriptionPlan.findUnique({ where: { name } });
  }

  async create(data: Prisma.SubscriptionPlanCreateInput) {
    return prisma.subscriptionPlan.create({ data });
  }

  async update(id: string, data: Prisma.SubscriptionPlanUpdateInput) {
    return prisma.subscriptionPlan.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.subscriptionPlan.delete({ where: { id } });
  }

  /** Active subscriptions grouped by plan, used for the distribution chart. */
  async distribution() {
    const rows = await prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      _count: true,
    });

    return rows;
  }
}
