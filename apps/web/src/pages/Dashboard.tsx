import {
  DollarSign,
  Building2,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
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
import { Header } from '../components/layout/Header'
import { StatsCard } from '../components/ui/StatsCard'
import { formatCurrency } from '../lib/utils'

// Mock data for revenue chart
const revenueData = [
  { month: 'Jan', revenue: 12400, customers: 45 },
  { month: 'Feb', revenue: 15600, customers: 52 },
  { month: 'Mar', revenue: 18200, customers: 61 },
  { month: 'Apr', revenue: 21500, customers: 68 },
  { month: 'May', revenue: 19800, customers: 65 },
  { month: 'Jun', revenue: 24600, customers: 78 },
  { month: 'Jul', revenue: 28400, customers: 85 },
  { month: 'Aug', revenue: 32100, customers: 92 },
]

// Mock data for subscription distribution
const subscriptionData = [
  { name: 'Free', value: 15, color: '#94a3b8' },
  { name: 'Basic', value: 35, color: '#06b6d4' },
  { name: 'Pro', value: 40, color: '#4f46e5' },
  { name: 'Enterprise', value: 10, color: '#7c3aed' },
]

// Mock data for recent transactions
const recentTransactions = [
  { id: 1, org: 'Cairo University', amount: 499, status: 'completed', date: '2026-08-05' },
  { id: 2, org: 'Alexandria University', amount: 299, status: 'completed', date: '2026-08-04' },
  { id: 3, org: 'Ain Shams University', amount: 499, status: 'pending', date: '2026-08-04' },
  { id: 4, org: 'Helwan University', amount: 199, status: 'completed', date: '2026-08-03' },
  { id: 5, org: 'Mansoura University', amount: 499, status: 'failed', date: '2026-08-03' },
]

// Mock data for top organizations
const topOrganizations = [
  { name: 'Cairo University', students: 12500, revenue: 4990 },
  { name: 'Alexandria University', students: 8200, revenue: 2990 },
  { name: 'Ain Shams University', students: 6800, revenue: 2990 },
  { name: 'Helwan University', students: 4500, revenue: 1990 },
]

export function Dashboard() {
  return (
    <div className="min-h-screen">
      <Header title="Dashboard" subtitle="Welcome back! Here's what's happening with your business." />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Monthly Revenue"
            value={formatCurrency(32100)}
            change={16.5}
            icon={DollarSign}
            iconColor="success"
          />
          <StatsCard
            title="Total Organizations"
            value="48"
            change={12.3}
            icon={Building2}
            iconColor="primary"
          />
          <StatsCard
            title="Total Users"
            value="12,847"
            change={8.2}
            icon={Users}
            iconColor="accent"
          />
          <StatsCard
            title="Active Subscriptions"
            value="42"
            change={-2.4}
            icon={CreditCard}
            iconColor="warning"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Revenue Overview</h3>
                <p className="text-sm text-slate-500">Monthly revenue trend</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary-500" />
                  <span className="text-sm text-slate-600">Revenue</span>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Subscription Distribution */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Subscription Plans</h3>
              <p className="text-sm text-slate-500">Distribution by plan type</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={subscriptionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {subscriptionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [`${value}%`, 'Share']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {subscriptionData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-600">{item.name}</span>
                  <span className="text-sm font-medium text-slate-900">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Transactions */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
                <p className="text-sm text-slate-500">Latest payment activities</p>
              </div>
              <button className="text-sm font-medium text-primary-600 hover:text-primary-700">
                View all
              </button>
            </div>
            <div className="space-y-4">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                      <Building2 className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{tx.org}</p>
                      <p className="text-xs text-slate-500">{tx.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        tx.status === 'completed'
                          ? 'bg-success-50 text-success-600'
                          : tx.status === 'pending'
                          ? 'bg-warning-50 text-warning-600'
                          : 'bg-danger-50 text-danger-600'
                      }`}
                    >
                      {tx.status}
                    </span>
                    <div className="flex items-center gap-1">
                      {tx.status === 'completed' ? (
                        <ArrowUpRight className="h-4 w-4 text-success-500" />
                      ) : tx.status === 'failed' ? (
                        <ArrowDownRight className="h-4 w-4 text-danger-500" />
                      ) : null}
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Organizations */}
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Top Organizations</h3>
                <p className="text-sm text-slate-500">By student count</p>
              </div>
              <button className="text-sm font-medium text-primary-600 hover:text-primary-700">
                View all
              </button>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topOrganizations} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  width={120}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="students" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
