import { useState } from 'react'
import {
  Users as UsersIcon,
  Search,
  Filter,
  Plus,
  UserCheck,
  UserX,
  Shield,
  GraduationCap,
  Eye,
  Edit,
  Trash2,
  Mail,
} from 'lucide-react'
import { Header } from '../components/layout/Header'
import { formatDate } from '../lib/utils'

// Mock data for users
const users = [
  {
    id: '1',
    name: 'Ahmed Hassan',
    email: 'ahmed.hassan@cu.edu.eg',
    role: 'ADMIN',
    organization: 'Cairo University',
    status: 'active',
    verified: true,
    createdAt: '2025-03-15',
  },
  {
    id: '2',
    name: 'Sara Mohamed',
    email: 'sara.m@alexu.edu.eg',
    role: 'UNIVERSITY_SUPER_ADMIN',
    organization: 'Alexandria University',
    status: 'active',
    verified: true,
    createdAt: '2025-05-22',
  },
  {
    id: '3',
    name: 'Mohamed Ali',
    email: 'mohamed.ali@asu.edu.eg',
    role: 'STUDENT',
    organization: 'Ain Shams University',
    status: 'active',
    verified: true,
    createdAt: '2026-01-10',
  },
  {
    id: '4',
    name: 'Fatma Ibrahim',
    email: 'fatma.i@helwan.edu.eg',
    role: 'ADMIN',
    organization: 'Helwan University',
    status: 'inactive',
    verified: false,
    createdAt: '2026-07-28',
  },
  {
    id: '5',
    name: 'Omar Khaled',
    email: 'omar.k@mans.edu.eg',
    role: 'STUDENT',
    organization: 'Mansoura University',
    status: 'active',
    verified: true,
    createdAt: '2026-02-15',
  },
  {
    id: '6',
    name: 'Nour Ahmed',
    email: 'nour.a@cu.edu.eg',
    role: 'STUDENT',
    organization: 'Cairo University',
    status: 'active',
    verified: true,
    createdAt: '2026-03-20',
  },
]

const roleColors: Record<string, string> = {
  SYSTEM_OWNER: 'bg-purple-100 text-purple-700',
  UNIVERSITY_SUPER_ADMIN: 'bg-primary-100 text-primary-700',
  ADMIN: 'bg-accent-100 text-accent-700',
  STUDENT: 'bg-slate-100 text-slate-700',
}

const roleLabels: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  UNIVERSITY_SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  STUDENT: 'Student',
}

export function Users() {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'ADMIN' || u.role === 'UNIVERSITY_SUPER_ADMIN').length,
    students: users.filter((u) => u.role === 'STUDENT').length,
    inactive: users.filter((u) => u.status === 'inactive').length,
  }

  return (
    <div className="min-h-screen">
      <Header title="User Management" subtitle="Manage users across all organizations" />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary-100 p-3">
                <UsersIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-accent-100 p-3">
                <Shield className="h-6 w-6 text-accent-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Admins</p>
                <p className="text-2xl font-bold text-slate-900">{stats.admins}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-success-50 p-3">
                <GraduationCap className="h-6 w-6 text-success-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Students</p>
                <p className="text-2xl font-bold text-slate-900">{stats.students}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 card-shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-danger-50 p-3">
                <UserX className="h-6 w-6 text-danger-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Inactive</p>
                <p className="text-2xl font-bold text-slate-900">{stats.inactive}</p>
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
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-80 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="all">All Roles</option>
                <option value="UNIVERSITY_SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="STUDENT">Student</option>
              </select>
            </div>
            <button className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Organization
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Verified
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
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                          <span className="text-sm font-semibold text-primary-700">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${roleColors[user.role]}`}
                      >
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900">{user.organization}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                          user.status === 'active'
                            ? 'bg-success-50 text-success-600'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.verified ? (
                        <UserCheck className="h-5 w-5 text-success-500" />
                      ) : (
                        <UserX className="h-5 w-5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-500">{formatDate(user.createdAt)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                          <Mail className="h-4 w-4" />
                        </button>
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
              <span className="font-medium text-slate-900">{filteredUsers.length}</span> of{' '}
              <span className="font-medium text-slate-900">{users.length}</span> results
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
