import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'
import { useCreatePlan, useUpdatePlan } from '../../hooks/queries'
import type { Plan } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  plan?: Plan | null
}

const emptyForm = {
  name: '',
  description: '',
  monthlyPrice: 0,
  yearlyPrice: 0,
  maxUsers: 1000,
  maxRobots: 5,
  maxCourses: 100,
  features: '',
  isActive: true,
}

export function PlanFormModal({ open, onClose, plan }: Props) {
  const isEdit = Boolean(plan)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (!open) return

    setForm(
      plan
        ? {
            name: plan.name,
            description: plan.description ?? '',
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            maxUsers: plan.maxUsers,
            maxRobots: plan.maxRobots,
            maxCourses: plan.maxCourses,
            features: (plan.features ?? []).join('\n'),
            isActive: plan.isActive,
          }
        : emptyForm
    )
  }, [open, plan])

  const create = useCreatePlan(onClose)
  const update = useUpdatePlan(onClose)
  const pending = create.isPending || update.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    const payload = {
      ...form,
      features: form.features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }

    if (isEdit && plan) {
      update.mutate({ id: plan.id, data: payload })
      return
    }

    create.mutate(payload)
  }

  const number = (key: 'monthlyPrice' | 'yearlyPrice' | 'maxUsers' | 'maxRobots' | 'maxCourses') =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: Number(event.target.value) })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit plan' : 'New plan'}
      description="Pricing and limits for this subscription tier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" loading={pending}>
            {isEdit ? 'Save changes' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Pro"
        />

        <Textarea
          label="Description"
          rows={2}
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          placeholder="For universities running campus-wide attendance."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Monthly price (USD)"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.monthlyPrice}
            onChange={number('monthlyPrice')}
          />
          <Input
            label="Yearly price (USD)"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.yearlyPrice}
            onChange={number('yearlyPrice')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Max users"
            type="number"
            min={1}
            required
            value={form.maxUsers}
            onChange={number('maxUsers')}
          />
          <Input
            label="Max robots"
            type="number"
            min={0}
            required
            value={form.maxRobots}
            onChange={number('maxRobots')}
          />
          <Input
            label="Max courses"
            type="number"
            min={1}
            required
            value={form.maxCourses}
            onChange={number('maxCourses')}
          />
        </div>

        <Textarea
          label="Features"
          rows={5}
          value={form.features}
          onChange={(event) => setForm({ ...form, features: event.target.value })}
          placeholder={'QR attendance\nAdvanced analytics\nPriority support'}
          hint="One feature per line"
        />

        <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-4">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm({ ...form, isActive: event.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-slate-700">
            Active — available for new subscriptions
          </span>
        </label>
      </form>
    </Modal>
  )
}
