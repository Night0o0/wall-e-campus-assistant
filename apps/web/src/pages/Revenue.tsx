import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  CreditCard,
  Receipt,
  PiggyBank,
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
  LineChart,
  Line,
  BarChart,
  Bar,
} from 'recharts'
import { Header } from '../components/layout/Header'
import { StatsCard } from '../components/ui/StatsCard'
import { formatCurrency } from '../lib/utils'

// Mock data for MRR chart
const mrrData = [
  { month: 'Jan', mrr: 18500, arr: 222000 },
  { month: 'Feb', mrr: 21200, arr: 254400 },
  { month: 'Mar', mrr: 24800, arr: 297600 },
  { month: 'Apr', mrr: 26500, arr: 318000 },
  { month: 'May', mrr: 28100, arr: 337200 },
  { month: 'Jun', mrr: 31400, arr: 376800 },
  { month: 'Jul', mrr: 34200, arr: 410400 },
  { month: 'Aug', mrr: 38500, arr: 462000 },
]

// Mock data for revenue breakdown
const revenueBreakdown = [
  { name: 'New MRR', value: 8500, color: '#10b981' },
  { name: 'Expansion', value: 3200, color: '#06b6d4' },
  { name: 'Churn', value: -2100, color: '#ef4444' },
  { name: 'Net Change', value: 9600, color: '#4f46e5' },
]

// Mock data for plan revenue
const planRevenue = [
  { plan: 'Free', customers: 15, revenue: 0, percentage: 0 },
  { plan: 'Basic', customers: 18, revenue: 5382, percentage: 14 },
  { plan: 'Pro', customers: 12, revenue: 11988, percentage: 31 },
  { plan: 'Enterprise', customers: 3, revenue: 21129, percentage: 55 },
]

// Mock data for revenue metrics
const revenueMetrics = [
  { label: 'ARPU', value: '$802', change: 5.2 },
  { label: 'LTV', value: '$9,624', change: 8.4 },
  { label: 'Churn Rate', value: '2.1%', change: -0.3 },
  { label: 'Net Revenue Retention', value: '115%', change: 3.2 },
]

export function Revenue() {
  return (
    <div className="min-h-screen">
      <Header title="Revenue Analytics" subtitle="Track your financial performance and growth metrics" />

      <div className="p-6 space-y-6">
        {/* Main Stats */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Monthly Recurring Revenue"
            value={formatCurrency(38500)}
            change={12.6}
            icon={DollarSign}
            iconColor="success"
          />
          <StatsCard
            title="Annual Run Rate"
            value={formatCurrency(462000)}
            change={12.6}
            icon={TrendingUp}
            iconColor="primary"
          />
          <StatsCard
            title="Average Revenue Per User"
            value={formatCurrency(802)}
            change={5.2}
            icon={PiggyBank}
            iconColor="accent"
          />
          <StatsCard
            title="Overdue Invoices"
            value={formatCurrency(2450)}
            change={-15.3}
            icon={AlertCircle}
            iconColor="danger"
          />
        </div>

        {/* MRR & ARR Chart */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Revenue Growth</h3>
                <p className="text-sm text-slate-500">MRR and ARR trends over time</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary-500" />
                  <span className="text-sm text-slate-600">MRR</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-accent-500" />
                  <span className="text-sm text-slate-600">ARR (scaled)</span>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mrrData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  formatter={(value) => formatCurrency(Number(value))}
                />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ fill: '#4f46e5', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="arr"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  yAxisId={0}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue Breakdown */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">MRR Movement</h3>
              <p className="text-sm text-slate-500">This month's changes</p>
            </div>
            <div className="space-y-4">
              {revenueBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-slate-600">{item.name}</span>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      item.value >= 0 ? 'text-slate-900' : 'text-danger-600'
                    }`}
                  >
                    {item.value >= 0 ? '+' : ''}{formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Net MRR Growth</span>
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-success-500" />
                  <span className="text-lg font-bold text-success-600">
                    +{formatCurrency(9600)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics & Plan Revenue */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Key Revenue Metrics */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Key Metrics</h3>
              <p className="text-sm text-slate-500">Important revenue indicators</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {revenueMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{metric.value}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {metric.change >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-success-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-danger-500" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        metric.change >= 0 ? 'text-success-600' : 'text-danger-600'
                      }`}
                    >
                      {metric.change >= 0 ? '+' : ''}{metric.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue by Plan */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Revenue by Plan</h3>
              <p className="text-sm text-slate-500">Monthly revenue distribution</p>
            </div>
            <div className="space-y-4">
              {planRevenue.map((plan) => (
                <div key={plan.plan} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{plan.plan}</span>
                      <span className="text-xs text-slate-500">({plan.customers} customers)</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(plan.revenue)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full gradient-primary"
                      style={{ width: `${plan.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Revenue Bar Chart */}
        <div className="rounded-xl bg-white p-6 card-shadow">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Monthly Revenue Comparison</h3>
              <p className="text-sm text-slate-500">Revenue collected each month</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={mrrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Bar dataKey="mrr" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
