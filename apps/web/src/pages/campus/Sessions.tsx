import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QrCode, Square, Users } from 'lucide-react'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { sessionsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import type { CampusSession } from '../../types/campus'

/**
 * Attendance sessions.
 *
 * One page for two roles, because the endpoint is one endpoint: GET /sessions
 * returns the caller's own sessions for an ADMIN and the whole university's for
 * a super admin. The server decides; this page renders what it is given.
 *
 * There is no "open a session" button here on purpose. A session is opened from
 * the lecture it belongs to — see My Teaching Timetable — so that it carries a
 * course, a room and a cohort. A session opened from a blank form here would be
 * ad hoc, and an ad-hoc session addresses no cohort at all.
 */
export function Sessions() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [closing, setClosing] = useState<CampusSession | null>(null)

  const {
    data: sessions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campus', 'sessions'],
    queryFn: sessionsApi.list,
    // An open session's attendee count moves while somebody is watching it.
    refetchInterval: 15_000,
  })

  const close = useMutation({
    mutationFn: (id: string) => sessionsApi.close(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campus', 'sessions'] })
      toast.success('Session closed')
      setClosing(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const isSuperAdmin = user?.role === 'UNIVERSITY_SUPER_ADMIN'

  const columns: Column<CampusSession>[] = [
    {
      key: 'title',
      header: 'Session',
      render: (session) => (
        <div className="min-w-0">
          <Link
            to={`/sessions/${session.id}`}
            className="font-medium text-slate-900 hover:text-primary-600"
          >
            {session.title}
          </Link>
          <p className="truncate text-xs text-slate-500">
            {session.course
              ? `${session.course.courseCode} · ${session.course.courseName}`
              : 'Ad-hoc session — no course'}
          </p>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Room',
      render: (session) => (
        <span className="text-slate-600">
          {session.room ?? session.lectureSchedule?.room ?? '—'}
        </span>
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            key: 'instructor',
            header: 'Opened by',
            render: (session: CampusSession) => (
              <span className="text-slate-600">
                {session.createdBy?.fullName ?? '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'started',
      header: 'Started',
      render: (session) => (
        <span className="text-slate-600">{formatDateTime(session.startTime)}</span>
      ),
    },
    {
      key: 'attended',
      header: 'Attended',
      align: 'right',
      render: (session) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
          <Users className="h-4 w-4 text-slate-400" />
          {session._count?.attendances ?? 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (session) => (
        <Badge tone={session.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {session.status === 'ACTIVE' ? 'Open' : 'Closed'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (session) => (
        <div className="flex justify-end gap-2">
          {session.status === 'ACTIVE' && (
            <>
              <Link to={`/sessions/${session.id}/qr`}>
                <Button size="sm" variant="secondary" icon={QrCode}>
                  Show code
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                icon={Square}
                onClick={() => setClosing(session)}
              >
                Close
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <Page
      title="Sessions"
      subtitle={
        isSuperAdmin
          ? 'Every attendance session in your university.'
          : 'The attendance sessions you have opened.'
      }
    >
      <DataTable
        columns={columns}
        rows={sessions}
        rowKey={(session) => session.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyTitle="No sessions yet"
        emptyMessage="Open attendance from a lecture on your timetable to start one."
      />

      <ConfirmDialog
        open={closing !== null}
        title="Close this session?"
        message={
          'Students can no longer scan into it. Anyone on the cohort who did not scan will be marked absent when the roll is called — this is recorded as a manual close, so an audit can tell it apart from one the sweep closed.'
        }
        confirmLabel="Close session"
        destructive
        loading={close.isPending}
        onConfirm={() => closing && close.mutate(closing.id)}
        onClose={() => setClosing(null)}
      />
    </Page>
  )
}
