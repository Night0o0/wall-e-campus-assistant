import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Pencil, Plus } from 'lucide-react'
import { departmentsApi } from '../../api/campus'
import { Page } from '../../components/layout/Page'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { SearchInput } from '../../components/ui/SearchInput'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'
import { useDebounce } from '../../hooks/useDebounce'
import { getErrorMessage } from '../../lib/api'
import type { Department } from '../../types/campus'

export function Departments() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'UNIVERSITY_ADMIN'

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Department | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<Department | null>(null)

  const debouncedSearch = useDebounce(search, 250)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'departments', debouncedSearch],
    queryFn: () => departmentsApi.list({ search: debouncedSearch, limit: 50 }),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'departments'] })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      departmentsApi.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success('Department updated')
      setDeactivating(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const columns: Column<Department>[] = [
    {
      key: 'name',
      header: 'Department',
      render: (department) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{department.name}</p>
          <p className="text-xs text-slate-500">{department.code}</p>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      render: (department) => (
        <div className="text-sm text-slate-600">
          <p>{department._count?.members ?? 0} members</p>
          <p className="text-xs text-slate-500">
            {department._count?.courses ?? 0} courses · {department._count?.cohorts ?? 0} cohorts
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (department) => (
        <Badge tone={department.isActive ? 'success' : 'neutral'}>
          {department.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (department) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              onClick={() => setEditing(department)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={Ban}
              title={department.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => setDeactivating(department)}
            />
          </div>
        ) : null,
    },
  ]

  return (
    <Page
      title="Departments"
      subtitle={
        canManage
          ? 'Academic departments in your university.'
          : 'Your linked department scope and the records inside it.'
      }
      actions={
        canManage ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New department
          </Button>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(department) => department.id}
        isLoading={isLoading}
        error={error}
        meta={data?.meta}
        onRetry={() => void refetch()}
        emptyTitle="No departments found"
        emptyMessage={
          canManage
            ? 'Create the first department to start assigning staff and courses.'
            : 'No department is linked to this account yet.'
        }
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name or code…"
            className="sm:w-72"
          />
        }
      />

      {canManage && (
        <>
          <DepartmentFormModal
            open={creating || editing !== null}
            department={editing}
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

          <ConfirmDialog
            open={deactivating !== null}
            title={`${deactivating?.isActive ? 'Deactivate' : 'Activate'} this department?`}
            message="This updates the department record itself. Role and course scopes remain derived from linked records and backend permissions."
            confirmLabel={deactivating?.isActive ? 'Deactivate' : 'Activate'}
            loading={update.isPending}
            destructive={Boolean(deactivating?.isActive)}
            onConfirm={() =>
              deactivating &&
              update.mutate({
                id: deactivating.id,
                body: { isActive: !deactivating.isActive },
              })
            }
            onClose={() => setDeactivating(null)}
          />
        </>
      )}
    </Page>
  )
}

function DepartmentFormModal({
  open,
  department,
  onClose,
  onSaved,
}: {
  open: boolean
  department: Department | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({ code: '', name: '' })
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = department?.id ?? 'new'

  if (open && seededFor !== key) {
    setSeededFor(key)
    setForm({
      code: department?.code ?? '',
      name: department?.name ?? '',
    })
  }

  const save = useMutation({
    mutationFn: () =>
      department
        ? departmentsApi.update(department.id, {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
          })
        : departmentsApi.create({
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
          }),
    onSuccess: () => {
      toast.success(department ? 'Department updated' : 'Department created')
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
      title={department ? 'Edit department' : 'New department'}
      description="A department is the trusted scope for department administrators and part of course/offering authorization."
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          save.mutate()
        }}
        className="space-y-4"
      >
        <Input
          label="Code"
          required
          maxLength={20}
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
        />
        <Input
          label="Name"
          required
          maxLength={120}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {department ? 'Save changes' : 'Create department'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
