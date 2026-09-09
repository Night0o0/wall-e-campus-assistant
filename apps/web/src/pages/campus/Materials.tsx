import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { coursesApi, materialsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import type {
  CourseMaterial,
  CourseSummary,
  StudentMaterials,
} from '../../types/campus'

/**
 * Google Drive links, addressed to a cohort.
 *
 * ── The two ways to publish, and why an INSTRUCTOR only gets one ────────────────
 *
 * An instructor publishes by picking one of THEIR OWN lectures. The server
 * copies the academic address — faculty, department, level, semester, section —
 * off that lecture, and doing so is simultaneously the proof that they teach the
 * cohort they are publishing to. Naming a cohort directly is refused for an
 * INSTRUCTOR, because that parameter is precisely the one through which an
 * instructor could address a year they have nothing to do with.
 *
 * A super admin administers the whole university and may legitimately publish
 * for a cohort nobody has assigned them to, so they get the explicit form.
 *
 * ── One row per audience ───────────────────────────────────────────────────
 *
 * The same course taught to level 2 and level 3 needs two links. But a link
 * with no section covers EVERY section of its cohort — so an instructor
 * teaching A, B and C out of one folder adds one row, not three.
 *
 * ── The cohort cannot be edited ────────────────────────────────────────────
 *
 * Only the title, the URL and the active flag. Re-addressing a link to a
 * different year is not an edit, it is a different link, and silently moving
 * one out from under the students already using it is worse than making
 * somebody add a new row.
 */
export function Materials() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const isStudent = user?.role === 'STUDENT'
  const isSuperAdmin = user?.role === 'UNIVERSITY_ADMIN'
  const canPublish = user?.role === 'INSTRUCTOR' || user?.role === 'UNIVERSITY_ADMIN'

  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState<CourseMaterial | null>(null)
  const [withdrawing, setWithdrawing] = useState<CourseMaterial | null>(null)

  /**
   * Withdrawal is a soft delete and the row is deliberately kept, but the
   * server defaults to active and this page never asked for anything else - so
   * a withdrawn link vanished and could not be brought back from the UI (D-7).
   */
  const [status, setStatus] = useState<'active' | 'withdrawn' | 'all'>('active')

  const staffMaterials = useQuery({
    queryKey: ['campus', 'materials', status],
    queryFn: () => materialsApi.list({ status }),
    enabled: !isStudent,
  })

  const studentMaterials = useQuery({
    queryKey: ['student', 'materials'],
    queryFn: materialsApi.mine,
    enabled: isStudent,
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'materials'] })

  /**
   * Bring a withdrawn link back.
   *
   * The row was always kept for exactly this, but with no way to SEE a
   * withdrawn link there was no way to reach this either (D-7).
   */
  const reactivate = useMutation({
    mutationFn: (id: string) => materialsApi.update(id, { isActive: true }),
    onSuccess: () => {
      invalidate()
      toast.success('Link restored')
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const withdraw = useMutation({
    mutationFn: (id: string) => materialsApi.deactivate(id),
    onSuccess: () => {
      invalidate()
      toast.success('Link withdrawn')
      setWithdrawing(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  /** Grouped the way the page reads: a list of subjects, each with its links. */
  const isLoading = isStudent ? studentMaterials.isLoading : staffMaterials.isLoading
  const error = isStudent ? studentMaterials.error : staffMaterials.error

  const byCourse = useMemo(() => {
    if (isStudent) {
      const response = studentMaterials.data as StudentMaterials | undefined
      return (response?.courses ?? []).map((group) => ({
        label: `${group.course.courseCode} — ${group.course.courseName}`,
        rows: group.materials.map((material) => ({
          ...material,
          courseId: group.course.id,
          course: group.course,
          faculty: response?.cohort.faculty ?? '',
          department: response?.cohort.department ?? '',
          level: response?.cohort.level ?? 0,
          semester: response?.cohort.semester ?? 0,
          section: response?.cohort.section ?? undefined,
          addedById: material.addedBy.id,
          isActive: true,
        })),
      }))
    }

    const materials = (staffMaterials.data as CourseMaterial[] | undefined) ?? []
    const groups = new Map<string, { label: string; rows: Array<CourseMaterial & { createdAt?: string }> }>()

    for (const material of materials) {
      const key = material.courseId
      const label = material.course
        ? `${material.course.courseCode} — ${material.course.courseName}`
        : 'Unknown course'

      if (!groups.has(key)) groups.set(key, { label, rows: [] })
      groups.get(key)!.rows.push(material)
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [isStudent, staffMaterials.data, studentMaterials.data])

  return (
    <Page
      title="Course Material"
      subtitle={
        isStudent
          ? 'Links published for the courses in your own cohort and enrollment scope.'
          : isSuperAdmin
          ? 'Every link in your university, for any cohort.'
          : 'The links you publish for the subjects you teach.'
      }
      actions={
        canPublish ? (
          <div className="flex items-center gap-2">
          {/*
            Withdrawn links are kept so they can be restored; without this
            control there was no way to see one, so the Withdrawn badge and the
            restore path were both unreachable (D-7).
          */}
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as 'active' | 'withdrawn' | 'all')
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            aria-label="Filter by status"
          >
            <option value="active">Active</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="all">All</option>
          </select>

          <Button icon={Plus} onClick={() => setPublishing(true)}>
            Publish a link
          </Button>
          </div>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {error && (
        <Card title="Could not load material">
          <p className="text-sm text-slate-600">{getErrorMessage(error)}</p>
        </Card>
      )}

      {!isLoading && !error && byCourse.length === 0 && (
        <Card title="Nothing published yet">
          <p className="text-sm text-slate-600">
            {isStudent
              ? 'Your instructors have not published any visible material for your cohort yet.'
              : 'Publish a Google Drive link and every student in the cohort it is addressed to will see it under that subject.'}
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {byCourse.map((group) => (
          <Card key={group.label} title={group.label}>
            <div className="space-y-3">
              {group.rows.map((material) => (
                <div
                  key={material.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {material.title}
                      </span>
                      {!material.isActive && <Badge tone="neutral">Withdrawn</Badge>}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="primary">
                        Level {material.level} · Semester {material.semester}
                      </Badge>
                      <Badge tone="neutral">
                        {material.section
                          ? `Section ${material.section}`
                          : 'All sections'}
                      </Badge>
                      <span>{material.department}</span>
                      {material.addedBy && <span>· {material.addedBy.fullName}</span>}
                    </div>

                    <a
                      href={material.driveUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1.5 truncate text-sm text-primary-600 hover:text-primary-700"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span className="truncate">{material.driveUrl}</span>
                    </a>
                  </div>

                  {canPublish && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Pencil}
                        onClick={() => setEditing(material as CourseMaterial)}
                      />
                      {material.isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={EyeOff}
                          title="Withdraw"
                          onClick={() => setWithdrawing(material as CourseMaterial)}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Eye}
                          title="Restore this link"
                          loading={reactivate.isPending}
                          onClick={() => reactivate.mutate(material.id)}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {canPublish && (
        <>
          <PublishModal
            open={publishing}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setPublishing(false)}
            onSaved={() => {
              invalidate()
              setPublishing(false)
            }}
          />

          <EditModal
            material={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              invalidate()
              setEditing(null)
            }}
          />

          <ConfirmDialog
            open={withdrawing !== null}
            title="Withdraw this link?"
            message="Students stop seeing it immediately. The row is kept rather than deleted, so it can be reactivated and so the record of what was published survives."
            confirmLabel="Withdraw"
            destructive
            loading={withdraw.isPending}
            onConfirm={() => withdrawing && withdraw.mutate(withdrawing.id)}
            onClose={() => setWithdrawing(null)}
          />
        </>
      )}
    </Page>
  )
}

/**
 * The publish form.
 *
 * An instructor no longer picks a lecture occurrence. Material belongs to a
 * course and an academic audience, not to a Tuesday-10:00 slot, so the form is
 * built from the audiences the server says this instructor teaches — a course,
 * and for that course the faculty, department, level, semester and sections of
 * their teaching assignments. The dropdowns are dependent: choosing a course
 * narrows the faculties to those it is taught in, choosing a faculty narrows
 * the departments, and so on down to the section. There is no free-text entry
 * for an academic field, and the submitted audience is re-checked server-side —
 * the dropdowns are a convenience, never the authorization.
 *
 * A super admin administers the whole university and may address any cohort, so
 * they keep the explicit form.
 */
function PublishModal({
  open,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  open: boolean
  isSuperAdmin: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const emptyForm = {
    courseId: '',
    title: '',
    driveUrl: '',
    faculty: '',
    department: '',
    level: '',
    semester: '',
    section: '',
  }
  const [form, setForm] = useState(emptyForm)

  // The audiences this instructor may publish to — a course and, for it, the
  // faculty/department/level/semester/section they teach, with no day or time.
  // This is what every dependent dropdown below is derived from.
  const audiencesQuery = useQuery({
    queryKey: ['campus', 'material-audiences'],
    queryFn: materialsApi.teachableAudiences,
    enabled: open && !isSuperAdmin,
  })
  const audiences = useMemo(
    () => audiencesQuery.data ?? [],
    [audiencesQuery.data]
  )

  const { data: courses } = useQuery({
    queryKey: ['campus', 'courses', 'all'],
    queryFn: () => coursesApi.list({}),
    enabled: open && isSuperAdmin,
  })

  /**
   * The dependent option lists for the instructor form.
   *
   * Each list is the distinct values that remain once every choice ABOVE it has
   * been applied, so an option can only ever narrow to an audience the server
   * would accept. A choice lower in the chain that a higher change has
   * invalidated is dropped on submit by the same filter, and cleared eagerly in
   * the change handlers below.
   */
  const options = useMemo(() => {
    const distinct = <T,>(values: T[]) => [...new Set(values)]

    const forCourse = audiences.filter((a) => a.course.id === form.courseId)
    const forFaculty = forCourse.filter((a) => a.faculty === form.faculty)
    const forDept = forFaculty.filter((a) => a.department === form.department)
    const forLevel = forDept.filter((a) => String(a.level) === form.level)
    const forSemester = forLevel.filter((a) => String(a.semester) === form.semester)

    const courseMap = new Map(audiences.map((a) => [a.course.id, a.course]))

    return {
      courses: [...courseMap.values()].sort((a, b) =>
        a.courseCode.localeCompare(b.courseCode)
      ),
      faculties: distinct(forCourse.map((a) => a.faculty)).sort(),
      departments: distinct(forFaculty.map((a) => a.department)).sort(),
      levels: distinct(forDept.map((a) => a.level)).sort((a, b) => a - b),
      semesters: distinct(forLevel.map((a) => a.semester)).sort((a, b) => a - b),
      sections: distinct(
        forSemester.map((a) => a.section).filter((s): s is string => s !== null)
      ).sort(),
    }
  }, [audiences, form.courseId, form.faculty, form.department, form.level, form.semester])

  const publish = useMutation({
    mutationFn: () => {
      if (isSuperAdmin) {
        return materialsApi.create({
          courseId: form.courseId,
          title: form.title,
          driveUrl: form.driveUrl,
          audience: {
            faculty: form.faculty,
            department: form.department,
            // The level and semester selects show these defaults but only write
            // to state on change, so coalesce to the same values shown.
            level: Number(form.level || '2'),
            semester: Number(form.semester || '1'),
            section: form.section || null,
          },
        })
      }

      return materialsApi.create({
        courseId: form.courseId,
        title: form.title,
        driveUrl: form.driveUrl,
        audience: {
          faculty: form.faculty,
          department: form.department,
          level: Number(form.level),
          semester: Number(form.semester),
          section: form.section,
        },
      })
    },
    onSuccess: () => {
      toast.success('Link published')
      setForm(emptyForm)
      onSaved()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    publish.mutate()
  }

  // The instructor form needs a complete audience; the super admin's level and
  // semester default in their own selects, so only the course is gated there.
  const instructorReady =
    Boolean(form.courseId) &&
    Boolean(form.faculty) &&
    Boolean(form.department) &&
    Boolean(form.level) &&
    Boolean(form.semester) &&
    Boolean(form.section)
  const canSubmit = isSuperAdmin ? Boolean(form.courseId) : instructorReady

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish a link"
      description="Only Google Drive and Google Docs addresses are accepted, over https."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {isSuperAdmin ? (
          <>
            <Select
              label="Course"
              required
              value={form.courseId}
              onChange={(event) =>
                setForm({ ...form, courseId: event.target.value })
              }
            >
              <option value="">Choose a course…</option>
              {(courses?.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.courseCode} — {course.courseName}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Faculty"
                required
                value={form.faculty}
                onChange={(event) =>
                  setForm({ ...form, faculty: event.target.value })
                }
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
                value={form.level || '2'}
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
                value={form.semester || '1'}
                onChange={(event) =>
                  setForm({ ...form, semester: event.target.value })
                }
              >
                <option value="1">First semester</option>
                <option value="2">Second semester</option>
              </Select>
            </div>

            <Input
              label="Section"
              hint="Leave empty to cover every section of this cohort"
              value={form.section}
              onChange={(event) => setForm({ ...form, section: event.target.value })}
            />
          </>
        ) : (
          <InstructorAudienceFields
            form={form}
            setForm={setForm}
            options={options}
            emptyForm={emptyForm}
            loading={audiencesQuery.isLoading}
            error={audiencesQuery.isError ? getErrorMessage(audiencesQuery.error) : null}
            empty={!audiencesQuery.isLoading && !audiencesQuery.isError && audiences.length === 0}
          />
        )}

        <Input
          label="Title"
          required
          placeholder="Lectures, Labs, Past papers…"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />

        <Input
          label="Google Drive link"
          required
          type="url"
          placeholder="https://drive.google.com/..."
          value={form.driveUrl}
          onChange={(event) => setForm({ ...form, driveUrl: event.target.value })}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={publish.isPending} disabled={!canSubmit}>
            Publish
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type PublishForm = {
  courseId: string
  title: string
  driveUrl: string
  faculty: string
  department: string
  level: string
  semester: string
  section: string
}

/**
 * The instructor's dependent audience dropdowns.
 *
 * Course → Faculty → Department → Level → Semester → Section, each offering only
 * the values that remain once the choices above it are applied. Changing a field
 * clears everything below it, so a stale lower choice can never survive into a
 * submission the server would reject.
 */
function InstructorAudienceFields({
  form,
  setForm,
  options,
  emptyForm,
  loading,
  error,
  empty,
}: {
  form: PublishForm
  setForm: (form: PublishForm) => void
  options: {
    courses: CourseSummary[]
    faculties: string[]
    departments: string[]
    levels: number[]
    semesters: number[]
    sections: string[]
  }
  emptyForm: PublishForm
  loading: boolean
  error: string | null
  empty: boolean
}) {
  if (loading) {
    return <Skeleton className="h-40" />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        Could not load the courses you teach: {error}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        You have no teaching assignments yet, so there is no audience to publish
        to. Ask your department to assign you to a course first.
      </div>
    )
  }

  const semesterLabel = (value: number) =>
    value === 1 ? 'First semester' : value === 2 ? 'Second semester' : `Semester ${value}`

  return (
    <div className="space-y-4">
      <Select
        label="Course"
        required
        hint="Only the courses you teach are listed."
        value={form.courseId}
        onChange={(event) =>
          // Reset every dependent field: a new course invalidates them all.
          setForm({
            ...emptyForm,
            title: form.title,
            driveUrl: form.driveUrl,
            courseId: event.target.value,
          })
        }
      >
        <option value="">Choose a course…</option>
        {options.courses?.map((course) => (
          <option key={course.id} value={course.id}>
            {course.courseCode} — {course.courseName}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Faculty"
          required
          disabled={!form.courseId}
          value={form.faculty}
          onChange={(event) =>
            setForm({
              ...form,
              faculty: event.target.value,
              department: '',
              level: '',
              semester: '',
              section: '',
            })
          }
        >
          <option value="">Choose a faculty…</option>
          {options.faculties.map((faculty) => (
            <option key={faculty} value={faculty}>
              {faculty}
            </option>
          ))}
        </Select>

        <Select
          label="Department"
          required
          disabled={!form.faculty}
          value={form.department}
          onChange={(event) =>
            setForm({
              ...form,
              department: event.target.value,
              level: '',
              semester: '',
              section: '',
            })
          }
        >
          <option value="">Choose a department…</option>
          {options.departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </Select>

        <Select
          label="Level"
          required
          disabled={!form.department}
          value={form.level}
          onChange={(event) =>
            setForm({ ...form, level: event.target.value, semester: '', section: '' })
          }
        >
          <option value="">Choose a level…</option>
          {options.levels.map((level) => (
            <option key={level} value={level}>
              Level {level}
            </option>
          ))}
        </Select>

        <Select
          label="Semester"
          required
          disabled={!form.level}
          value={form.semester}
          onChange={(event) =>
            setForm({ ...form, semester: event.target.value, section: '' })
          }
        >
          <option value="">Choose a semester…</option>
          {options.semesters.map((semester) => (
            <option key={semester} value={semester}>
              {semesterLabel(semester)}
            </option>
          ))}
        </Select>
      </div>

      <Select
        label="Section / group"
        required
        hint="Only the sections you teach for this cohort are listed."
        disabled={!form.semester}
        value={form.section}
        onChange={(event) => setForm({ ...form, section: event.target.value })}
      >
        <option value="">Choose a section…</option>
        {options.sections.map((section) => (
          <option key={section} value={section}>
            Section {section}
          </option>
        ))}
      </Select>
    </div>
  )
}

function EditModal({
  material,
  onClose,
  onSaved,
}: {
  material: CourseMaterial | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', driveUrl: '', isActive: true })
  const [seededFor, setSeededFor] = useState<string | null>(null)

  if (material && seededFor !== material.id) {
    setSeededFor(material.id)
    setForm({
      title: material.title,
      driveUrl: material.driveUrl,
      isActive: material.isActive,
    })
  }

  const save = useMutation({
    mutationFn: () => materialsApi.update(material!.id, form),
    onSuccess: () => {
      toast.success('Link updated')
      setSeededFor(null)
      onSaved()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  return (
    <Modal
      open={material !== null}
      onClose={() => {
        setSeededFor(null)
        onClose()
      }}
      title="Edit link"
      description="The cohort cannot be changed — re-addressing a link to another year means publishing a new one."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
        className="space-y-4"
      >
        <Input
          label="Title"
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Input
          label="Google Drive link"
          required
          type="url"
          value={form.driveUrl}
          onChange={(event) => setForm({ ...form, driveUrl: event.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm({ ...form, isActive: event.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300"
          />
          Visible to students
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}
