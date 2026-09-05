import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Users,
  BookOpen,
  CalendarClock,
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { OrganizationFormModal } from '../components/organizations/OrganizationFormModal'
import {
  useOrganizations,
  useDeleteOrganization,
  useOverview,
} from '../hooks/queries'
import { useDebounce } from '../hooks/useDebounce'
import { formatDate, formatNumber } from '../lib/utils'
import type { Organization } from '../types/api'

export function Organizations() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Organization | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Organization | null>(null)

  const debouncedSearch = useDebounce(search)

  const params = useMemo(
    () => ({ page, limit: 10, search: debouncedSearch }),
    [page, debouncedSearch]
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
      key: 'sessions',
      header: 'Sessions',
      render: (org) => (
        <span className="text-sm text-slate-900">
          {formatNumber(org._count.sessions)}
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
  ] satisfies Column<Organization>[])

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
        <SummaryTile
          icon={BookOpen}
          tone="accent"
          label="Courses"
          value={overview ? formatNumber(overview.totals.courses) : '—'}
        />
        <SummaryTile
          icon={CalendarClock}
          tone="warning"
          label="Students"
          value={overview ? formatNumber(overview.totals.students) : '—'}
        />
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
          search
            ? 'Try adjusting your search.'
            : 'Add your first university to get started.'
        }
        emptyAction={
          !search ? (
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
        message={`Permanently delete ${deleting?.name}? Organizations with users can't be deleted.`}
        confirmLabel="Delete"
        destructive
        loading={deleteOrg.isPending}
        onConfirm={() => deleting && deleteOrg.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Page>
  )
}
