import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, UserX } from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { campusAdminApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { formatDate } from '../../lib/utils'
import type { PendingStudent } from '../../types/campus'

/**
 * The approval queue.
 *
 * ── Why the whole profile is on the card ───────────────────────────────────
 *
 * Approving is a decision, and a decision needs something to decide on. A name
 * and an email address are not evidence that this person belongs in second-year
 * Mechatronics; faculty, department, level, section and group are. That is the
 * entire reason a PENDING student can sign in and fill their profile before
 * anybody looks at them — so the approver has something to check against.
 *
 * A profile still marked INCOMPLETE is called out rather than hidden. Approving
 * one is allowed and sometimes right, but the approver should know they are
 * doing it on less evidence than usual.
 */
export function PendingStudents() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState<PendingStudent | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'pending-students'],
    queryFn: () => campusAdminApi.pendingStudents({ limit: 50 }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['campus', 'pending-students'] })
    void queryClient.invalidateQueries({ queryKey: ['campus', 'overview'] })
  }

  const approve = useMutation({
    mutationFn: (id: string) => campusAdminApi.approveStudent(id),
    onSuccess: () => {
      invalidate()
      // The student is told in the same transaction as the approval, so this is
      // the whole notification: nothing else has to be sent by hand.
      toast.success('Student approved and notified')
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const reject = useMutation({
    mutationFn: (id: string) => campusAdminApi.rejectStudent(id),
    onSuccess: () => {
      invalidate()
      toast.success('Registration rejected')
      setRejecting(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const students = data?.data ?? []

  return (
    <Page
      title="Pending Students"
      subtitle="Registrations waiting for a decision."
    >
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {error && (
        <Card title="Could not load the queue">
          <p className="text-sm text-slate-600">{getErrorMessage(error)}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {!isLoading && !error && students.length === 0 && (
        <Card title="Nobody is waiting">
          <p className="text-sm text-slate-600">
            Every registration in your university has been dealt with. New
            self-registrations appear here as soon as they sign up.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {students.map((student) => {
          const profile = student.profile
          const incomplete = profile?.status !== 'COMPLETED'

          return (
            <Card key={student.id} title={student.fullName}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{student.universityId}</Badge>
                  <Badge tone={incomplete ? 'warning' : 'success'}>
                    {incomplete ? 'Profile incomplete' : 'Profile complete'}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {/* `registeredAt` — the queue projection's own field.
                        `createdAt` is absent, and rendered "Invalid Date". */}
                    Registered {formatDate(student.registeredAt)}
                  </span>
                </div>

                <p className="truncate text-sm text-slate-600">{student.email}</p>

                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                  <Detail label="Faculty" value={profile?.faculty} />
                  <Detail label="Department" value={profile?.department} />
                  <Detail label="Level" value={profile?.level} />
                  <Detail label="Semester" value={profile?.semester} />
                  <Detail label="Section" value={profile?.section} />
                  <Detail label="Group" value={profile?.groupName} />
                  <Detail label="Academic year" value={profile?.academicYear} />
                  <Detail label="Phone" value={profile?.phoneNumber} />
                </dl>

                {incomplete && (
                  <p className="text-xs text-warning-700">
                    This student has not finished their profile. You can still
                    approve them, but there is less to check them against.
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    icon={Check}
                    loading={approve.isPending && approve.variables === student.id}
                    onClick={() => approve.mutate(student.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    icon={UserX}
                    onClick={() => setRejecting(student)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <ConfirmDialog
        open={rejecting !== null}
        title={`Reject ${rejecting?.fullName ?? 'this registration'}?`}
        message={
          'The account is deactivated, not deleted — the university ID stays claimed so nobody else can register with it. The student is told their registration was not approved, and can no longer sign in.'
        }
        confirmLabel="Reject registration"
        destructive
        loading={reject.isPending}
        onConfirm={() => rejecting && reject.mutate(rejecting.id)}
        onClose={() => setRejecting(null)}
      />
    </Page>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value?: string | number | null
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="truncate font-medium text-slate-900">
        {value === null || value === undefined || value === '' ? '—' : value}
      </dd>
    </div>
  )
}
