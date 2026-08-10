import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, CheckCircle2, Trash2, Undo2, FileText, Receipt } from 'lucide-react'
import { Page } from '../components/layout/Page'
import { DataTable, type Column } from '../components/ui/DataTable'
import { SearchInput } from '../components/ui/SearchInput'
import { Button } from '../components/ui/Button'
import { InvoiceBadge, PaymentBadge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { InvoiceFormModal } from '../components/billing/InvoiceFormModal'
import {
  useInvoices,
  usePayments,
  useDeleteInvoice,
  useMarkInvoicePaid,
  useRefundPayment,
} from '../hooks/queries'
import { useDebounce } from '../hooks/useDebounce'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Invoice, Payment } from '../types/api'

type Tab = 'invoices' | 'payments'

const INVOICE_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function Invoices() {
  const [searchParams] = useSearchParams()
  const organizationId = searchParams.get('organizationId') ?? ''

  const [tab, setTab] = useState<Tab>('invoices')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState<Invoice | null>(null)
  const [refunding, setRefunding] = useState<Payment | null>(null)

  const debouncedSearch = useDebounce(search)

  const params = useMemo(
    () => ({
      page,
      limit: 10,
      search: debouncedSearch,
      status,
      organizationId,
    }),
    [page, debouncedSearch, status, organizationId]
  )

  const invoices = useInvoices(params)
  const payments = usePayments({ ...params, status: '' })

  const markPaid = useMarkInvoicePaid(() => setPaying(null))
  const deleteInvoice = useDeleteInvoice(() => setDeleting(null))
  const refundPayment = useRefundPayment(() => setRefunding(null))

  const switchTab = (next: Tab) => {
    setTab(next)
    setPage(1)
    setStatus('')
    setSearch('')
  }

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      render: (invoice) => (
        <div>
          <p className="font-mono text-sm font-medium text-slate-900">
            {invoice.invoiceNumber}
          </p>
          <p className="text-xs text-slate-500">{invoice.organization.name}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Total',
      render: (invoice) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {formatCurrency(invoice.total, invoice.currency)}
          </p>
          <p className="text-xs text-slate-500">
            {formatCurrency(invoice.amount)} + {formatCurrency(invoice.tax)} tax
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (invoice) => <InvoiceBadge status={invoice.status} />,
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (invoice) => (
        <span className="text-sm text-slate-600">{formatDate(invoice.dueDate)}</span>
      ),
    },
    {
      key: 'paidAt',
      header: 'Paid',
      render: (invoice) => (
        <span className="text-sm text-slate-500">
          {invoice.paidAt ? formatDate(invoice.paidAt) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (invoice) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setPaying(invoice)}
            disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED'}
            aria-label={`Mark ${invoice.invoiceNumber} paid`}
            title="Mark as paid"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-success-50 hover:text-success-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing(invoice)}
            aria-label={`Edit ${invoice.invoiceNumber}`}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeleting(invoice)}
            disabled={invoice.payments.length > 0}
            aria-label={`Delete ${invoice.invoiceNumber}`}
            title={
              invoice.payments.length > 0
                ? 'Invoices with payments cannot be deleted'
                : 'Delete'
            }
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'organization',
      header: 'Organization',
      render: (payment) => (
        <div>
          <p className="text-sm font-medium text-slate-900">
            {payment.organization.name}
          </p>
          <p className="text-xs text-slate-500">
            {payment.invoice?.invoiceNumber ?? 'No invoice'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (payment) => (
        <span className="text-sm font-semibold text-slate-900">
          {formatCurrency(payment.amount, payment.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (payment) => <PaymentBadge status={payment.status} />,
    },
    {
      key: 'method',
      header: 'Method',
      render: (payment) => (
        <span className="text-sm capitalize text-slate-600">
          {payment.paymentMethod?.replace('_', ' ') ?? '—'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (payment) => (
        <span className="text-sm text-slate-500">
          {formatDate(payment.paidAt ?? payment.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (payment) => (
        <button
          onClick={() => setRefunding(payment)}
          disabled={payment.status !== 'COMPLETED'}
          aria-label="Refund payment"
          title={
            payment.status === 'COMPLETED'
              ? 'Refund'
              : 'Only completed payments can be refunded'
          }
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      ),
    },
  ]

  const active = tab === 'invoices' ? invoices : payments

  return (
    <Page
      title="Billing"
      subtitle="Invoices issued and payments received."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          New Invoice
        </Button>
      }
    >
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
        <TabButton
          active={tab === 'invoices'}
          onClick={() => switchTab('invoices')}
          icon={FileText}
          label="Invoices"
        />
        <TabButton
          active={tab === 'payments'}
          onClick={() => switchTab('payments')}
          icon={Receipt}
          label="Payments"
        />
      </div>

      {tab === 'invoices' ? (
        <DataTable
          columns={invoiceColumns}
          rows={invoices.data?.data ?? []}
          rowKey={(invoice) => invoice.id}
          isLoading={invoices.isLoading}
          error={invoices.error}
          onRetry={() => invoices.refetch()}
          meta={invoices.data?.meta}
          onPageChange={setPage}
          emptyTitle="No invoices found"
          emptyMessage="Issue an invoice to an organization to get started."
          toolbar={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value)
                  setPage(1)
                }}
                placeholder="Search by number or organization…"
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
                {INVOICE_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
      ) : (
        <DataTable
          columns={paymentColumns}
          rows={payments.data?.data ?? []}
          rowKey={(payment) => payment.id}
          isLoading={payments.isLoading}
          error={payments.error}
          onRetry={() => payments.refetch()}
          meta={payments.data?.meta}
          onPageChange={setPage}
          emptyTitle="No payments found"
          emptyMessage="Payments appear here once invoices are settled."
          toolbar={
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search by organization or transaction…"
              className="sm:w-80"
            />
          }
        />
      )}

      <InvoiceFormModal open={creating} onClose={() => setCreating(false)} />
      <InvoiceFormModal
        open={Boolean(editing)}
        invoice={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(paying)}
        title="Mark invoice as paid"
        message={`Record a completed payment of ${
          paying ? formatCurrency(paying.total, paying.currency) : ''
        } for ${paying?.invoiceNumber}?`}
        confirmLabel="Mark paid"
        loading={markPaid.isPending}
        onConfirm={() => paying && markPaid.mutate({ id: paying.id })}
        onClose={() => setPaying(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete invoice"
        message={`Permanently delete ${deleting?.invoiceNumber}?`}
        confirmLabel="Delete"
        destructive
        loading={deleteInvoice.isPending}
        onConfirm={() => deleting && deleteInvoice.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(refunding)}
        title="Refund payment"
        message={`Refund ${
          refunding ? formatCurrency(refunding.amount, refunding.currency) : ''
        } to ${refunding?.organization.name}? Any linked invoice returns to unpaid.`}
        confirmLabel="Refund"
        destructive
        loading={refundPayment.isPending}
        onConfirm={() => refunding && refundPayment.mutate(refunding.id)}
        onClose={() => setRefunding(null)}
      />

      {active.isFetching && !active.isLoading && (
        <p className="text-center text-xs text-slate-400">Updating…</p>
      )}
    </Page>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof FileText
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
        active
          ? 'bg-white text-slate-900 card-shadow'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
