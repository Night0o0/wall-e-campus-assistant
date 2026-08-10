import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import {
  useCreateSubscription,
  useUpdateSubscription,
  useOrganizations,
  usePlans,
} from '../../hooks/queries'
import { formatCurrency } from '../../lib/utils'
import type { BillingCycle, Subscription, SubscriptionStatus } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  subscription?: Subscription | null
}

const STATUSES: SubscriptionStatus[] = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
]

const emptyForm = {
  organizationId: '',
  planId: '',
  billingCycle: 'MONTHLY' as BillingCycle,
  status: 'TRIAL' as SubscriptionStatus,
  trialDays: 14,
}

export function SubscriptionFormModal({ open, onClose, subscription }: Props) {
  const isEdit = Boolean(subscription)
  const [form, setForm] = useState(emptyForm)

  const { data: plans } = usePlans()
  const { data: organizations } = useOrganizations({ limit: 100 })

  useEffect(() => {
    if (!open) return

    setForm(
      subscription
        ? {
            organizationId: subscription.organization?.id ?? '',
            planId: subscription.planId,
            billingCycle: subscription.billingCycle,
            status: subscription.status,
            trialDays: 0,
          }
        : emptyForm
    )
  }, [open, subscription])

  const create = useCreateSubscription(onClose)
  const update = useUpdateSubscription(onClose)
  const pending = create.isPending || update.isPending

  // Only organizations without a subscription can receive a new one.
  const availableOrganizations = organizations?.data.filter(
    (org) => !org.subscriptionId
  )

  const selectedPlan = plans?.find((plan) => plan.id === form.planId)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (isEdit && subscription) {
      update.mutate({
        id: subscription.id,
        data: {
          planId: form.planId,
          billingCycle: form.billingCycle,
          status: form.status,
        },
      })
      return
    }

    create.mutate({
      organizationId: form.organizationId,
      planId: form.planId,
      billingCycle: form.billingCycle,
      status: form.status,
      trialDays: form.status === 'TRIAL' ? form.trialDays : 0,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit subscription' : 'New subscription'}
      description={
        isEdit
          ? `Change the plan or status for ${subscription?.organization?.name ?? 'this organization'}.`
          : 'Assign a plan to an organization.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="subscription-form" loading={pending}>
            {isEdit ? 'Save changes' : 'Create subscription'}
          </Button>
        </>
      }
    >
      <form id="subscription-form" onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <Select
            label="Organization"
            required
            value={form.organizationId}
            onChange={(event) =>
              setForm({ ...form, organizationId: event.target.value })
            }
            hint={
              availableOrganizations?.length === 0
                ? 'Every organization already has a subscription.'
                : 'Only organizations without a subscription are listed.'
            }
          >
            <option value="">Select an organization…</option>
            {availableOrganizations?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </Select>
        )}

        <Select
          label="Plan"
          required
          value={form.planId}
          onChange={(event) => setForm({ ...form, planId: event.target.value })}
        >
          <option value="">Select a plan…</option>
          {plans?.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {formatCurrency(plan.monthlyPrice)}/mo
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Billing cycle"
            value={form.billingCycle}
            onChange={(event) =>
              setForm({ ...form, billingCycle: event.target.value as BillingCycle })
            }
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </Select>

          <Select
            label="Status"
            value={form.status}
            onChange={(event) =>
              setForm({
                ...form,
                status: event.target.value as SubscriptionStatus,
              })
            }
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </Select>
        </div>

        {!isEdit && form.status === 'TRIAL' && (
          <Input
            label="Trial length (days)"
            type="number"
            min={0}
            max={365}
            value={form.trialDays}
            onChange={(event) =>
              setForm({ ...form, trialDays: Number(event.target.value) })
            }
          />
        )}

        {selectedPlan && (
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              {selectedPlan.name} plan
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {formatCurrency(
                form.billingCycle === 'YEARLY'
                  ? selectedPlan.yearlyPrice
                  : selectedPlan.monthlyPrice
              )}{' '}
              per {form.billingCycle === 'YEARLY' ? 'year' : 'month'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Up to {selectedPlan.maxUsers.toLocaleString()} users ·{' '}
              {selectedPlan.maxRobots} robots ·{' '}
              {selectedPlan.maxCourses.toLocaleString()} courses
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
