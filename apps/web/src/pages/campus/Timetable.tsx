import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Pencil, Plus } from 'lucide-react'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Field'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { campusAdminApi, coursesApi, schedulesApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { DAYS_OF_WEEK, type LectureSchedule } from '../../types/campus'

/**
 * The whole university's timetable.
 *
 * ── Deactivate, never delete ───────────────────────────────────────────────
 *
 * A lecture is the thing sessions, attendance and material all hang off. Hard
 * deleting one would orphan every attendance record taken against it, so the
 * only removal offered is `isActive: false` — the lecture stops generating
 * reminders and stops being openable, and everything already recorded survives.
 *
 * ── Clash detection lives on the server ────────────────────────────────────
 *
 * Two lectures in one room at one time, or one instructor in two places, are
 * refused by the create and update endpoints. This page shows the error rather
 * than trying to predict it: the check has to be authoritative, and a client
 * copy would eventually disagree with the server's.
 */
export function Timetable() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'UNIVERSITY_ADMIN'

  const [filters, setFilters] = useState({
    department: '',
    level: '',
    dayOfWeek: '',
    room: '',
  })
  const [editing, setEditing] = useState<LectureSchedule | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<LectureSchedule | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'schedules', filters],
    queryFn: () => schedulesApi.list({ ...filters, limit: 100 }),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'schedules'] })

  const deactivate = useMutation({
    mutationFn: (id: string) => schedulesApi.deactivate(id),
    onSuccess: () => {
      invalidate()
      toast.success('Lecture deactivated')
      setDeactivating(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const columns: Column<LectureSchedule>[] = [
    {
      key: 'course',
      header: 'Course',
      render: (lecture) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{lecture.course.courseCode}</p>
          <p className="truncate text-xs text-slate-500">
            {lecture.course.courseName}
          </p>
        </div>
      ),
    },
    {
      key: 'instructor',
      header: 'Instructor',
      render: (lecture) => (
        <span className="text-slate-600">{lecture.instructor?.fullName ?? '—'}</span>
      ),
    },
    {
      key: 'cohort',
      header: 'Cohort',
      render: (lecture) => (
        <div className="text-sm text-slate-600">
          <p>
            {lecture.department} · Level {lecture.level}
          </p>
          <p className="text-xs text-slate-500">
            Semester {lecture.semester}
            {lecture.section ? ` · Section ${lecture.section}` : ' · All sections'}
          </p>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      render: (lecture) => (
        <div className="text-sm text-slate-600">
          <p className="capitalize">{lecture.dayOfWeek.toLowerCase()}</p>
          <p className="text-xs text-slate-500">
            {lecture.startTime}–{lecture.endTime}
          </p>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Room',
      render: (lecture) => <span className="text-slate-600">{lecture.room}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (lecture) => (
        <Badge tone={lecture.isActive ? 'success' : 'neutral'}>
          {lecture.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (lecture) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              onClick={() => setEditing(lecture)}
            />
            {lecture.isActive && (
              <Button
                size="sm"
                variant="ghost"
                icon={Ban}
                title="Deactivate"
                onClick={() => setDeactivating(lecture)}
              />
            )}
          </div>
        ) : null,
    },
  ]

  return (
    <Page
      title={canManage ? 'Timetable Management' : 'Timetable'}
      subtitle={
        canManage
          ? 'Every lecture in your university.'
          : 'The timetable currently visible to your department scope.'
      }
      actions={
        canManage ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New lecture
          </Button>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(lecture) => lecture.id}
        isLoading={isLoading}
        error={error}
        meta={data?.meta}
        onRetry={() => void refetch()}
        emptyTitle="No lectures found"
        emptyMessage="Nothing matches the current filters."
        toolbar={
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
            <Input
              placeholder="Department"
              value={filters.department}
              onChange={(event) =>
                setFilters({ ...filters, department: event.target.value })
              }
              wrapperClassName="sm:w-48"
            />
            <Select
              value={filters.level}
              onChange={(event) =>
                setFilters({ ...filters, level: event.target.value })
              }
              wrapperClassName="sm:w-36"
            >
              <option value="">Any level</option>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>
                  Level {value}
                </option>
              ))}
            </Select>
            <Select
              value={filters.dayOfWeek}
              onChange={(event) =>
                setFilters({ ...filters, dayOfWeek: event.target.value })
              }
              wrapperClassName="sm:w-40"
            >
              <option value="">Any day</option>
              {DAYS_OF_WEEK.map((day) => (
                <option key={day} value={day}>
                  {day.charAt(0) + day.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Room"
              value={filters.room}
              onChange={(event) =>
                setFilters({ ...filters, room: event.target.value })
              }
              wrapperClassName="sm:w-32"
            />
          </div>
        }
      />

      {canManage && (
        <LectureFormModal
          open={creating || editing !== null}
          lecture={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            invalidate()
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      {canManage && (
        <ConfirmDialog
          open={deactivating !== null}
          title="Deactivate this lecture?"
          message="It stops generating reminders and no new session can be opened from it. Attendance already recorded against it is untouched — this is a soft delete precisely so that history survives."
          confirmLabel="Deactivate"
          destructive
          loading={deactivate.isPending}
          onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
          onClose={() => setDeactivating(null)}
        />
      )}
    </Page>
  )
}

function LectureFormModal({
  open,
  lecture,
  onClose,
  onSaved,
}: {
  open: boolean
  lecture: LectureSchedule | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [form, setForm] = useState({
    courseId: '',
    instructorId: '',
    faculty: '',
    department: '',
    level: '2',
    semester: '1',
    section: '',
    groupName: '',
    dayOfWeek: 'SUNDAY',
    startTime: '09:00',
    endTime: '11:00',
    room: '',
  })

  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = lecture?.id ?? 'new'

  if (open && seededFor !== key) {
    setSeededFor(key)
    setForm({
      // From the nested objects: the lecture projection carries no flat ids, so
      // reading `lecture.courseId` seeded an empty dropdown and an edit would
      // have submitted a lecture with no course and no instructor.
      courseId: lecture?.course?.id ?? '',
      instructorId: lecture?.instructor?.id ?? '',
      faculty: lecture?.faculty ?? '',
      department: lecture?.department ?? '',
      level: String(lecture?.level ?? 2),
      semester: String(lecture?.semester ?? 1),
      section: lecture?.section ?? '',
      groupName: lecture?.groupName ?? '',
      dayOfWeek: lecture?.dayOfWeek ?? 'SUNDAY',
      startTime: lecture?.startTime ?? '09:00',
      endTime: lecture?.endTime ?? '11:00',
      room: lecture?.room ?? '',
    })
  }

  const { data: courses } = useQuery({
    queryKey: ['campus', 'courses', 'all'],
    queryFn: () => coursesApi.list({}),
    enabled: open,
  })

  const { data: staff } = useQuery({
    queryKey: ['campus', 'users', 'staff'],
    queryFn: () => campusAdminApi.users({ role: 'INSTRUCTOR', limit: 100 }),
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        courseId: form.courseId,
        instructorId: form.instructorId,
        faculty: form.faculty,
        department: form.department,
        level: Number(form.level),
        semester: Number(form.semester),
        section: form.section || null,
        groupName: form.groupName || null,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        room: form.room,
      }

      return lecture
        ? schedulesApi.update(lecture.id, payload)
        : schedulesApi.create(payload)
    },
    onSuccess: () => {
      toast.success(lecture ? 'Lecture updated' : 'Lecture created')
      setSeededFor(null)
      onSaved()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setSeededFor(null)
        onClose()
      }}
      title={lecture ? 'Edit lecture' : 'New lecture'}
      description="A clash in the same room or for the same instructor is refused by the server."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Course"
            required
            value={form.courseId}
            onChange={(event) => setForm({ ...form, courseId: event.target.value })}
          >
            <option value="">Choose…</option>
            {(courses?.data ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.courseCode} — {course.courseName}
              </option>
            ))}
          </Select>

          <Select
            label="Instructor"
            required
            value={form.instructorId}
            onChange={(event) =>
              setForm({ ...form, instructorId: event.target.value })
            }
          >
            <option value="">Choose…</option>
            {/* The directory projection sends `profile: null` for staff, so
                there is no job title to prefix here. Names only, rather than a
                title that would silently never appear. */}
            {(staff?.data ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </Select>

          <Input
            label="Faculty"
            required
            value={form.faculty}
            onChange={(event) => setForm({ ...form, faculty: event.target.value })}
          />
          <Input
            label="Department"
            required
            value={form.department}
            onChange={(event) =>
              setForm({ ...form, department: event.target.value })
            }
          />

          <Select
            label="Level"
            value={form.level}
            onChange={(event) => setForm({ ...form, level: event.target.value })}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((value) => (
              <option key={value} value={value}>
                Level {value}
              </option>
            ))}
          </Select>

          <Select
            label="Semester"
            value={form.semester}
            onChange={(event) => setForm({ ...form, semester: event.target.value })}
          >
            <option value="1">First semester</option>
            <option value="2">Second semester</option>
          </Select>

          <Input
            label="Section"
            hint="Empty covers every section"
            value={form.section}
            onChange={(event) => setForm({ ...form, section: event.target.value })}
          />
          <Input
            label="Group"
            value={form.groupName}
            onChange={(event) => setForm({ ...form, groupName: event.target.value })}
          />

          <Select
            label="Day"
            value={form.dayOfWeek}
            onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}
          >
            {DAYS_OF_WEEK.map((day) => (
              <option key={day} value={day}>
                {day.charAt(0) + day.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>

          <Input
            label="Room"
            required
            value={form.room}
            onChange={(event) => setForm({ ...form, room: event.target.value })}
          />

          <Input
            label="Start time"
            type="time"
            required
            value={form.startTime}
            onChange={(event) => setForm({ ...form, startTime: event.target.value })}
          />
          <Input
            label="End time"
            type="time"
            required
            value={form.endTime}
            onChange={(event) => setForm({ ...form, endTime: event.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {lecture ? 'Save changes' : 'Create lecture'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
