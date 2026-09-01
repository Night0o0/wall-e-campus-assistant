import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookCheck, Pencil, Plus, Send } from 'lucide-react'
import { assignmentsApi } from '../../api/campus'
import { Card, Page } from '../../components/layout/Page'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { SearchInput } from '../../components/ui/SearchInput'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useDebounce } from '../../hooks/useDebounce'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import type {
  AssignmentGradebook,
  CampusAssignment,
} from '../../types/campus'

export function Assignments() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CampusAssignment | null>(null)
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<CampusAssignment | null>(null)
  const [gradebook, setGradebook] = useState<CampusAssignment | null>(null)

  const debouncedSearch = useDebounce(search, 250)

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'assignments'],
    queryFn: assignmentsApi.list,
  })

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase()
    if (!needle) return data

    return data.filter((assignment) =>
      [
        assignment.title,
        assignment.description ?? '',
        assignment.offering.course.courseCode,
        assignment.offering.course.courseName,
        assignment.offering.term.name,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [data, debouncedSearch])

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'assignments'] })

  const publish = useMutation({
    mutationFn: (id: string) => assignmentsApi.publish(id),
    onSuccess: () => {
      invalidate()
      toast.success('Assignment published')
      setPublishing(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const columns: Column<CampusAssignment>[] = [
    {
      key: 'assignment',
      header: 'Assignment',
      render: (assignment) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{assignment.title}</p>
          <p className="truncate text-xs text-slate-500">
            {assignment.offering.course.courseCode} · {assignment.offering.term.name}
          </p>
        </div>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      render: (assignment) => (
        <div className="text-sm text-slate-600">
          <p>{assignment.offering.course.courseName}</p>
          <p className="text-xs text-slate-500">
            {assignment.cohorts.length === 0
              ? 'All offering cohorts'
              : assignment.cohorts.map(({ cohort }) => cohortLabel(cohort)).join(', ')}
          </p>
        </div>
      ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      render: (assignment) => (
        <span className="text-sm text-slate-600">{formatDateTime(assignment.deadline)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (assignment) => (
        <div className="flex flex-wrap gap-2">
          <Badge tone={assignment.isPublished ? 'success' : 'warning'}>
            {assignment.isPublished ? 'Published' : 'Draft'}
          </Badge>
          <Badge tone="neutral">Max {String(assignment.maxScore)}</Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (assignment) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            onClick={() => setEditing(assignment)}
          />
          {!assignment.isPublished && (
            <Button
              size="sm"
              variant="ghost"
              icon={Send}
              onClick={() => setPublishing(assignment)}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={BookCheck}
            onClick={() => setGradebook(assignment)}
          />
        </div>
      ),
    },
  ]

  return (
    <Page
      title="Assignments"
      subtitle="Create, publish and grade work inside the offerings you are authorized to manage."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          New assignment
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(assignment) => assignment.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyTitle="No assignments yet"
        emptyMessage="Create one for a course offering you manage, or wait for published work to appear."
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search assignments, courses or terms…"
            className="sm:w-80"
          />
        }
      />

      <AssignmentFormModal
        open={creating || editing !== null}
        assignment={editing}
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

      <GradebookModal assignment={gradebook} onClose={() => setGradebook(null)} />

      <Modal
        open={publishing !== null}
        onClose={() => setPublishing(null)}
        title={`Publish ${publishing?.title ?? 'assignment'}?`}
        description="Students only see grades and assignments that have been explicitly published."
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setPublishing(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={publish.isPending}
            onClick={() => publishing && publish.mutate(publishing.id)}
          >
            Publish
          </Button>
        </div>
      </Modal>
    </Page>
  )
}

function AssignmentFormModal({
  open,
  assignment,
  onClose,
  onSaved,
}: {
  open: boolean
  assignment: CampusAssignment | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    offeringId: '',
    title: '',
    description: '',
    deadline: '',
    maxScore: '100',
    cohortIds: [] as string[],
    isPublished: false,
  })
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = assignment?.id ?? 'new'

  const options = useQuery({
    queryKey: ['campus', 'assignment-options'],
    queryFn: assignmentsApi.options,
    enabled: open,
  })

  if (open && seededFor !== key) {
    setSeededFor(key)
    setForm({
      offeringId: assignment?.offering.id ?? '',
      title: assignment?.title ?? '',
      description: assignment?.description ?? '',
      deadline: assignment ? toDateTimeLocal(assignment.deadline) : '',
      maxScore: assignment ? String(assignment.maxScore) : '100',
      cohortIds: assignment?.cohorts.map(({ cohort }) => cohort.id) ?? [],
      isPublished: assignment?.isPublished ?? false,
    })
  }

  const selectedOffering = options.data?.find((offering) => offering.id === form.offeringId)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        offeringId: form.offeringId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        deadline: new Date(form.deadline).toISOString(),
        maxScore: Number(form.maxScore),
        cohortIds: form.cohortIds,
        ...(assignment ? {} : { isPublished: form.isPublished }),
      }

      return assignment
        ? assignmentsApi.update(assignment.id, payload)
        : assignmentsApi.create(payload)
    },
    onSuccess: () => {
      toast.success(assignment ? 'Assignment updated' : 'Assignment created')
      setSeededFor(null)
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        setSeededFor(null)
        onClose()
      }}
      title={assignment ? 'Edit assignment' : 'New assignment'}
      description="Offerings and cohorts come from the backend scope the signed-in role is allowed to manage."
      size="lg"
    >
      {options.isLoading ? (
        <Skeleton className="h-64" />
      ) : options.error ? (
        <p className="text-sm text-danger-600">{getErrorMessage(options.error)}</p>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            save.mutate()
          }}
          className="space-y-4"
        >
          <Select
            label="Offering"
            required
            value={form.offeringId}
            onChange={(event) =>
              setForm({
                ...form,
                offeringId: event.target.value,
                cohortIds: [],
              })
            }
            disabled={assignment !== null}
            hint={
              assignment
                ? 'The offering cannot be changed after creation.'
                : 'Only offerings inside your backend scope appear here.'
            }
          >
            <option value="">Choose an offering…</option>
            {(options.data ?? []).map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.course.courseCode} · {offering.term.name}
                {offering.displayName ? ` · ${offering.displayName}` : ''}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <Input
              label="Maximum score"
              required
              type="number"
              min={1}
              step="1"
              value={form.maxScore}
              onChange={(event) => setForm({ ...form, maxScore: event.target.value })}
            />
          </div>

          <Textarea
            label="Description"
            rows={4}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />

          <Input
            label="Deadline"
            required
            type="datetime-local"
            value={form.deadline}
            onChange={(event) => setForm({ ...form, deadline: event.target.value })}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Target cohorts</p>
            <p className="text-xs text-slate-500">
              Leave all unchecked to address every cohort linked to the offering.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(selectedOffering?.cohorts ?? []).map(({ cohort }) => (
                <label
                  key={cohort.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={form.cohortIds.includes(cohort.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        cohortIds: event.target.checked
                          ? [...form.cohortIds, cohort.id]
                          : form.cohortIds.filter((id) => id !== cohort.id),
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {cohortLabel(cohort)}
                </label>
              ))}
            </div>
          </div>

          {!assignment && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(event) => setForm({ ...form, isPublished: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Publish immediately
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {assignment ? 'Save changes' : 'Create assignment'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function GradebookModal({
  assignment,
  onClose,
}: {
  assignment: CampusAssignment | null
  onClose: () => void
}) {
  const toast = useToast()
  const gradebook = useQuery({
    queryKey: ['campus', 'assignment-gradebook', assignment?.id],
    queryFn: () => assignmentsApi.gradebook(assignment!.id),
    enabled: assignment !== null,
  })

  return (
    <Modal
      open={assignment !== null}
      onClose={onClose}
      title={assignment ? `Gradebook · ${assignment.title}` : 'Gradebook'}
      description="Scores and feedback stay draft until you publish them per student."
      size="lg"
    >
      {gradebook.isLoading ? (
        <Skeleton className="h-72" />
      ) : gradebook.error ? (
        <p className="text-sm text-danger-600">{getErrorMessage(gradebook.error)}</p>
      ) : (
        <div className="space-y-4">
          {(gradebook.data?.rows ?? []).map((row) => (
            <GradeRow
              key={row.student.id}
              assignmentId={assignment!.id}
              maxScore={Number(gradebook.data?.assignment.maxScore ?? 0)}
              row={row}
              onSaved={() => {
                void gradebook.refetch()
                toast.success(`Saved grade for ${row.student.fullName}`)
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}

function GradeRow({
  assignmentId,
  maxScore,
  row,
  onSaved,
}: {
  assignmentId: string
  maxScore: number
  row: AssignmentGradebook['rows'][number]
  onSaved: () => void
}) {
  const toast = useToast()
  const [score, setScore] = useState(row.grade ? String(row.grade.score) : '')
  const [feedback, setFeedback] = useState(row.grade?.feedback ?? '')
  const [publishNow, setPublishNow] = useState(Boolean(row.grade?.publishedAt))

  const save = useMutation({
    mutationFn: () =>
      assignmentsApi.grade(assignmentId, row.student.id, {
        score: Number(score),
        feedback: feedback.trim() || null,
        publish: publishNow,
      }),
    onSuccess: onSaved,
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <Card
      title={row.student.fullName}
      description={`${row.student.universityId} · ${row.student.email}`}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
        <Input
          label={`Score / ${maxScore}`}
          type="number"
          min={0}
          max={maxScore}
          step="0.1"
          value={score}
          onChange={(event) => setScore(event.target.value)}
        />
        <Textarea
          label="Feedback"
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(event) => setPublishNow(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Publish this grade
        </label>
        <Button type="button" loading={save.isPending} onClick={() => save.mutate()}>
          Save grade
        </Button>
      </div>
    </Card>
  )
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function cohortLabel(
  cohort: CampusAssignment['cohorts'][number]['cohort']
) {
  return [
    cohort.name,
    cohort.academicYear,
    cohort.level ? `Level ${cohort.level}` : null,
    cohort.section ? `Section ${cohort.section}` : null,
    cohort.groupName ? `Group ${cohort.groupName}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
