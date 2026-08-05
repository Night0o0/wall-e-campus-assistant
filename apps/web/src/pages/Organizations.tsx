import { useState } from 'react'
import {
  Building2,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Users,
  BookOpen,
  CreditCard,
  Eye,
  Edit,
  Trash2,
} from 'lucide-react'
import { Header } from '../components/layout/Header'
import { formatCurrency, formatDate } from '../lib/utils'

// Mock data for organizations
const organizations = [
  {
    id: '1',
    name: 'Cairo University',
    code: 'CU',
    email: 'admin@cu.edu.eg',
    phone: '+20 2 1234 5678',
    plan: 'Pro',
    status: 'active',
    users: 12500,
    courses: 450,
    revenue: 4990,
    createdAt: '2025-03-15',
  },
  {
    id: '2',
    name: 'Alexandria University',
    code: 'AU',
    email: 'admin@alexu.edu.eg',
    phone: '+20 3 9876 5432',
    plan: 'Basic',
    status: 'active',
    users: 8200,
    courses: 320,
    revenue: 2990,
    createdAt: '2025-05-22',
  },
  {
    id: '3',
    name: 'Ain Shams University',
    code: 'ASU',
    email: 'admin@asu.edu.eg',
    phone: '+20 2 5555 1234',
    plan: 'Pro',
    status: 'active',
    users: 6800,
    courses: 280,
    revenue: 4990,
    createdAt: '2025-06-10',
  },
  {
    id: '4',
    name: 'Helwan University',
    code: 'HU',
    email: 'admin@helwan.edu.eg',
    phone: '+20 2 4444 9999',
    plan: 'Basic',
    status: 'trial',
    users: 4500,
    courses: 180,
    revenue: 0,
    createdAt: '2026-07-28',
  },
  {
    id: '5',
    name: 'Mansoura University',
    code: 'MU',
    email: 'admin@mans.edu.eg',
    phone: '+20 50 2222 3333',
    plan: 'Enterprise',
    status: 'active',
    users: 15200,
    courses: 520,
    revenue: 9990,
    createdAt: '2025-02-05',
  },
]

const planColors: Record<string, string> = {
  Free: 'bg-slate-100 text-slate-700',
  Basic: 'bg-accent-100 text-accent-700',
  Pro: 'bg-primary-100 text-primary-700',
  Enterprise: 'bg-purple-100 text-purple-700',
}

const statusColors: Record<string, string> = {
  active: 'bg-success-50 text-success-600',
  trial: 'bg-warning-50 text-warning-600',
  expired: 'bg-danger-50 text-danger-600',
  cancelled: 'bg-slate-100 text-slate-600',
}

export function Organizations() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredOrgs = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen">
      <Header title="Organizations" subtitle="Manage all registered universities and institutions" />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary-100 p-3">
                <Building2 className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Organizations</p>
                <p className="text-2xl font-bold text-slate-900">{organizations.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-success-50 p-3">
                <Users className="h-6 w-6 text-success-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">
                  {organizations.reduce((acc, org) => acc + org.users, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-accent-100 p-3">
                <BookOpen className="h-6 w-6 text-accent-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Courses</p>
                <p className="text-2xl font-bold text-slate-900">
                  {organizations.reduce((acc, org) => acc + org.courses, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-warning-50 p-3">
                <CreditCard className="h-6 w-6 text-warning-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Monthly Revenue</p>
                <p className="text-2xl font-bold text-slate-900">
                  {formatCurrency(organizations.reduce((acc, org) => acc + org.revenue, 0))}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="rounded-xl bg-white card-shadow">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search organizations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-80 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </div>
            <button className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Organization
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Organization
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Plan
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Users
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Courses
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Revenue
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Joined
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                          <span className="text-sm font-bold text-primary-700">{org.code}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{org.name}</p>
                          <p className="text-xs text-slate-500">{org.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${planColors[org.plan]}`}
                      >
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusColors[org.status]}`}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900">{org.users.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900">{org.courses}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900">{formatCurrency(org.revenue)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-500">{formatDate(org.createdAt)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">1</span> to{' '}
              <span className="font-medium text-slate-900">{filteredOrgs.length}</span> of{' '}
              <span className="font-medium text-slate-900">{organizations.length}</span> results
            </p>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                Previous
              </button>
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
