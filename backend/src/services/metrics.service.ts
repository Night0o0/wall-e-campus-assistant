import prisma from "../lib/prisma.js";
import { PaymentRepository } from "../repositories/payment.repository.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { toNumber } from "../utils/serialize.js";

const paymentRepo = new PaymentRepository();
const invoiceRepo = new InvoiceRepository();

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Month boundaries are computed in UTC because Prisma stores timestamps in UTC
 * and Postgres truncates them in UTC. Using local midnight here would put every
 * bucket boundary a few hours off and shift whole months for UTC+ timezones.
 */
const startOfMonth = (date: Date, offset = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

/** "2026-08" — the key shape returned by the monthly aggregate queries. */
const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** Percentage change, guarding the divide-by-zero case. */
const percentChange = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

/** A subscription's value expressed as monthly recurring revenue. */
const monthlyValue = (subscription: {
  billingCycle: string;
  plan: { monthlyPrice: unknown; yearlyPrice: unknown };
}): number =>
  subscription.billingCycle === "YEARLY"
    ? toNumber(subscription.plan.yearlyPrice as never) / 12
    : toNumber(subscription.plan.monthlyPrice as never);

const round = (value: number) => Number(value.toFixed(2));

export class MetricsService {
  /** Everything the Dashboard page renders. */
  async overview(months = 8) {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(now, -1);
    const seriesStart = startOfMonth(now, -(months - 1));

    const [
      totalOrganizations,
      totalUsers,
      orgsBeforeThisMonth,
      usersBeforeThisMonth,
      activeSubscriptions,
      subsBeforeThisMonth,
      thisMonthRevenue,
      lastMonthRevenue,
      monthlyTotals,
      activeWithPlans,
      recentPayments,
      studentCount,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.organization.count({ where: { createdAt: { lt: thisMonthStart } } }),
      prisma.user.count({ where: { createdAt: { lt: thisMonthStart } } }),
      prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
      prisma.subscription.count({
        where: {
          status: { in: ["ACTIVE", "TRIAL"] },
          createdAt: { lt: thisMonthStart },
        },
      }),
      paymentRepo.sumCompletedBetween(thisMonthStart, startOfMonth(now, 1)),
      paymentRepo.sumCompletedBetween(lastMonthStart, thisMonthStart),
      paymentRepo.monthlyTotals(seriesStart),
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
        include: { plan: true },
      }),
      paymentRepo.recent(5),
      prisma.user.count({ where: { role: "STUDENT" } }),
    ]);

    // New organizations per month, to pair with the revenue series.
    const orgsByMonth = await prisma.$queryRaw<
      Array<{ month: string; count: bigint }>
    >`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*) AS count
      FROM "Organization"
      WHERE "createdAt" >= ${seriesStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const revenueByMonth = new Map(
      monthlyTotals.map((row) => [row.month, Number(row.total ?? 0)])
    );

    const customersByMonth = new Map(
      orgsByMonth.map((row) => [row.month, Number(row.count)])
    );

    // Emit a point for every month in the window, including empty ones, so the
    // chart shows a continuous line instead of collapsing gaps.
    let runningCustomers = await prisma.organization.count({
      where: { createdAt: { lt: seriesStart } },
    });

    const revenueSeries = Array.from({ length: months }, (_, index) => {
      const monthDate = startOfMonth(now, -(months - 1 - index));
      const key = monthKey(monthDate);
      runningCustomers += customersByMonth.get(key) ?? 0;

      return {
        month: MONTH_LABELS[monthDate.getUTCMonth()],
        year: monthDate.getUTCFullYear(),
        revenue: round(revenueByMonth.get(key) ?? 0),
        customers: runningCustomers,
      };
    });

    // Plan distribution across paying and trialling organizations.
    const planCounts = new Map<string, { name: string; count: number }>();

    for (const subscription of activeWithPlans) {
      const entry = planCounts.get(subscription.planId) ?? {
        name: subscription.plan.name,
        count: 0,
      };
      entry.count += 1;
      planCounts.set(subscription.planId, entry);
    }

    const distributionTotal = activeWithPlans.length;

    const planDistribution = Array.from(planCounts.entries())
      .map(([planId, entry]) => ({
        planId,
        name: entry.name,
        value: entry.count,
        percentage:
          distributionTotal === 0
            ? 0
            : Number(((entry.count / distributionTotal) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.value - a.value);

    // Top organizations by user count, with lifetime collected revenue.
    const topOrgs = await prisma.organization.findMany({
      take: 5,
      orderBy: { users: { _count: "desc" } },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { users: true, courses: true } },
      },
    });

    const revenueRows = await prisma.payment.groupBy({
      by: ["organizationId"],
      where: {
        status: "COMPLETED",
        organizationId: { in: topOrgs.map((org) => org.id) },
      },
      _sum: { amount: true },
    });

    const revenueByOrg = new Map(
      revenueRows.map((row) => [row.organizationId, Number(row._sum.amount ?? 0)])
    );

    return {
      totals: {
        organizations: totalOrganizations,
        users: totalUsers,
        students: studentCount,
        activeSubscriptions,
      },
      monthlyRevenue: {
        current: round(thisMonthRevenue.total),
        previous: round(lastMonthRevenue.total),
        changePercent: percentChange(
          thisMonthRevenue.total,
          lastMonthRevenue.total
        ),
      },
      changes: {
        organizations: percentChange(totalOrganizations, orgsBeforeThisMonth),
        users: percentChange(totalUsers, usersBeforeThisMonth),
        subscriptions: percentChange(activeSubscriptions, subsBeforeThisMonth),
      },
      revenueSeries,
      planDistribution,
      recentTransactions: recentPayments.map((payment) => ({
        id: payment.id,
        organization: payment.organization.name,
        organizationId: payment.organizationId,
        amount: toNumber(payment.amount),
        currency: payment.currency,
        status: payment.status,
        date: payment.paidAt ?? payment.createdAt,
      })),
      topOrganizations: topOrgs.map((org) => ({
        id: org.id,
        name: org.name,
        code: org.code,
        users: org._count.users,
        courses: org._count.courses,
        revenue: round(revenueByOrg.get(org.id) ?? 0),
      })),
    };
  }

  /** Everything the Revenue page renders. */
  async revenue(months = 8) {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const seriesStart = startOfMonth(now, -(months - 1));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      billingSubscriptions,
      newThisMonth,
      churnedThisMonth,
      churnedLast30,
      monthlyTotals,
      overdue,
      totalPaid,
    ] = await Promise.all([
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
        include: { plan: true },
      }),
      prisma.subscription.findMany({
        where: {
          status: { in: ["ACTIVE", "PAST_DUE"] },
          createdAt: { gte: thisMonthStart },
        },
        include: { plan: true },
      }),
      prisma.subscription.findMany({
        where: {
          status: "CANCELLED",
          cancelledAt: { gte: thisMonthStart },
        },
        include: { plan: true },
      }),
      prisma.subscription.count({
        where: { status: "CANCELLED", cancelledAt: { gte: thirtyDaysAgo } },
      }),
      paymentRepo.monthlyTotals(seriesStart),
      invoiceRepo.countOverdue(now),
      invoiceRepo.sumByStatus("PAID"),
    ]);

    const mrr = billingSubscriptions.reduce(
      (sum, subscription) => sum + monthlyValue(subscription),
      0
    );

    const activeCount = billingSubscriptions.length;
    const arpu = activeCount === 0 ? 0 : mrr / activeCount;

    const newMrr = newThisMonth.reduce(
      (sum, subscription) => sum + monthlyValue(subscription),
      0
    );

    const churnedMrr = churnedThisMonth.reduce(
      (sum, subscription) => sum + monthlyValue(subscription),
      0
    );

    // Customer churn over the trailing 30 days, against the population that
    // could have churned in that window.
    const churnBase = activeCount + churnedLast30;
    const churnRate =
      churnBase === 0 ? 0 : Number(((churnedLast30 / churnBase) * 100).toFixed(2));

    // Standard LTV = ARPU / churn rate. Undefined without churn, so return null
    // rather than a made-up number.
    const ltv =
      churnRate === 0 ? null : round(arpu / (churnRate / 100));

    const revenueByMonth = new Map(
      monthlyTotals.map((row) => [row.month, Number(row.total ?? 0)])
    );

    const collectedSeries = Array.from({ length: months }, (_, index) => {
      const monthDate = startOfMonth(now, -(months - 1 - index));

      return {
        month: MONTH_LABELS[monthDate.getUTCMonth()],
        year: monthDate.getUTCFullYear(),
        revenue: round(revenueByMonth.get(monthKey(monthDate)) ?? 0),
      };
    });

    // Revenue contribution per plan.
    const planTotals = new Map<
      string,
      { plan: string; customers: number; revenue: number }
    >();

    for (const subscription of billingSubscriptions) {
      const entry = planTotals.get(subscription.planId) ?? {
        plan: subscription.plan.name,
        customers: 0,
        revenue: 0,
      };
      entry.customers += 1;
      entry.revenue += monthlyValue(subscription);
      planTotals.set(subscription.planId, entry);
    }

    const planRevenue = Array.from(planTotals.entries())
      .map(([planId, entry]) => ({
        planId,
        plan: entry.plan,
        customers: entry.customers,
        revenue: round(entry.revenue),
        percentage: mrr === 0 ? 0 : Number(((entry.revenue / mrr) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      mrr: round(mrr),
      arr: round(mrr * 12),
      arpu: round(arpu),
      ltv,
      churnRate,
      activeSubscriptions: activeCount,
      lifetimeCollected: round(totalPaid.total),
      movement: {
        newMrr: round(newMrr),
        churnedMrr: round(-churnedMrr),
        netMrr: round(newMrr - churnedMrr),
      },
      overdue: {
        amount: round(Number(overdue._sum.total ?? 0)),
        count: overdue._count,
      },
      mrrSeries: collectedSeries,
      planRevenue,
    };
  }
}
