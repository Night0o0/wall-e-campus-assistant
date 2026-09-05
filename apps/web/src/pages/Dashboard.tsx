import { Link } from 'react-router-dom'
import {
  Building2,
  Users as UsersIcon,
  GraduationCap,
  CalendarClock,
  AlertCircle,
} from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { StatsCard } from '../components/ui/StatsCard'
import { StatsCardSkeleton } from '../components/ui/Skeleton'
import { Button } from '../components/ui/Button'
import { useOverview } from '../hooks/queries'
import {
  formatDate,
  formatNumber,
} from '../lib/utils'

export function Dashboard() {
  const { data, isLoading, error, refetch } = useOverview()

  if (error) {
    return (
      <Page title="Dashboard">
        <ErrorState onRetry={() => refetch()} />
      </Page>
    )
  }

  return (
    <Page
      title="Dashboard"
      subtitle="Platform health at a glance."
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))
        ) : (
          <>
            <StatsCard
              title="Organizations"
              value={formatNumber(data.totals.organizations)}
              change={data.changes.organizations}
              icon={Building2}
              iconColor="primary"
            />
            <StatsCard
              title="Total Users"
              value={formatNumber(data.totals.users)}
              change={data.changes.users}
              icon={UsersIcon}
              iconColor="accent"
            />
            <StatsCard
              title="Students"
              value={formatNumber(data.totals.students)}
              change={data.changes.students}
              icon={GraduationCap}
              iconColor="success"
            />
            <StatsCard
              title="Sessions"
              value={formatNumber(data.totals.sessions)}
              changeLabel={`${formatNumber(data.totals.courses)} courses across the platform`}
              icon={CalendarClock}
              iconColor="warning"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Top Organizations"
          description="Largest universities by user count"
        >
          {isLoading || !data ? null : data.topOrganizations.length === 0 ? (
            <EmptyState message="No organizations yet." />
          ) : (
            <div className="space-y-4">
              {data.topOrganizations.map((org, index) => (
                <div key={org.id} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {index + 1}. {org.name}
                    </p>
                    <p className="text-xs text-slate-500">{org.code}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm text-slate-600">
                    <p>{formatNumber(org.users)} users</p>
                    <p>{formatNumber(org.courses)} courses · {formatNumber(org.sessions)} sessions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Recently Added"
          description="Newest organizations on the platform"
          actions={
            <Link
              to="/organizations"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          }
        >
          {isLoading || !data ? null : data.recentOrganizations.length === 0 ? (
            <EmptyState message="No organizations yet." />
          ) : (
            <div className="space-y-4">
              {data.recentOrganizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Building2 className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{org.name}</p>
                      <p className="text-xs text-slate-500">
                        {org.code} · joined {formatDate(org.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm text-slate-600">
                    <p>{formatNumber(org.users)} users</p>
                    <p>{formatNumber(org.courses)} courses</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-20 text-center card-shadow">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
        <AlertCircle className="h-6 w-6 text-danger-600" />
      </div>
      <div>
        <p className="font-medium text-slate-900">Couldn't load dashboard data</p>
        <p className="mt-1 text-sm text-slate-500">
          Check that the API server is running, then try again.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
