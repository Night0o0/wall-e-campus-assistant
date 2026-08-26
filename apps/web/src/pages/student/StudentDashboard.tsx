import { useQuery } from '@tanstack/react-query'
import { BookOpen, CalendarClock, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { assignmentsApi } from '../../api/campus'
import { Card, Page } from '../../components/layout/Page'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../lib/api'

export function StudentDashboard() {
  const { user } = useAuth()
  const assignments = useQuery({
    queryKey: ['assignments'],
    queryFn: assignmentsApi.list,
  })
  const upcoming = (assignments.data ?? []).filter(
    (assignment) => new Date(assignment.deadline).getTime() >= Date.now()
  )

  return (
    <Page
      title={`Welcome, ${user?.fullName?.split(' ')[0] ?? 'student'}`}
      subtitle="Your courses, deadlines and published results in one place."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={CalendarClock} label="Upcoming assignments" value={upcoming.length} />
        <Metric
          icon={GraduationCap}
          label="Published results"
          value={(assignments.data ?? []).filter((item) => item.grades?.length).length}
        />
        <Metric icon={BookOpen} label="Active courses" value={new Set(upcoming.map((a) => a.offering.id)).size} />
      </div>

      <Card title="Next deadlines">
        {assignments.isLoading && <Skeleton className="h-28" />}
        {assignments.error && (
          <p className="text-sm text-danger-600">{getErrorMessage(assignments.error)}</p>
        )}
        {!assignments.isLoading && !assignments.error && upcoming.length === 0 && (
          <p className="text-sm text-slate-500">No published assignments are due.</p>
        )}
        <div className="space-y-3">
          {upcoming.slice(0, 5).map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
              <div>
                <p className="font-medium text-slate-900">{assignment.title}</p>
                <p className="text-sm text-slate-500">
                  {assignment.offering.course.courseCode} · {assignment.offering.course.courseName}
                </p>
              </div>
              <time className="shrink-0 text-sm text-slate-600">
                {new Date(assignment.deadline).toLocaleDateString()}
              </time>
            </div>
          ))}
        </div>
        <Link to="/assignments" className="mt-4 inline-block text-sm font-medium text-primary-600">
          View all assignments
        </Link>
      </Card>
    </Page>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 card-shadow">
      <Icon className="h-5 w-5 text-primary-600" />
      <p className="mt-4 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}
