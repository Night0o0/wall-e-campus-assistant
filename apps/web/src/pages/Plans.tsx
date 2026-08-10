import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, Users, Bot, BookOpen } from 'lucide-react'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PlanFormModal } from '../components/billing/PlanFormModal'
import { usePlans, useDeletePlan } from '../hooks/queries'
import { formatCurrency, formatNumber } from '../lib/utils'
import type { Plan } from '../types/api'

export function Plans() {
  const { data: plans, isLoading } = usePlans()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)

  const deletePlan = useDeletePlan(() => setDeleting(null))

  return (
    <Page
      title="Subscription Plans"
      subtitle="What you sell, and what each tier includes."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          New Plan
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-xl bg-white p-6 card-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {plan.name}
                  </h3>
                  {!plan.isActive && (
                    <Badge tone="neutral" className="mt-1">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(plan)}
                    aria-label={`Edit ${plan.name}`}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleting(plan)}
                    aria-label={`Delete ${plan.name}`}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">
                  {formatCurrency(plan.monthlyPrice)}
                </span>
                <span className="text-sm text-slate-500">/month</span>
                <p className="mt-1 text-sm text-slate-500">
                  or {formatCurrency(plan.yearlyPrice)}/year
                </p>
              </div>

              {plan.description && (
                <p className="mt-4 text-sm text-slate-600">{plan.description}</p>
              )}

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <Limit
                  icon={Users}
                  label={`${formatNumber(plan.maxUsers)} users`}
                />
                <Limit
                  icon={Bot}
                  label={`${plan.maxRobots} robot${plan.maxRobots === 1 ? '' : 's'}`}
                />
                <Limit
                  icon={BookOpen}
                  label={`${formatNumber(plan.maxCourses)} courses`}
                />
              </div>

              {plan.features && plan.features.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                      <span className="text-sm text-slate-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-900">
                    {plan._count.subscriptions}
                  </span>{' '}
                  subscription{plan._count.subscriptions === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white px-6 py-20 text-center card-shadow">
          <p className="font-medium text-slate-900">No plans yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first subscription plan to start selling.
          </p>
          <Button icon={Plus} className="mt-4" onClick={() => setCreating(true)}>
            New Plan
          </Button>
        </div>
      )}

      <PlanFormModal open={creating} onClose={() => setCreating(false)} />
      <PlanFormModal
        open={Boolean(editing)}
        plan={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete plan"
        message={`Delete the ${deleting?.name} plan? Plans with existing subscriptions can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        destructive
        loading={deletePlan.isPending}
        onConfirm={() => deleting && deletePlan.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Page>
  )
}

function Limit({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  )
}
