import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Textarea } from '../ui/Field'
import { useCreateInvoice, useUpdateInvoice, useOrganizations } from '../../hooks/queries'
import { formatCurrency } from '../../lib/utils'
import type { Invoice, InvoiceStatus } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  invoice?: Invoice | null
}

const STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']

const inTwoWeeks = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

const emptyForm = {
  organizationId: '',
  amount: 0,
  tax: 0,
  status: 'DRAFT' as InvoiceStatus,
  dueDate: inTwoWeeks(),
  notes: '',
}

export function InvoiceFormModal({ open, onClose, invoice }: Props) {
  const isEdit = Boolean(invoice)
  const [form, setForm] = useState(emptyForm)

  const { data: organizations } = useOrganizations({ limit: 100 })

  useEffect(() => {
    if (!open) return

    setForm(
      invoice
        ? {
            organizationId: invoice.organizationId,
            amount: invoice.amount,
            tax: invoice.tax,
            status: invoice.status,
            dueDate: invoice.dueDate.slice(0, 10),
            notes: invoice.notes ?? '',
          }
        : { ...emptyForm, dueDate: inTwoWeeks() }
    )
  }, [open, invoice])

  const create = useCreateInvoice(onClose)
  const update = useUpdateInvoice(onClose)
  const pending = create.isPending || update.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (isEdit && invoice) {
      update.mutate({
        id: invoice.id,
        data: {
          amount: form.amount,
          tax: form.tax,
          status: form.status,
          dueDate: form.dueDate,
          notes: form.notes,
        },
      })
      return
    }

    create.mutate(form)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${invoice?.invoiceNumber}` : 'New invoice'}
      description={
        isEdit
          ? 'Update the amount, due date or status.'
          : 'Issue an invoice to an organization.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={pending}>
            {isEdit ? 'Save changes' : 'Create invoice'}
          </Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <Select
            label="Organization"
            required
            value={form.organizationId}
            onChange={(event) =>
              setForm({ ...form, organizationId: event.target.value })
            }
          >
            <option value="">Select an organization…</option>
            {organizations?.data.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </Select>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Amount (USD)"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.amount}
            onChange={(event) =>
              setForm({ ...form, amount: Number(event.target.value) })
            }
          />
          <Input
            label="Tax (USD)"
            type="number"
            min={0}
            step="0.01"
            value={form.tax}
            onChange={(event) =>
              setForm({ ...form, tax: Number(event.target.value) })
            }
          />
        </div>

        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(form.amount + form.tax)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Due date"
            type="date"
            required
            value={form.dueDate}
            onChange={(event) =>
              setForm({ ...form, dueDate: event.target.value })
            }
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as InvoiceStatus })
            }
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Notes"
          rows={3}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Pro plan — monthly billing"
        />
      </form>
    </Modal>
  )
}
