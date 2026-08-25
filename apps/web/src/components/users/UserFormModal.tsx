import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { useCreateUser, useUpdateUser, useOrganizations } from '../../hooks/queries'
import type { User, UserRole } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  user?: User | null
}

const ROLES: Array<{ value: UserRole; label: string }> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'UNIVERSITY_SUPER_ADMIN', label: 'University Super Admin' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'SYSTEM_OWNER', label: 'System Owner' },
]

const emptyForm = {
  fullName: '',
  universityId: '',
  email: '',
  password: '',
  role: 'ADMIN' as UserRole,
  organizationId: '',
  isVerified: true,
  isActive: true,
  jobTitle: '',
  office: '',
}

const carriesAdminProfile = (role: UserRole) =>
  role === 'ADMIN' || role === 'UNIVERSITY_SUPER_ADMIN'

export function UserFormModal({ open, onClose, user }: Props) {
  const isEdit = Boolean(user)
  const [form, setForm] = useState(emptyForm)

  const { data: organizations } = useOrganizations({ limit: 100 })

  useEffect(() => {
    if (!open) return

    setForm(
      user
        ? {
            fullName: user.fullName,
            universityId: user.universityId,
            email: user.email,
            password: '',
            role: user.role,
            organizationId: user.organizationId,
            isVerified: user.isVerified,
            isActive: user.isActive,
            jobTitle: '',
            office: '',
          }
        : emptyForm
    )
  }, [open, user])

  const create = useCreateUser(onClose)
  const update = useUpdateUser(onClose)
  const pending = create.isPending || update.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (isEdit && user) {
      // universityId and password are not editable here; use Reset password.
      update.mutate({
        id: user.id,
        data: {
          fullName: form.fullName,
          email: form.email,
          organizationId: form.organizationId,
          isVerified: form.isVerified,
          isActive: form.isActive,
        },
      })
      return
    }

    create.mutate({
      fullName: form.fullName,
      universityId: form.universityId,
      email: form.email,
      password: form.password,
      role: form.role,
      organizationId: form.organizationId,
      isVerified: form.isVerified,
      ...(carriesAdminProfile(form.role)
        ? {
            jobTitle: form.jobTitle,
            office: form.office || undefined,
          }
        : {}),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit user' : 'Add user'}
        description={
          isEdit
          ? 'Update this account’s details and access. Its role is permanent.'
          : 'Create an account inside one of your organizations.'
        }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={pending}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChange={(event) =>
              setForm({ ...form, fullName: event.target.value })
            }
            placeholder="Ahmed Hassan"
          />
          <Input
            label="University ID"
            required
            disabled={isEdit}
            value={form.universityId}
            onChange={(event) =>
              setForm({ ...form, universityId: event.target.value })
            }
            placeholder="CU-ADM-001"
            hint={isEdit ? 'Cannot be changed' : undefined}
          />
        </div>

        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="ahmed@cu.edu.eg"
        />

        {!isEdit && (
          <Input
            label="Password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            hint="At least 8 characters"
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Role"
            required
            disabled={isEdit}
            value={form.role}
            onChange={(event) =>
              setForm({ ...form, role: event.target.value as UserRole })
            }
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label="Organization"
            required
            value={form.organizationId}
            onChange={(event) =>
              setForm({ ...form, organizationId: event.target.value })
            }
          >
            <option value="">Select an organization…</option>
            {organizations?.data.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </Select>
        </div>

        {!isEdit && carriesAdminProfile(form.role) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Job title"
              required
              placeholder="Professor, Lecturer, Head of IT"
              value={form.jobTitle}
              onChange={(event) =>
                setForm({ ...form, jobTitle: event.target.value })
              }
            />
            <Input
              label="Office"
              value={form.office}
              onChange={(event) =>
                setForm({ ...form, office: event.target.value })
              }
            />
          </div>
        )}

        <div className="flex flex-wrap gap-6 rounded-lg border border-slate-200 p-4">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.isVerified}
              onChange={(event) =>
                setForm({ ...form, isVerified: event.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-700">Verified</span>
          </label>

          {isEdit && (
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm({ ...form, isActive: event.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}
