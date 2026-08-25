import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CheckCheck,
  FlaskConical,
  Mail,
  MailOpen,
  UserCheck,
  UserX,
} from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { notificationsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import type { CampusNotification } from '../../types/campus'

/**
 * The staff inbox.
 *
 * ── Why staff have one at all ──────────────────────────────────────────────
 *
 * The reminder generator writes LECTURE_ADMIN_24H and LECTURE_ADMIN_30M rows
 * addressed to instructors, not only to students. Those were being generated
 * and delivered with nowhere in the web client to read them, which is the kind
 * of gap that looks like a missing feature and is actually a missing page.
 *
 * ── What the ACCOUNT_* rows are ────────────────────────────────────────────
 *
 * Approval and rejection notices, written in the same transaction as the
 * decision. They are addressed to the STUDENT, so a member of staff will not
 * normally see one here — they are listed in the legend below because knowing
 * the student was told is part of knowing the decision landed.
 */

const TYPE_META: Record<
  string,
  { label: string; tone: 'primary' | 'accent' | 'success' | 'danger' | 'neutral' }
> = {
  LECTURE_ADMIN_24H: { label: 'Lecture tomorrow', tone: 'primary' },
  LECTURE_ADMIN_30M: { label: 'Lecture soon', tone: 'accent' },
  LECTURE_STUDENT_10M: { label: 'Student reminder', tone: 'neutral' },
  ACCOUNT_APPROVED: { label: 'Account approved', tone: 'success' },
  ACCOUNT_REJECTED: { label: 'Registration rejected', tone: 'danger' },
}

export function Notifications() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const isSuperAdmin = user?.role === 'UNIVERSITY_SUPER_ADMIN'

  const {
    data: notifications = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['campus', 'notifications'],
    queryFn: () => notificationsApi.list({ limit: 50 }),
  })

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['campus', 'notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'notifications'] })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      invalidate()
      toast.success('All marked read')
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  return (
    <Page
      title="Notifications"
      subtitle="Lecture reminders addressed to you."
      actions={
        unreadCount > 0 ? (
          <Button
            variant="secondary"
            icon={CheckCheck}
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </Button>
        ) : undefined
      }
    >
      {unreadCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800">
          <BellRing className="h-4 w-4" />
          {unreadCount} unread
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {error && (
        <Card title="Could not load your inbox">
          <p className="text-sm text-slate-600">{getErrorMessage(error)}</p>
        </Card>
      )}

      {!isLoading && !error && notifications.length === 0 && (
        <Card title="Nothing here yet">
          <p className="text-sm text-slate-600">
            Reminders arrive 24 hours and 30 minutes before each lecture you
            teach. They are generated ahead of time, so an empty inbox usually
            means there is nothing on your timetable within the horizon.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onMarkRead={() => markRead.mutate(notification.id)}
          />
        ))}
      </div>

      {isSuperAdmin && <DevTools />}
    </Page>
  )
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: CampusNotification
  onMarkRead: () => void
}) {
  const meta = TYPE_META[notification.type] ?? {
    label: notification.type,
    tone: 'neutral' as const,
  }

  const unread = !notification.readAt

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between',
        unread ? 'border-primary-200 bg-primary-50/40' : 'border-slate-200'
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{notification.title}</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {notification.status === 'FAILED' && (
            <Badge tone="danger">Delivery failed</Badge>
          )}
        </div>

        <p className="mt-1 text-sm text-slate-600">{notification.body}</p>

        <p className="mt-2 text-xs text-slate-500">
          {notification.sentAt
            ? `Sent ${formatDateTime(notification.sentAt)}`
            : `Scheduled for ${formatDateTime(notification.scheduledFor)}`}
        </p>
      </div>

      <div className="shrink-0">
        {unread ? (
          <Button size="sm" variant="ghost" icon={Mail} onClick={onMarkRead}>
            Mark read
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <MailOpen className="h-4 w-4" />
            Read
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The simulation tools.
 *
 * Hidden outside a development build, and that is only the second line of
 * defence: the server unmounts these routes entirely unless `devToolsEnabled`,
 * which is forced off in production regardless of what the environment says, so
 * they 404 there like any unknown path. Where they do exist they are restricted
 * to a super admin, and simulation stays confined to the caller's own
 * university.
 */
function DevTools() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [lectureId, setLectureId] = useState('')

  if (!import.meta.env.DEV) return null

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'notifications'] })

  const run = async (
    label: string,
    action: () => Promise<Record<string, unknown>>
  ) => {
    try {
      const result = await action()
      invalidate()
      toast.success(`${label}: ${JSON.stringify(result)}`)
    } catch (caught) {
      toast.error(getErrorMessage(caught))
    }
  }

  return (
    <Card
      title="Simulation tools"
      description="Development only. These routes do not exist in production."
    >
      <div className="flex items-start gap-3 rounded-lg bg-warning-50 p-4">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
        <p className="text-sm text-warning-800">
          These create and deliver <em>real</em> reminders inside your own
          university. Useful for proving the pipeline end to end; not something
          to run casually against live data.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={UserCheck}
          onClick={() =>
            void run('Generated', () => notificationsApi.dev.generate())
          }
        >
          Generate upcoming
        </Button>

        <Button
          variant="secondary"
          icon={UserX}
          onClick={() =>
            void run('Dispatched', () => notificationsApi.dev.dispatch())
          }
        >
          Dispatch due now
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          label="Lecture schedule id"
          placeholder="uuid"
          wrapperClassName="flex-1"
          value={lectureId}
          onChange={(event) => setLectureId(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!lectureId}
          onClick={() =>
            void run('Simulated', () =>
              notificationsApi.dev.simulate(lectureId)
            )
          }
        >
          Bring its reminders forward
        </Button>
      </div>
    </Card>
  )
}
