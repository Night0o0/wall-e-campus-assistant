import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Users,
  BookOpen,
  CalendarClock,
  CreditCard,
  AlertCircle,
} from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { SummaryTile } from '../components/ui/SummaryTile'
import { Skeleton } from '../components/ui/Skeleton'
import { Badge, StatusBadge, ROLE_LABELS } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useOrganization } from '../hooks/queries'
import { billingEnabled } from '../lib/features'
import {
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelative,
} from '../lib/utils'
import type { UserRole } from '../types/api'

export function OrganizationDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: org, isLoading, error, refetch } = useOrganization(id)

  if (error) {
    return (
      <Page title="Organization">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-20 text-center card-shadow">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
            <AlertCircle className="h-6 w-6 text-danger-600" />
          </div>
          <p className="font-medium text-slate-900">Organization not found</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
            <Link to="/organizations">
              <Button size="sm">Back to list</Button>
            </Link>
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page
      title={org?.name ?? 'Organization'}
      subtitle={org ? `Code ${org.code}` : undefined}
      actions={
        <Link to="/organizations">
          <Button variant="secondary" icon={ArrowLeft}>
            Back
          </Button>
        </Link>
      }
    >
      {isLoading || !org ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <div
            className={cn(
              'grid grid-cols-1 gap-6 sm:grid-cols-2',
              billingEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
            )}
          >
            <SummaryTile
              icon={Users}
              label="Users"
              value={formatNumber(org._count.users)}
              tone="primary"
            />
            <SummaryTile
              icon={BookOpen}
              label="Courses"
              value={formatNumber(org._count.courses)}
              tone="accent"
            />
            <SummaryTile
              icon={CalendarClock}
              label="Sessions"
              value={formatNumber(org._count.sessions)}
              tone="success"
            />
            {billingEnabled && (
              <SummaryTile
                icon={CreditCard}
                label="Lifetime Revenue"
                value={formatCurrency(org.revenue)}
                tone="warning"
              />
            )}
          </div>

          <div
            className={cn(
              'grid grid-cols-1 gap-6',
              billingEnabled && 'lg:grid-cols-3'
            )}
          >
            <Card
              className={cn(billingEnabled && 'lg:col-span-2')}
              title="Details"
            >
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail icon={Building2} label="Name" value={org.name} />
                <Detail icon={Building2} label="Code" value={org.code} />
                <Detail icon={Mail} label="Email" value={org.email} />
                <Detail icon={Phone} label="Phone" value={org.phone} />
                <Detail icon={Globe} label="Website" value={org.website} link />
                <Detail icon={MapPin} label="Address" value={org.address} />
                <Detail
                  icon={CalendarClock}
                  label="Joined"
                  value={formatDate(org.createdAt)}
                />
              </dl>

              {org.userBreakdown && (
                <div className="mt-6 border-t border-slate-200 pt-6">
                  <h4 className="text-sm font-medium text-slate-700">
                    Users by role
                  </h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(org.userBreakdown).map(([role, count]) => (
                      <Badge key={role} tone="neutral">
                        {ROLE_LABELS[role as UserRole] ?? role}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {billingEnabled && (
            <Card title="Subscription">
              {org.subscription ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Plan</span>
                    <Badge tone="primary">{org.subscription.plan.name}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <StatusBadge status={org.subscription.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Billing</span>
                    <span className="text-sm font-medium text-slate-900">
                      {org.subscription.billingCycle === 'YEARLY'
                        ? 'Yearly'
                        : 'Monthly'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Price</span>
                    <span className="text-sm font-medium text-slate-900">
                      {formatCurrency(
                        org.subscription.billingCycle === 'YEARLY'
                          ? org.subscription.plan.yearlyPrice
                          : org.subscription.plan.monthlyPrice
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Renews</span>
                    <span className="text-sm font-medium text-slate-900">
                      {formatRelative(org.subscription.currentPeriodEnd)}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <Link to="/subscriptions">
                      <Button variant="secondary" size="sm" className="w-full">
                        Manage subscription
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-500">
                    This organization has no subscription.
                  </p>
                  <Link to="/subscriptions" className="mt-4 inline-block">
                    <Button size="sm">Assign a plan</Button>
                  </Link>
                </div>
              )}
            </Card>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to={`/users?organizationId=${org.id}`}>
              <Button variant="secondary" icon={Users}>
                View users
              </Button>
            </Link>
            {billingEnabled && (
              <Link to={`/invoices?organizationId=${org.id}`}>
                <Button variant="secondary" icon={CreditCard}>
                  View invoices
                </Button>
              </Link>
            )}
          </div>
        </>
      )}
    </Page>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
  link = false,
}: {
  icon: typeof Mail
  label: string
  value: string | null
  link?: boolean
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">
        {value ? (
          link ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  )
}
