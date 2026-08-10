import { Link } from 'react-router-dom'
import {
  DollarSign,
  Building2,
  Users as UsersIcon,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Page, Card } from '../components/layout/Page'
import { StatsCard } from '../components/ui/StatsCard'
import { StatsCardSkeleton, ChartSkeleton, Skeleton } from '../components/ui/Skeleton'
import { PaymentBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useOverview } from '../hooks/queries'
import { billingEnabled } from '../lib/features'
import {
  chartColor,
  cn,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatNumber,
  tooltipStyle,
} from '../lib/utils'

export function Dashboard() {
  const { data, isLoading, error, refetch } = useOverview()

  if (error) {
    return (
      <Page title="Dashboard">
        <ErrorState onRetry={() => refetch()} />
      </Page>
    )
  }

  return (
    <Page
      title="Dashboard"
      subtitle="Platform health at a glance."
    >
      {/* Stats */}
      <div
        className={cn(
          'grid grid-cols-1 gap-6 sm:grid-cols-2',
          billingEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        )}
      >
        {isLoading || !data ? (
          Array.from({ length: billingEnabled ? 4 : 2 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))
        ) : (
          <>
            {billingEnabled && (
              <StatsCard
                title="Revenue This Month"
                value={formatCurrency(data.monthlyRevenue.current)}
                change={data.monthlyRevenue.changePercent}
                icon={DollarSign}
                iconColor="success"
              />
            )}
            <StatsCard
              title="Organizations"
              value={formatNumber(data.totals.organizations)}
              change={data.changes.organizations}
              icon={Building2}
              iconColor="primary"
            />
            <StatsCard
              title="Total Users"
              value={formatNumber(data.totals.users)}
              change={data.changes.users}
              icon={UsersIcon}
              iconColor="accent"
            />
            {billingEnabled && (
              <StatsCard
                title="Active Subscriptions"
                value={formatNumber(data.totals.activeSubscriptions)}
                change={data.changes.subscriptions}
                icon={CreditCard}
                iconColor="warning"
              />
            )}
          </>
        )}
      </div>

      {/* Revenue + plan mix */}
      {billingEnabled && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Revenue Overview"
          description="Payments collected each month"
          actions={
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-primary-500" />
              <span className="text-sm text-slate-600">Revenue</span>
            </div>
          }
        >
          {isLoading || !data ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.revenueSeries}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={formatCompactCurrency}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Subscription Plans" description="Active and trialling accounts">
          {isLoading || !data ? (
            <ChartSkeleton height={220} />
          ) : data.planDistribution.length === 0 ? (
            <EmptyChart message="No active subscriptions yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.planDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    // Recharts 3 + React 19 StrictMode leaves animated shapes
                    // stuck at frame 0 with empty path data.
                    isAnimationActive={false}
                  >
                    {data.planDistribution.map((entry, index) => (
                      <Cell key={entry.planId} fill={chartColor(index)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [`${value} orgs`, name as string]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.planDistribution.map((item, index) => (
                  <div key={item.planId} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: chartColor(index) }}
                    />
                    <span className="truncate text-sm text-slate-600">
                      {item.name}
                    </span>
                    <span className="ml-auto text-sm font-medium text-slate-900">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
      )}

      {/* Transactions + top orgs */}
      <div
        className={cn(
          'grid grid-cols-1 gap-6',
          billingEnabled && 'lg:grid-cols-2'
        )}
      >
        {billingEnabled && (
        <Card
          title="Recent Transactions"
          description="Latest payment activity"
          actions={
            <Link
              to="/invoices"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          }
        >
          {isLoading || !data ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : data.recentTransactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No payments recorded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {data.recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Building2 className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {transaction.organization}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <PaymentBadge status={transaction.status} />
                    <div className="flex items-center gap-1">
                      {transaction.status === 'COMPLETED' ? (
                        <ArrowUpRight className="h-4 w-4 text-success-500" />
                      ) : transaction.status === 'FAILED' ? (
                        <ArrowDownRight className="h-4 w-4 text-danger-500" />
                      ) : null}
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(transaction.amount, transaction.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        )}

        <Card
          title="Top Organizations"
          description="By user count"
          actions={
            <Link
              to="/organizations"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          }
        >
          {isLoading || !data ? (
            <ChartSkeleton height={200} />
          ) : data.topOrganizations.length === 0 ? (
            <EmptyChart message="No organizations yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.topOrganizations} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  horizontal={false}
                />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="code"
                  stroke="#94a3b8"
                  fontSize={12}
                  width={60}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatNumber(Number(value)), 'Users']}
                  labelFormatter={(code) =>
                    data.topOrganizations.find((org) => org.code === code)?.name ??
                    code
                  }
                />
                <Bar
                  dataKey="users"
                  fill="#4f46e5"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </Page>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-20 text-center card-shadow">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
        <AlertCircle className="h-6 w-6 text-danger-600" />
      </div>
      <div>
        <p className="font-medium text-slate-900">Couldn't load dashboard data</p>
        <p className="mt-1 text-sm text-slate-500">
          Check that the API server is running, then try again.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
