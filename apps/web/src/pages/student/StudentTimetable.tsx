import { useQuery } from '@tanstack/react-query'
import { studentsApi } from '../../api/campus'
import { Card, Page } from '../../components/layout/Page'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { getErrorMessage } from '../../lib/api'

export function StudentTimetable() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student', 'timetable'],
    queryFn: studentsApi.schedule,
  })

  return (
    <Page
      title="Timetable"
      subtitle="Lectures derived from your stored academic profile and active enrollment scope."
    >
      {isLoading && <Skeleton className="h-64" />}

      {error && (
        <Card title="Could not load your timetable">
          <p className="text-sm text-danger-600">{getErrorMessage(error)}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {!isLoading && !error && data && (
        <>
          <Card title="Current scope">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{data.criteria.department}</Badge>
              <Badge tone="neutral">Level {data.criteria.level}</Badge>
              <Badge tone="neutral">{data.criteria.semesterLabel ?? 'Semester'}</Badge>
              <Badge tone="neutral">Section {data.criteria.section}</Badge>
            </div>
          </Card>

          {data.schedules.length === 0 ? (
            <Card title="No lectures found">
              <p className="text-sm text-slate-500">
                Nothing is currently scheduled for the profile you have stored.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.schedules.map((lecture) => (
                <Card
                  key={lecture.id}
                  title={`${lecture.course.courseCode} · ${lecture.course.courseName}`}
                >
                  <div className="space-y-2 text-sm text-slate-600">
                    <p className="capitalize">
                      {lecture.dayOfWeek.toLowerCase()} · {lecture.startTime}–{lecture.endTime}
                    </p>
                    <p>
                      {lecture.department} · Level {lecture.level}
                      {lecture.section ? ` · Section ${lecture.section}` : ''}
                    </p>
                    <p>{lecture.room}</p>
                    <p>{lecture.instructor.fullName}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  )
}
