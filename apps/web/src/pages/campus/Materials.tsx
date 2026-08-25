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
import { campusAdminApi, coursesApi, materialsApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import type { CourseMaterial, LectureSchedule } from '../../types/campus'

/**
 * Google Drive links, addressed to a cohort.
 *
 * ── The two ways to publish, and why an ADMIN only gets one ────────────────
 *
 * An instructor publishes by picking one of THEIR OWN lectures. The server
 * copies the academic address — faculty, department, level, semester, section —
 * off that lecture, and doing so is simultaneously the proof that they teach the
 * cohort they are publishing to. Naming a cohort directly is refused for an
 * ADMIN, because that parameter is precisely the one through which an
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

  const isSuperAdmin = user?.role === 'UNIVERSITY_SUPER_ADMIN'

  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState<CourseMaterial | null>(null)
  const [withdrawing, setWithdrawing] = useState<CourseMaterial | null>(null)

  /**
   * Withdrawal is a soft delete and the row is deliberately kept, but the
   * server defaults to active and this page never asked for anything else - so
   * a withdrawn link vanished and could not be brought back from the UI (D-7).
   */
  const [status, setStatus] = useState<'active' | 'withdrawn' | 'all'>('active')

  const { data: materials = [], isLoading, error } = useQuery({
    queryKey: ['campus', 'materials', status],
    queryFn: () => materialsApi.list({ status }),
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


    onSuccess: () => {
      invalidate()
      toast.success('Link withdrawn')
      setWithdrawing(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  /** Grouped the way the page reads: a list of subjects, each with its links. */
  const byCourse = useMemo(() => {
    const groups = new Map<string, { label: string; rows: CourseMaterial[] }>()

    for (const material of materials) {
      const key = material.courseId
      const label = material.course
        ? `${material.course.courseCode} — ${material.course.courseName}`
        : 'Unknown course'

      if (!groups.has(key)) groups.set(key, { label, rows: [] })
      groups.get(key)!.rows.push(material)
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [materials])

  return (
    <Page
      title="Course Material"
      subtitle={
        isSuperAdmin
          ? 'Every link in your university, for any cohort.'
          : 'The links you publish for the subjects you teach.'
      }
      actions={
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
            Publish a Google Drive link and every student in the cohort it is
            addressed to will see it under that subject.
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

                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => setEditing(material)}
                    />
                    {material.isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={EyeOff}
                        title="Withdraw"
                        onClick={() => setWithdrawing(material)}
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
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

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
    </Page>
  )
}

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

  const [form, setForm] = useState({
    scheduleId: '',
    courseId: '',
    title: '',
    driveUrl: '',
    faculty: '',
    department: '',
    level: '2',
    semester: '1',
    section: '',
  })

  // An instructor publishes against one of their own lectures, so the picker is
  // their teaching timetable — which is also the proof they teach the cohort.
  const { data: lectures = [] } = useQuery({
    queryKey: ['campus', 'my-teaching-schedule'],
    queryFn: campusAdminApi.myTeachingSchedule,
    enabled: open && !isSuperAdmin,
  })

  const { data: courses } = useQuery({
    queryKey: ['campus', 'courses', 'all'],
    queryFn: () => coursesApi.list({}),
    enabled: open && isSuperAdmin,
  })

  const selectedLecture: LectureSchedule | undefined = lectures.find(
    (lecture) => lecture.id === form.scheduleId
  )

  const publish = useMutation({
    mutationFn: () => {
      if (isSuperAdmin) {
        return materialsApi.create({
          courseId: form.courseId,
          title: form.title,
          driveUrl: form.driveUrl,
          cohort: {
            faculty: form.faculty,
            department: form.department,
            level: Number(form.level),
            semester: Number(form.semester),
            section: form.section || null,
          },
        })
      }

      if (!selectedLecture) {
        throw new Error('Pick one of your lectures first')
      }

      return materialsApi.create({
        // The course comes from the lecture, not from a second dropdown that
        // could disagree with it — and it is `course.id`, because the lecture
        // projection has no flat courseId. Sending undefined here is a 400 from
        // the validator, which is exactly what an instructor used to get.
        courseId: selectedLecture.course.id,
        title: form.title,
        driveUrl: form.driveUrl,
        scheduleId: selectedLecture.id,
      })
    },
    onSuccess: () => {
      toast.success('Link published')
      setForm({
        scheduleId: '',
        courseId: '',
        title: '',
        driveUrl: '',
        faculty: '',
        department: '',
        level: '2',
        semester: '1',
        section: '',
      })
      onSaved()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    publish.mutate()
  }

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
          <>
            <Select
              label="Which of your lectures is this for?"
              required
              hint="The cohort is copied from the lecture — that is what proves you teach it."
              value={form.scheduleId}
              onChange={(event) =>
                setForm({ ...form, scheduleId: event.target.value })
              }
            >
              <option value="">Choose a lecture…</option>
              {lectures
                .filter((lecture) => lecture.isActive)
                .map((lecture) => (
                  <option key={lecture.id} value={lecture.id}>
                    {lecture.course.courseCode} · Level {lecture.level}
                    {lecture.section ? ` · Section ${lecture.section}` : ''} ·{' '}
                    {lecture.dayOfWeek.toLowerCase()} {lecture.startTime}
                  </option>
                ))}
            </Select>

            {selectedLecture && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Publishing to{' '}
                <span className="font-medium text-slate-900">
                  {selectedLecture.department}, level {selectedLecture.level},
                  semester {selectedLecture.semester}
                  {selectedLecture.section
                    ? `, section ${selectedLecture.section}`
                    : ' — every section'}
                </span>
                .
              </div>
            )}
          </>
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
          <Button type="submit" loading={publish.isPending}>
            Publish
          </Button>
        </div>
      </form>
    </Modal>
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
