import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, XCircle, Pencil } from 'lucide-react'
import { Page } from '../components/layout/Page'
import { DataTable, type Column } from '../components/ui/DataTable'
import { SearchInput } from '../components/ui/SearchInput'
import { Button } from '../components/ui/Button'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SubscriptionFormModal } from '../components/billing/SubscriptionFormModal'
import {
  useSubscriptions,
  useCancelSubscription,
  useRenewSubscription,
} from '../hooks/queries'
import { useDebounce } from '../hooks/useDebounce'
import { formatCurrency, formatDate, formatRelative } from '../lib/utils'
import type { Subscription } from '../types/api'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
]

export function Subscriptions() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [cancelling, setCancelling] = useState<Subscription | null>(null)
  const [renewing, setRenewing] = useState<Subscription | null>(null)

  const debouncedSearch = useDebounce(search)

  const params = useMemo(
    () => ({ page, limit: 10, search: debouncedSearch, status }),
    [page, debouncedSearch, status]
  )

  const { data, isLoading, error, refetch } = useSubscriptions(params)

  const cancel = useCancelSubscription(() => setCancelling(null))
  const renew = useRenewSubscription(() => setRenewing(null))

  const priceOf = (subscription: Subscription) =>
    subscription.billingCycle === 'YEARLY'
      ? subscription.plan.yearlyPrice
      : subscription.plan.monthlyPrice

  const columns: Column<Subscription>[] = [
    {
      key: 'organization',
      header: 'Organization',
      render: (subscription) =>
        subscription.organization ? (
          <Link
            to={`/organizations/${subscription.organization.id}`}
            className="text-sm font-medium text-slate-900 hover:text-primary-600"
          >
            {subscription.organization.name}
          </Link>
        ) : (
          <span className="text-sm text-slate-400">Unassigned</span>
        ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (subscription) => <Badge tone="primary">{subscription.plan.name}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (subscription) => <StatusBadge status={subscription.status} />,
    },
    {
      key: 'cycle',
      header: 'Billing',
      render: (subscription) => (
        <span className="text-sm text-slate-900">
          {subscription.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (subscription) => (
        <span className="text-sm font-medium text-slate-900">
          {formatCurrency(priceOf(subscription))}
        </span>
      ),
    },
    {
      key: 'renews',
      header: 'Renews',
      render: (subscription) => (
        <div>
          <p className="text-sm text-slate-900">
            {formatDate(subscription.currentPeriodEnd)}
          </p>
          <p className="text-xs text-slate-500">
            {formatRelative(subscription.currentPeriodEnd)}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (subscription) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setEditing(subscription)}
            aria-label="Edit subscription"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRenewing(subscription)}
            aria-label="Renew subscription"
            title="Start a new billing period"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCancelling(subscription)}
            disabled={subscription.status === 'CANCELLED'}
            aria-label="Cancel subscription"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <Page
      title="Subscriptions"
      subtitle="Plan assignments and billing periods."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          New Subscription
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(subscription) => subscription.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No subscriptions found"
        emptyMessage="Assign a plan to an organization to get started."
        emptyAction={
          <Button icon={Plus} size="sm" onClick={() => setCreating(true)}>
            New Subscription
          </Button>
        }
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search by organization…"
              className="sm:w-80"
            />
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
          </div>
        }
      />

      <SubscriptionFormModal open={creating} onClose={() => setCreating(false)} />
      <SubscriptionFormModal
        open={Boolean(editing)}
        subscription={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel subscription"
        message={`Cancel the ${cancelling?.plan.name} subscription for ${
          cancelling?.organization?.name ?? 'this organization'
        }? Billing stops and the account keeps access until the period ends.`}
        confirmLabel="Cancel subscription"
        cancelLabel="Keep it"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        onClose={() => setCancelling(null)}
      />

      <ConfirmDialog
        open={Boolean(renewing)}
        title="Renew subscription"
        message={`Start a new ${
          renewing?.billingCycle === 'YEARLY' ? 'yearly' : 'monthly'
        } billing period from today and mark the subscription active?`}
        confirmLabel="Renew"
        loading={renew.isPending}
        onConfirm={() => renewing && renew.mutate(renewing.id)}
        onClose={() => setRenewing(null)}
      />
    </Page>
  )
}
