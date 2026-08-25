import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, Download, QrCode, Users } from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatsCard } from '../../components/ui/StatsCard'
import { useToast } from '../../components/ui/Toast'
import { attendanceApi, coursesApi, sessionsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import type { AttendanceRow } from '../../types/campus'

const STATUS_TONES = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
} as const

/**
 * One session: who scanned, when, and the roster export.
 *
 * ── On the absence of anybody who did not scan ─────────────────────────────
 *
 * While a session is open this list is only the people who have scanned. There
 * is no "expected but missing" column, because until the roll is called there
 * is no such record: an ABSENT row is written by the absence sweep after the
 * session closes, and by nothing else. Showing a provisional "absent" for
 * somebody who is walking through the door would be inventing a fact about a
 * student, which is the one thing the attendance model refuses to do.
 */
export function SessionDetail() {
  const { id = '' } = useParams()
  const toast = useToast()

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['campus', 'session', id],
    queryFn: () => sessionsApi.get(id),
    enabled: Boolean(id),
  })

  const {
    data: attendance = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campus', 'session', id, 'attendance'],
    queryFn: () => attendanceApi.bySession(id),
    enabled: Boolean(id),
    // A roster that does not move while students are scanning looks broken.
    refetchInterval: session?.status === 'ACTIVE' ? 10_000 : false,
  })

  const { data: stats } = useQuery({
    queryKey: ['campus', 'session', id, 'stats'],
    queryFn: () => attendanceApi.sessionStats(id),
    enabled: Boolean(id),
  })

  const download = async () => {
    if (!session?.courseId) return

    try {
      const { blob, filename } = await coursesApi.exportStudents(session.courseId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      toast.error(getErrorMessage(caught))
    }
  }

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {row.student?.fullName ?? '—'}
          </p>
          <p className="truncate font-mono text-xs text-slate-500">
            {row.student?.universityId ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'scanTime',
      header: 'Scanned',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Clock className="h-4 w-4 text-slate-400" />
          {/* ABSENT rows carry no scan time — nobody scanned to produce them. */}
          {row.scanTime ? formatDateTime(row.scanTime) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'neutral'}>{row.status}</Badge>
      ),
    },
  ]

  const attended = attendance.filter((row) => row.status !== 'ABSENT').length
  const late = attendance.filter((row) => row.status === 'LATE').length

  return (
    <Page
      title={session?.title ?? 'Session'}
      subtitle={
        session?.course
          ? `${session.course.courseCode} · ${session.course.courseName}`
          : 'Ad-hoc session — no course behind it'
      }
      actions={
        <div className="flex gap-2">
          <Link to="/sessions">
            <Button variant="ghost" icon={ArrowLeft}>
              Back
            </Button>
          </Link>
          {session?.status === 'ACTIVE' && (
            <Link to={`/sessions/${id}/qr`}>
              <Button icon={QrCode}>Show code</Button>
            </Link>
          )}
          {session?.courseId && (
            <Button variant="secondary" icon={Download} onClick={download}>
              Export roster
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard
          title="Attended"
          value={String(attended)}
          changeLabel="scanned in"
          icon={Users}
          iconColor="success"
        />
        <StatsCard
          title="Late"
          value={String(late)}
          changeLabel="counts as attended"
          icon={Clock}
          iconColor="warning"
        />
        <StatsCard
          title="Status"
          value={session?.status === 'ACTIVE' ? 'Open' : 'Closed'}
          changeLabel={
            sessionLoading
              ? 'loading'
              : session?.startTime
                ? `since ${formatDateTime(session.startTime)}`
                : ''
          }
          icon={QrCode}
          iconColor={session?.status === 'ACTIVE' ? 'primary' : 'neutral' as 'primary'}
        />
      </div>

      {stats && (
        <Card title="Session statistics">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Turned up" value={stats.total} />
            <Stat label="On time" value={stats.present} />
            <Stat label="Late" value={stats.late} />
            <Stat label="Absent" value={stats.absent} />
          </dl>

          <p className="mt-4 text-xs text-slate-500">
            &ldquo;Turned up&rdquo; is present + late and excludes absences on
            purpose — it is what this figure has always meant. The cohort size
            is {stats.roll}. Absences are written by the sweep after the session
            closes, never by a student.
          </p>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={attendance}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyTitle="Nobody has scanned yet"
        emptyMessage={
          session?.status === 'ACTIVE'
            ? 'Put the code on screen and this list fills as students scan.'
            : 'This session closed with no attendance recorded.'
        }
      />
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-900">{value}</dd>
    </div>
  )
}
