import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { assignmentsApi } from '../../api/campus'
import { Card, Page } from '../../components/layout/Page'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { getErrorMessage } from '../../lib/api'

export function StudentAssignments() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['assignments'],
    queryFn: assignmentsApi.list,
  })

  return (
    <Page title="Assignments" subtitle="Published work for the courses in which you are enrolled.">
      {isLoading && <Skeleton className="h-48" />}
      {error && <Card title="Could not load assignments"><p className="text-sm text-danger-600">{getErrorMessage(error)}</p></Card>}
      {!isLoading && !error && data.length === 0 && (
        <Card title="No assignments yet"><p className="text-sm text-slate-500">Your instructors have not published any assignments for your cohorts.</p></Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.map((assignment) => {
          const grade = assignment.grades?.[0]
          const overdue = new Date(assignment.deadline).getTime() < Date.now()
          return (
            <Card key={assignment.id} title={assignment.title}>
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary">{assignment.offering.course.courseCode}</Badge>
                <Badge tone={overdue ? 'danger' : 'neutral'}>
                  <CalendarClock className="mr-1 h-3 w-3" />
                  {new Date(assignment.deadline).toLocaleString()}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-600">{assignment.description || 'No additional instructions.'}</p>
              <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
                {grade ? (
                  <div className="flex items-start gap-2 text-success-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                    <div>
                      <p className="font-medium">{String(grade.score)} / {String(assignment.maxScore)}</p>
                      {grade.feedback && <p className="mt-1 text-slate-600">{grade.feedback}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500">Result not published · Maximum {String(assignment.maxScore)}</p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </Page>
  )
}
