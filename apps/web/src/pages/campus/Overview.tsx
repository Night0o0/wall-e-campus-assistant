import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  MonitorPlay,
  QrCode,
  UserCheck,
  Users,
} from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { StatsCard } from '../../components/ui/StatsCard'
import { StatsCardSkeleton } from '../../components/ui/Skeleton'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { campusAdminApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'

/** Reads a nested count without asserting a shape the server may extend. */
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/**
 * The university dashboard.
 *
 * Its most useful element is not a number: it is the approval queue link. A
 * student who has registered and not been approved cannot see a timetable, scan
 * a code, or open their material — they are sitting in front of a waiting
 * screen — so an unattended queue is the one thing here that is actively
 * costing somebody something.
 */
export function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['campus', 'overview'],
    queryFn: campusAdminApi.overview,
    refetchInterval: 60_000,
  })

  const { data: pending } = useQuery({
    queryKey: ['campus', 'pending-students', 'count'],
    queryFn: () => campusAdminApi.pendingStudents({ limit: 1 }),
  })

  const pendingCount = pending?.meta?.total ?? 0

  return (
    <Page title="Dashboard" subtitle="Your university at a glance.">
      {pendingCount > 0 && (
        <Card title="Registrations waiting">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">
                  {pendingCount}
                </span>{' '}
                {pendingCount === 1 ? 'student is' : 'students are'} waiting to be
                let in. Until somebody decides, they can fill in their profile and
                nothing else.
              </p>
            </div>
            <Link to="/pending-students">
              <Button icon={UserCheck}>Open the queue</Button>
            </Link>
          </div>
        </Card>
      )}

      {error && (
        <Card title="Could not load the dashboard">
          <p className="text-sm text-slate-600">{getErrorMessage(error)}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))
        ) : (
          <>
            <StatsCard
              title="Active students"
              value={String(num(data?.people?.activeStudents))}
              changeLabel={`${num(data?.people?.incompleteProfiles)} incomplete profiles`}
              icon={GraduationCap}
              iconColor="primary"
            />
            <StatsCard
              title="Teaching staff"
              value={String(num(data?.people?.staff))}
              changeLabel="across the university"
              icon={Users}
              iconColor="accent"
            />
            <StatsCard
              title="Courses"
              value={String(num(data?.academics?.courses))}
              changeLabel={`${num(data?.academics?.activeLectures)} active lectures`}
              icon={BookOpen}
              iconColor="success"
            />
            <StatsCard
              title="Open sessions"
              value={String(num(data?.sessions?.active))}
              changeLabel={`${num(data?.sessions?.today)} opened today`}
              icon={MonitorPlay}
              iconColor="warning"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Attendance this week">
          <dl className="space-y-3">
            <Row
              label="Sessions closed this week"
              value={num(data?.sessions?.closedThisWeek)}
            />
            <Row
              label="Scans recorded"
              value={num(data?.attendance?.scansThisWeek)}
            />
            <Row
              label="Average attendees per session"
              value={
                // Null, not zero, when nothing closed this week — an average
                // over no sessions is undefined, not "nobody came".
                data?.attendance?.averageAttendeesPerSession ?? '—'
              }
            />
          </dl>

          <p className="mt-4 text-xs text-slate-500">
            Every figure counts recorded attendance. A lecture nobody opened a
            session for leaves no record at all, so it is in neither the
            numerator nor the denominator.
          </p>
        </Card>

        <Card title="Jump to">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <QuickLink
              to="/timetable"
              icon={CalendarDays}
              label="Timetable"
              hint="Filter by year and department"
            />
            <QuickLink
              to="/sessions"
              icon={MonitorPlay}
              label="Sessions"
              hint="Live rosters and history"
            />
            <QuickLink
              to="/directory"
              icon={GraduationCap}
              label="Students & Staff"
              hint="Create accounts, reset passwords"
            />
            <QuickLink
              to="/courses"
              icon={QrCode}
              label="Course workspace"
              hint="Manage teaching and content"
            />
          </div>
        </Card>
      </div>
    </Page>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  )
}

function QuickLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string
  icon: typeof CalendarDays
  label: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100">
        <Icon className="h-5 w-5 text-primary-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="truncate text-xs text-slate-500">{hint}</p>
      </div>
    </Link>
  )
}

/** Kept beside the dashboard because it is the same data, filtered. */
export function Exports() {
  const { data, isLoading } = useQuery({
    queryKey: ['campus', 'overview'],
    queryFn: campusAdminApi.overview,
  })

  return (
    <Page
      title="Exports"
      subtitle="Roster spreadsheets for any course in your university."
    >
      <Card title="How exports work">
        <p className="text-sm text-slate-600">
          Every course row on the Courses page carries a download button, and as
          the university administrator you can export any of them — the
          assignment restriction that applies to teaching staff does not apply
          inside your own university.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link to="/courses">
            <Button icon={BookOpen}>Go to Courses</Button>
          </Link>
          {!isLoading && (
            <Badge tone="neutral">
              {num(data?.academics?.courses)} courses available
            </Badge>
          )}
        </div>
      </Card>

      <Card title="What is in the file">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>One row per student on the course, with their university ID.</li>
          <li>
            Attendance counted against <em>recorded</em> lectures — sessions that
            were actually opened, not slots on the timetable.
          </li>
          <li>
            The date the file was generated, on the campus clock rather than the
            server's.
          </li>
        </ul>
      </Card>
    </Page>
  )
}
