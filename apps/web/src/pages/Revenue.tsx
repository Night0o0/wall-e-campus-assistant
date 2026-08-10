import {
  DollarSign,
  TrendingUp,
  PiggyBank,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
} from 'recharts'
import { Page, Card } from '../components/layout/Page'
import { StatsCard } from '../components/ui/StatsCard'
import { StatsCardSkeleton, ChartSkeleton, Skeleton } from '../components/ui/Skeleton'
import { Button } from '../components/ui/Button'
import { useRevenueMetrics } from '../hooks/queries'
import {
  formatCompactCurrency,
  formatCurrency,
  tooltipStyle,
} from '../lib/utils'

export function Revenue() {
  const { data, isLoading, error, refetch } = useRevenueMetrics()

  if (error) {
    return (
      <Page title="Revenue Analytics">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-20 text-center card-shadow">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
            <AlertCircle className="h-6 w-6 text-danger-600" />
          </div>
          <p className="font-medium text-slate-900">Couldn't load revenue data</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Page>
    )
  }

  const loading = isLoading || !data

  return (
    <Page
      title="Revenue Analytics"
      subtitle="Recurring revenue, collections and plan performance."
    >
      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))
        ) : (
          <>
            <StatsCard
              title="Monthly Recurring Revenue"
              value={formatCurrency(data.mrr)}
              changeLabel={`Across ${data.activeSubscriptions} billing account${
                data.activeSubscriptions === 1 ? '' : 's'
              }`}
              icon={DollarSign}
              iconColor="success"
            />
            <StatsCard
              title="Annual Run Rate"
              value={formatCurrency(data.arr)}
              changeLabel="MRR × 12"
              icon={TrendingUp}
              iconColor="primary"
            />
            <StatsCard
              title="Avg Revenue Per Account"
              value={formatCurrency(data.arpu)}
              changeLabel="MRR ÷ active accounts"
              icon={PiggyBank}
              iconColor="accent"
            />
            <StatsCard
              title="Overdue Invoices"
              value={formatCurrency(data.overdue.amount)}
              changeLabel={`${data.overdue.count} invoice${
                data.overdue.count === 1 ? '' : 's'
              }`}
              icon={AlertCircle}
              iconColor="danger"
            />
          </>
        )}
      </div>

      {/* Collections + MRR movement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Collections Over Time"
          description="Payments received each month"
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.mrrSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={formatCompactCurrency}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatCurrency(Number(value)), 'Collected']}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="MRR Movement" description="Changes this month">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <MovementRow
                  label="New MRR"
                  value={data.movement.newMrr}
                  color="#10b981"
                />
                <MovementRow
                  label="Churned MRR"
                  value={data.movement.churnedMrr}
                  color="#ef4444"
                />
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Net MRR change
                  </span>
                  <div className="flex items-center gap-1.5">
                    {data.movement.netMrr > 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-success-500" />
                    ) : data.movement.netMrr < 0 ? (
                      <ArrowDownRight className="h-4 w-4 text-danger-500" />
                    ) : (
                      <Minus className="h-4 w-4 text-slate-400" />
                    )}
                    <span
                      className={`text-lg font-bold ${
                        data.movement.netMrr > 0
                          ? 'text-success-600'
                          : data.movement.netMrr < 0
                            ? 'text-danger-600'
                            : 'text-slate-600'
                      }`}
                    >
                      {data.movement.netMrr > 0 ? '+' : ''}
                      {formatCurrency(data.movement.netMrr)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Key metrics + revenue by plan */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Key Metrics" description="Derived from current subscriptions">
          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Metric
                label="Churn Rate"
                value={`${data.churnRate}%`}
                hint="Trailing 30 days"
              />
              <Metric
                label="Lifetime Value"
                value={data.ltv === null ? '—' : formatCurrency(data.ltv)}
                hint={data.ltv === null ? 'Needs churn data' : 'ARPA ÷ churn rate'}
              />
              <Metric
                label="Active Subscriptions"
                value={String(data.activeSubscriptions)}
                hint="Billing accounts"
              />
              <Metric
                label="Lifetime Collected"
                value={formatCurrency(data.lifetimeCollected)}
                hint="All paid invoices"
              />
            </div>
          )}
        </Card>

        <Card title="Revenue by Plan" description="Monthly recurring revenue split">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : data.planRevenue.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No billing subscriptions yet.
            </p>
          ) : (
            <div className="space-y-4">
              {data.planRevenue.map((plan) => (
                <div key={plan.planId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {plan.plan}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({plan.customers} customer{plan.customers === 1 ? '' : 's'})
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(plan.revenue)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full gradient-primary"
                      style={{ width: `${Math.max(plan.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Monthly comparison */}
      <Card
        title="Monthly Collections"
        description="Revenue collected each month"
      >
        {loading ? (
          <ChartSkeleton height={250} />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.mrrSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={formatCompactCurrency}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [formatCurrency(Number(value)), 'Collected']}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Bar
                dataKey="revenue"
                fill="#4f46e5"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </Page>
  )
}

function MovementRow({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span
        className={`text-sm font-semibold ${
          value < 0 ? 'text-danger-600' : 'text-slate-900'
        }`}
      >
        {value > 0 ? '+' : ''}
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}
