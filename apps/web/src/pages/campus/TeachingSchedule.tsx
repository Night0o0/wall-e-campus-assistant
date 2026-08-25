import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Play, User } from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { campusAdminApi, sessionsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { DAYS_OF_WEEK, type DayOfWeek, type LectureSchedule } from '../../types/campus'

const DAY_LABELS: Record<DayOfWeek, string> = {
  SUNDAY: 'Sunday',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
}

/** Sunday-first, matching the DayOfWeek enum's declaration order. */
const todayName = (): DayOfWeek => DAYS_OF_WEEK[new Date().getDay()]

/**
 * The instructor's own lectures, and the button that opens attendance for one.
 *
 * Opening a session from a lecture rather than from a blank form is the
 * difference between a session that knows its course, room and cohort and one
 * that knows nothing. An ad-hoc session addresses no cohort, so scanning into
 * it cannot be checked against one — which is exactly what
 * SCAN_ALLOW_UNLINKED_SESSIONS exists to permit, and what this page avoids
 * needing.
 */
export function TeachingSchedule() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [opening, setOpening] = useState<string | null>(null)

  const { data: schedule = [], isLoading, error } = useQuery({
    queryKey: ['campus', 'my-teaching-schedule'],
    queryFn: campusAdminApi.myTeachingSchedule,
  })

  const openSession = useMutation({
    mutationFn: (lecture: LectureSchedule) =>
      sessionsApi.create({
        title: `${lecture.course.courseCode} — ${lecture.course.courseName}`,
        lectureScheduleId: lecture.id,
      }),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['campus', 'sessions'] })
      toast.success('Attendance is open')
      // Straight to the code: the reason anybody presses this button is to put
      // a QR on the projector, and making them find the session first is a step
      // taken in front of a waiting lecture hall.
      navigate(`/sessions/${session.id}/qr`)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
    onSettled: () => setOpening(null),
  })

  const today = todayName()

  const byDay = DAYS_OF_WEEK.map((day) => ({
    day,
    lectures: schedule
      .filter((lecture) => lecture.dayOfWeek === day && lecture.isActive)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((group) => group.lectures.length > 0)

  return (
    <Page
      title="My Teaching Timetable"
      subtitle="The lectures you teach, and where attendance starts."
    >
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {error && (
        <Card title="Could not load your timetable">
          <p className="text-sm text-slate-600">{getErrorMessage(error)}</p>
        </Card>
      )}

      {!isLoading && !error && byDay.length === 0 && (
        <Card title="No lectures assigned">
          <p className="text-sm text-slate-600">
            You are not the instructor on any active lecture yet. Your university
            administrator assigns lectures from the timetable.
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {byDay.map(({ day, lectures }) => (
          <Card
            key={day}
            title={DAY_LABELS[day]}
            description={day === today ? 'Today' : undefined}
          >
            <div className="space-y-3">
              {lectures.map((lecture) => (
                <div
                  key={lecture.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {lecture.course.courseCode}
                      </span>
                      <span className="truncate text-slate-600">
                        {lecture.course.courseName}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {lecture.startTime}–{lecture.endTime}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {lecture.room}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-4 w-4" />
                        Level {lecture.level}
                        {lecture.section ? ` · Section ${lecture.section}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={day === today ? 'success' : 'neutral'}>
                      {lecture.department}
                    </Badge>
                    <Button
                      icon={Play}
                      size="sm"
                      loading={opening === lecture.id}
                      onClick={() => {
                        setOpening(lecture.id)
                        openSession.mutate(lecture)
                      }}
                    >
                      Open attendance
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Page>
  )
}
