import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Field'
import { SearchInput } from '../../components/ui/SearchInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { coursesApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../context/AuthContext'
import type { Course } from '../../types/campus'

/**
 * Courses.
 *
 * Two roles, one page, and the difference is what the server will let through
 * rather than what this file renders: an ADMIN sees the courses they are
 * assigned to or created and can export only those; a super admin sees and
 * edits every course in the university. Create, edit and delete are hidden for
 * an ADMIN because the endpoints would refuse them — showing a button that
 * always 403s is worse than not showing it.
 *
 * ── On `level` ─────────────────────────────────────────────────────────────
 *
 * A Course has no level of its own, and the filter here is not a column on the
 * table. The same subject can be taught to second and third years, so `level`
 * resolves through the active LectureSchedule rows instead. That is why it is a
 * filter and not a field on the form.
 */
export function Courses() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const canManage = user?.role === 'UNIVERSITY_SUPER_ADMIN'

  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [level, setLevel] = useState('')
  const [editing, setEditing] = useState<Course | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Course | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const params = { search: debouncedSearch, department, level }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'courses', params],
    queryFn: () => coursesApi.list(params),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'courses'] })

  const remove = useMutation({
    mutationFn: (id: string) => coursesApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success('Course deleted')
      setDeleting(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const download = async (course: Course) => {
    try {
      const { blob, filename } = await coursesApi.exportStudents(course.id)
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

  const columns: Column<Course>[] = [
    {
      key: 'course',
      header: 'Course',
      render: (course) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{course.courseCode}</p>
          <p className="truncate text-xs text-slate-500">{course.courseName}</p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (course) => (
        <span className="text-slate-600">{course.department ?? '—'}</span>
      ),
    },
    {
      key: 'semester',
      header: 'Semester',
      render: (course) => (
        <span className="text-slate-600">{course.semester ?? '—'}</span>
      ),
    },
    {
      key: 'credits',
      header: 'Credits',
      align: 'right',
      render: (course) => (
        <span className="text-slate-600">{course.credits ?? '—'}</span>
      ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      render: (course) => (
        <span className="text-slate-600">{course._count?.sessions ?? 0}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (course) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            title="Export the student roster"
            onClick={() => void download(course)}
          />
          {canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={Pencil}
                onClick={() => setEditing(course)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={() => setDeleting(course)}
              />
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <Page
      title={canManage ? 'Courses' : 'My Courses'}
      subtitle={
        canManage
          ? 'Every subject taught in your university.'
          : 'The subjects you are assigned to or created.'
      }
      actions={
        canManage ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New course
          </Button>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(course) => course.id}
        isLoading={isLoading}
        error={error}
        meta={data?.meta}
        onRetry={() => void refetch()}
        emptyTitle="No courses found"
        emptyMessage="Nothing matches the current filters."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search code or name…"
              className="sm:w-64"
            />
            <Input
              placeholder="Department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              wrapperClassName="sm:w-48"
            />
            <Select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              wrapperClassName="sm:w-40"
            >
              <option value="">Any level</option>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>
                  Level {value}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {canManage && (
        <CourseFormModal
          open={creating || editing !== null}
          course={editing}
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

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.courseCode ?? 'this course'}?`}
        message="Any material published against it goes too. Lectures and attendance already recorded for this course will refuse the delete rather than be silently removed."
        confirmLabel="Delete course"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Page>
  )
}

function CourseFormModal({
  open,
  course,
  onClose,
  onSaved,
}: {
  open: boolean
  course: Course | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [form, setForm] = useState({
    courseCode: '',
    courseName: '',
    description: '',
    credits: '',
    semester: '',
    department: '',
  })

  // Re-seed whenever the modal opens on a different course.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = course?.id ?? 'new'

  if (open && seededFor !== key) {
    setSeededFor(key)
    setForm({
      courseCode: course?.courseCode ?? '',
      courseName: course?.courseName ?? '',
      description: course?.description ?? '',
      credits: course?.credits ? String(course.credits) : '',
      semester: course?.semester ?? '',
      department: course?.department ?? '',
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        courseCode: form.courseCode,
        courseName: form.courseName,
        description: form.description || undefined,
        credits: form.credits ? Number(form.credits) : undefined,
        semester: form.semester || undefined,
        department: form.department || undefined,
      }

      return course
        ? coursesApi.update(course.id, payload)
        : coursesApi.create(payload)
    },
    onSuccess: () => {
      toast.success(course ? 'Course updated' : 'Course created')
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
      title={course ? `Edit ${course.courseCode}` : 'New course'}
      description="A subject taught in your university. Which years take it is decided by the timetable, not here."
    >
      <form onSubmit={submit} className="space-y-4" id="course-form">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Course code"
            required
            value={form.courseCode}
            onChange={(event) =>
              setForm({ ...form, courseCode: event.target.value })
            }
          />
          <Input
            label="Credits"
            type="number"
            min={0}
            value={form.credits}
            onChange={(event) => setForm({ ...form, credits: event.target.value })}
          />
        </div>

        <Input
          label="Course name"
          required
          value={form.courseName}
          onChange={(event) => setForm({ ...form, courseName: event.target.value })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Department"
            value={form.department}
            onChange={(event) =>
              setForm({ ...form, department: event.target.value })
            }
          />
          <Input
            label="Semester"
            value={form.semester}
            onChange={(event) => setForm({ ...form, semester: event.target.value })}
          />
        </div>

        <Input
          label="Description"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
