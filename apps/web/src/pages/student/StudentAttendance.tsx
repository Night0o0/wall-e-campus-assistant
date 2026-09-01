import { useQuery } from '@tanstack/react-query'
import { attendanceApi } from '../../api/campus'
import { Card, Page } from '../../components/layout/Page'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

export function StudentAttendance() {
  const summary = useQuery({
    queryKey: ['student', 'attendance', 'summary'],
    queryFn: attendanceApi.summary,
  })
  const history = useQuery({
    queryKey: ['student', 'attendance', 'history'],
    queryFn: () => attendanceApi.history(),
  })

  const loading = summary.isLoading || history.isLoading
  const error = summary.error ?? history.error

  return (
    <Page
      title="Attendance"
      subtitle="Your recorded attendance history and per-course summary."
    >
      {loading && <Skeleton className="h-72" />}

      {error && (
        <Card title="Could not load attendance">
          <p className="text-sm text-danger-600">{getErrorMessage(error)}</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              void summary.refetch()
              void history.refetch()
            }}
          >
            Try again
          </Button>
        </Card>
      )}

      {!loading && !error && summary.data && history.data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard label="Recorded lectures" value={summary.data.overall.recordedLectures} />
            <SummaryCard label="Attended" value={summary.data.overall.attended} />
            <SummaryCard label="Late" value={summary.data.overall.late} />
            <SummaryCard
              label="Attendance rate"
              value={
                summary.data.overall.attendanceRate === null
                  ? '—'
                  : `${summary.data.overall.attendanceRate}%`
              }
            />
          </div>

          <Card title="By subject">
            {summary.data.courses.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance has been recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {summary.data.courses.map((course) => (
                  <div
                    key={course.course?.id ?? 'ad-hoc'}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {course.course
                          ? `${course.course.courseCode} · ${course.course.courseName}`
                          : 'Ad-hoc sessions'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {course.attended} attended · {course.absent} absent · {course.late} late
                      </p>
                    </div>
                    <Badge tone="primary">
                      {course.attendanceRate === null ? 'No rate yet' : `${course.attendanceRate}%`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="History">
            {history.data.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance records yet.</p>
            ) : (
              <div className="space-y-3">
                {history.data.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {row.session.course
                          ? `${row.session.course.courseCode} · ${row.session.course.courseName}`
                          : row.session.title}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDateTime(row.scanTime)} · {row.session.room ?? 'No room recorded'}
                      </p>
                    </div>
                    <Badge
                      tone={
                        row.status === 'PRESENT'
                          ? 'success'
                          : row.status === 'LATE'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {row.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-5 card-shadow">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{label}</p>
    </div>
  )
}
