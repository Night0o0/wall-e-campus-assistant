import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Users,
  BookOpen,
  CreditCard,
  Plus,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Page } from '../components/layout/Page'
import { SummaryTile } from '../components/ui/SummaryTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { SearchInput } from '../components/ui/SearchInput'
import { Button } from '../components/ui/Button'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { OrganizationFormModal } from '../components/organizations/OrganizationFormModal'
import {
  useOrganizations,
  useDeleteOrganization,
  useOverview,
} from '../hooks/queries'
import { useDebounce } from '../hooks/useDebounce'
import { billingEnabled } from '../lib/features'
import { cn, formatCurrency, formatDate, formatNumber } from '../lib/utils'
import type { Organization, OrganizationStatus } from '../types/api'

// Every option here describes a subscription state, so the whole filter is
// meaningless while billing is off.
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NONE', label: 'No plan' },
]

// Columns that only carry meaning once a subscription exists.
const BILLING_COLUMNS = new Set(['plan', 'status', 'revenue'])

export function Organizations() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Organization | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Organization | null>(null)

  const debouncedSearch = useDebounce(search)

  const params = useMemo(
    () => ({ page, limit: 10, search: debouncedSearch, status }),
    [page, debouncedSearch, status]
  )

  const { data, isLoading, error, refetch, isFetching } = useOrganizations(params)
  const { data: overview } = useOverview()

  const deleteOrg = useDeleteOrganization(() => setDeleting(null))

  const columns: Column<Organization>[] = ([
    {
      key: 'organization',
      header: 'Organization',
      render: (org) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100">
            <span className="text-xs font-bold text-primary-700">{org.code}</span>
          </div>
          <div className="min-w-0">
            <Link
              to={`/organizations/${org.id}`}
              className="block truncate text-sm font-medium text-slate-900 hover:text-primary-600"
            >
              {org.name}
            </Link>
            <p className="truncate text-xs text-slate-500">{org.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (org) =>
        org.planName ? (
          <Badge tone="primary">{org.planName}</Badge>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (org) => <StatusBadge status={org.status as OrganizationStatus} />,
    },
    {
      key: 'users',
      header: 'Users',
      render: (org) => (
        <span className="text-sm text-slate-900">
          {formatNumber(org._count.users)}
        </span>
      ),
    },
    {
      key: 'courses',
      header: 'Courses',
      render: (org) => (
        <span className="text-sm text-slate-900">
          {formatNumber(org._count.courses)}
        </span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (org) => (
        <span className="text-sm font-medium text-slate-900">
          {formatCurrency(org.revenue)}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (org) => (
        <span className="text-sm text-slate-500">{formatDate(org.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (org) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            to={`/organizations/${org.id}`}
            aria-label={`View ${org.name}`}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setEditing(org)}
            aria-label={`Edit ${org.name}`}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeleting(org)}
            aria-label={`Delete ${org.name}`}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ] satisfies Column<Organization>[]).filter(
    (column) => billingEnabled || !BILLING_COLUMNS.has(column.key)
  )

  return (
    <Page
      title="Organizations"
      subtitle="Every university on the platform."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          Add Organization
        </Button>
      }
    >
      <div
        className={cn(
          'grid grid-cols-1 gap-6 sm:grid-cols-2',
          billingEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        )}
      >
        <SummaryTile
          icon={Building2}
          tone="primary"
          label="Organizations"
          value={overview ? formatNumber(overview.totals.organizations) : '—'}
        />
        <SummaryTile
          icon={Users}
          tone="success"
          label="Total Users"
          value={overview ? formatNumber(overview.totals.users) : '—'}
        />
        {billingEnabled ? (
          <>
            <SummaryTile
              icon={CreditCard}
              tone="accent"
              label="Active Subscriptions"
              value={
                overview ? formatNumber(overview.totals.activeSubscriptions) : '—'
              }
            />
            <SummaryTile
              icon={BookOpen}
              tone="warning"
              label="Revenue This Month"
              value={overview ? formatCurrency(overview.monthlyRevenue.current) : '—'}
            />
          </>
        ) : (
          <SummaryTile
            icon={BookOpen}
            tone="accent"
            label="Students"
            value={overview ? formatNumber(overview.totals.students) : '—'}
          />
        )}
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(org) => org.id}
        isLoading={isLoading || (isFetching && !data)}
        error={error}
        onRetry={() => refetch()}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No organizations found"
        emptyMessage={
          search || status
            ? 'Try adjusting your search or filters.'
            : 'Add your first university to get started.'
        }
        emptyAction={
          !search && !status ? (
            <Button icon={Plus} size="sm" onClick={() => setCreating(true)}>
              Add Organization
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search by name, code or email…"
              className="sm:w-80"
            />
            {billingEnabled && (
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value)
                  setPage(1)
                }}
                className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      <OrganizationFormModal
        open={creating}
        onClose={() => setCreating(false)}
      />

      <OrganizationFormModal
        open={Boolean(editing)}
        organization={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete organization"
        message={`Permanently delete ${deleting?.name}? Organizations with users or billing history can't be deleted.`}
        confirmLabel="Delete"
        destructive
        loading={deleteOrg.isPending}
        onConfirm={() => deleting && deleteOrg.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Page>
  )}