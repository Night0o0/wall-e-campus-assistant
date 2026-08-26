import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, UserCog } from 'lucide-react'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Field'
import { SearchInput } from '../../components/ui/SearchInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { useToast } from '../../components/ui/Toast'
import { campusAdminApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'
import { cn } from '../../lib/utils'
import type { CampusUser } from '../../types/campus'

type Tab = 'STUDENT' | 'INSTRUCTOR'

/**
 * Students and staff, in one directory.
 *
 * ── Why staff are a tab and not a separate page ────────────────────────────
 *
 * One endpoint (POST /api/admin/users) creates both, with a `role` field, and
 * one endpoint lists both with identical filters. Two pages would mean two
 * copies of the same table and the same form, kept in step by hand.
 *
 * ── What this page cannot do, and why ──────────────────────────────────────
 *
 * Create a UNIVERSITY_ADMIN. The creatable roles are INSTRUCTOR and STUDENT
 * only: a super admin who can mint super admins is an escalation with no
 * ceiling, so that role is granted by the platform owner and by nobody else.
 *
 * Change an existing account's role. There is no role field on the update
 * schema — moving an account between roles is a different account.
 *
 * ── Resetting a staff password ─────────────────────────────────────────────
 *
 * This is the staff recovery path, and it is the only one. Staff are excluded
 * from the emailed self-service reset by decision, because an account that
 * approves registrations and publishes to whole cohorts should be recovered by
 * a person who knows who is asking.
 */
export function Directory() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('STUDENT')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<CampusUser | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const params = {
    role: tab,
    search: debouncedSearch,
    limit: 25,
    ...(status === 'pending' ? { isVerified: 'false' } : {}),
    ...(status === 'inactive' ? { isActive: 'false' } : {}),
    ...(status === 'incomplete' ? { profileStatus: 'INCOMPLETE' } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'directory', params],
    queryFn: () => campusAdminApi.users(params),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'directory'] })

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      campusAdminApi.updateUser(id, { isActive }),
    onSuccess: () => {
      invalidate()
      toast.success('Account updated')
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const columns: Column<CampusUser>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (person) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{person.fullName}</p>
          <p className="truncate text-xs text-slate-500">{person.email}</p>
        </div>
      ),
    },
    {
      key: 'universityId',
      header: 'University ID',
      render: (person) => (
        <span className="font-mono text-sm text-slate-600">
          {person.universityId}
        </span>
      ),
    },
    // Only on the student tab: the directory sends `profile: null` for staff,
    // so an equivalent staff column would be permanently empty.
    ...(tab === 'STUDENT'
      ? [
          {
            key: 'cohort',
            header: 'Cohort',
            render: (person: CampusUser) => (
              <span className="text-sm text-slate-600">
                {person.profile?.department ?? '—'}
                {person.profile?.level ? ` · Level ${person.profile.level}` : ''}
                {person.profile?.section ? ` · ${person.profile.section}` : ''}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (person) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={person.isActive ? 'success' : 'danger'}>
            {person.isActive ? 'Active' : 'Deactivated'}
          </Badge>
          {tab === 'STUDENT' && !person.isVerified && (
            <Badge tone="warning">Pending</Badge>
          )}
          {tab === 'STUDENT' && person.profile?.status === 'INCOMPLETE' && (
            <Badge tone="neutral">Profile incomplete</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (person) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={KeyRound}
            title="Set a new password"
            onClick={() => setResetting(person)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={UserCog}
            title={person.isActive ? 'Deactivate' : 'Reactivate'}
            onClick={() =>
              setActive.mutate({ id: person.id, isActive: !person.isActive })
            }
          />
        </div>
      ),
    },
  ]

  return (
    <Page
      title="Students & Staff"
      subtitle="Everyone in your university."
      actions={
        <Button icon={Plus} onClick={() => setCreating(true)}>
          Create account
        </Button>
      }
    >
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(['STUDENT', 'INSTRUCTOR'] as Tab[]).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {value === 'STUDENT' ? 'Students' : 'Staff'}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(person) => person.id}
        isLoading={isLoading}
        error={error}
        meta={data?.meta}
        onRetry={() => void refetch()}
        emptyTitle="Nobody found"
        emptyMessage="Nothing matches the current filters."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, email or ID…"
              className="sm:w-72"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              wrapperClassName="sm:w-52"
            >
              <option value="">Any status</option>
              {tab === 'STUDENT' && (
                <>
                  <option value="pending">Waiting for approval</option>
                  <option value="incomplete">Profile incomplete</option>
                </>
              )}
              <option value="inactive">Deactivated</option>
            </Select>
          </div>
        }
      />

      <CreateAccountModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          invalidate()
          setCreating(false)
        }}
      />

      <ResetPasswordModal
        person={resetting}
        onClose={() => setResetting(null)}
      />
    </Page>
  )
}

function CreateAccountModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [form, setForm] = useState({
    role: 'INSTRUCTOR',
    universityId: '',
    fullName: '',
    email: '',
    password: '',
    jobTitle: '',
    office: '',
  })

  const create = useMutation({
    mutationFn: () =>
      campusAdminApi.createUser({
        role: form.role,
        universityId: form.universityId,
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        // Required for an INSTRUCTOR and rejected for a STUDENT: AdminProfile.jobTitle
        // is non-nullable, and it is where the academic title lives, because
        // there is no separate professor role.
        ...(form.role === 'INSTRUCTOR'
          ? { jobTitle: form.jobTitle, office: form.office || undefined }
          : {}),
      }),
    onSuccess: () => {
      toast.success('Account created')
      setForm({
        role: 'INSTRUCTOR',
        universityId: '',
        fullName: '',
        email: '',
        password: '',
        jobTitle: '',
        office: '',
      })
      onSaved()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create account"
      description="Staff and students only. The university administrator role is granted by the platform owner."
    >
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Role"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value })}
        >
          <option value="INSTRUCTOR">Teaching staff</option>
          <option value="STUDENT">Student</option>
        </Select>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="University ID"
            required
            value={form.universityId}
            onChange={(event) =>
              setForm({ ...form, universityId: event.target.value })
            }
          />
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </div>

        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />

        <Input
          label="Temporary password"
          type="password"
          required
          minLength={8}
          hint="At least 8 characters. They can change it from their Account page."
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />

        {form.role === 'INSTRUCTOR' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Academic title"
              required
              placeholder="Dr., Eng., Prof."
              hint="There is no separate professor role — this is the title."
              value={form.jobTitle}
              onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
            />
            <Input
              label="Office"
              value={form.office}
              onChange={(event) => setForm({ ...form, office: event.target.value })}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({
  person,
  onClose,
}: {
  person: CampusUser | null
  onClose: () => void
}) {
  const toast = useToast()
  const [password, setPassword] = useState('')

  const reset = useMutation({
    mutationFn: () => campusAdminApi.resetUserPassword(person!.id, password),
    onSuccess: () => {
      toast.success('Password set')
      setPassword('')
      onClose()
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={`Set a new password for ${person?.fullName ?? ''}`}
      description="Tell them the new password over a channel you trust, and ask them to change it from their Account page."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          reset.mutate()
        }}
        className="space-y-4"
      >
        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={reset.isPending}>
            Set password
          </Button>
        </div>
      </form>
    </Modal>
  )
}
