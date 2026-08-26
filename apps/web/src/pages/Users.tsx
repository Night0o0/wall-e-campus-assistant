import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Users as UsersIcon,
  Shield,
  GraduationCap,
  UserX,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Power,
} from 'lucide-react'
import { Page } from '../components/layout/Page'
import { SummaryTile } from '../components/ui/SummaryTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { SearchInput } from '../components/ui/SearchInput'
import { Button } from '../components/ui/Button'
import { Badge, RoleBadge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { UserFormModal } from '../components/users/UserFormModal'
import { ResetPasswordModal } from '../components/users/ResetPasswordModal'
import {
  useUsers,
  useUserStats,
  useDeleteUser,
  useUpdateUser,
  useOrganizations,
} from '../hooks/queries'
import { useDebounce } from '../hooks/useDebounce'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatNumber, initials } from '../lib/utils'
import type { User } from '../types/api'

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'SYSTEM_OWNER', label: 'System Owner' },
  { value: 'UNIVERSITY_ADMIN', label: 'Super Admin' },
  { value: 'INSTRUCTOR', label: 'Admin' },
  { value: 'STUDENT', label: 'Student' },
]

export function Users() {
  const { user: currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const organizationId = searchParams.get('organizationId') ?? ''

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [toggling, setToggling] = useState<User | null>(null)

  const debouncedSearch = useDebounce(search)

  const params = useMemo(
    () => ({
      page,
      limit: 10,
      search: debouncedSearch,
      role,
      organizationId,
    }),
    [page, debouncedSearch, role, organizationId]
  )

  const { data, isLoading, error, refetch } = useUsers(params)
  const { data: stats } = useUserStats()
  const { data: organizations } = useOrganizations({ limit: 100 })

  const deleteUser = useDeleteUser(() => setDeleting(null))
  const updateUser = useUpdateUser(() => setToggling(null))

  const activeOrg = organizations?.data.find((org) => org.id === organizationId)

  const columns: Column<User>[] = [
    {
      key: 'user',
      header: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
            <span className="text-sm font-semibold text-primary-700">
              {initials(user.fullName)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'universityId',
      header: 'ID',
      className: 'whitespace-nowrap',
      render: (user) => (
        <span className="font-mono text-xs text-slate-600">
          {user.universityId}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => <RoleBadge role={user.role} />,
    },
    {
      key: 'organization',
      header: 'Organization',
      render: (user) => (
        <span className="text-sm text-slate-900">
          {user.organization?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <Badge tone={user.isActive ? 'success' : 'neutral'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'verified',
      header: 'Verified',
      render: (user) =>
        user.isVerified ? (
          <UserCheck className="h-5 w-5 text-success-500" />
        ) : (
          <UserX className="h-5 w-5 text-slate-300" />
        ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (user) => (
        <span className="text-sm text-slate-500">{formatDate(user.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (user) => {
        const isSelf = user.id === currentUser?.id

        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setEditing(user)}
              aria-label={`Edit ${user.fullName}`}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setResetting(user)}
              aria-label={`Reset password for ${user.fullName}`}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => setToggling(user)}
              disabled={isSelf}
              aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.fullName}`}
              title={isSelf ? "You can't deactivate yourself" : undefined}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Power className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDeleting(user)}
              disabled={isSelf}
              aria-label={`Delete ${user.fullName}`}
              title={isSelf ? "You can't delete yourself" : undefined}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <Page
      title="User Management"
      subtitle="Every account across all organizations."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          Add User
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={UsersIcon}
          tone="primary"
          label="Total Users"
          value={stats ? formatNumber(stats.total) : '—'}
        />
        <SummaryTile
          icon={Shield}
          tone="accent"
          label="Admins"
          value={stats ? formatNumber(stats.admins) : '—'}
        />
        <SummaryTile
          icon={GraduationCap}
          tone="success"
          label="Students"
          value={stats ? formatNumber(stats.students) : '—'}
        />
        <SummaryTile
          icon={UserX}
          tone="danger"
          label="Inactive"
          value={stats ? formatNumber(stats.inactive) : '—'}
        />
      </div>

      {activeOrg && (
        <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-3">
          <span className="text-sm text-primary-700">
            Filtered to <strong>{activeOrg.name}</strong>
          </span>
          <button
            onClick={() => {
              searchParams.delete('organizationId')
              setSearchParams(searchParams)
              setPage(1)
            }}
            className="text-sm font-medium text-primary-700 underline hover:text-primary-800"
          >
            Clear
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(user) => user.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No users found"
        emptyMessage="Try adjusting your search or filters."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search by name, email or ID…"
              className="sm:w-80"
            />
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value)
                setPage(1)
              }}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <UserFormModal open={creating} onClose={() => setCreating(false)} />
      <UserFormModal
        open={Boolean(editing)}
        user={editing}
        onClose={() => setEditing(null)}
      />
      <ResetPasswordModal
        open={Boolean(resetting)}
        user={resetting}
        onClose={() => setResetting(null)}
      />

      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling?.isActive ? 'Deactivate user' : 'Activate user'}
        message={
          toggling?.isActive
            ? `${toggling?.fullName} will be signed out and blocked from signing in again.`
            : `${toggling?.fullName} will be able to sign in again.`
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Activate'}
        destructive={toggling?.isActive}
        loading={updateUser.isPending}
        onConfirm={() =>
          toggling &&
          updateUser.mutate({
            id: toggling.id,
            data: { isActive: !toggling.isActive },
          })
        }
        onClose={() => setToggling(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete user"
        message={`Permanently delete ${deleting?.fullName}? Accounts with attendance or course history must be deactivated instead.`}
        confirmLabel="Delete"
        destructive
        loading={deleteUser.isPending}
        onConfirm={() => deleting && deleteUser.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Page>
  )}