import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'
import { useCreateOrganization, useUpdateOrganization } from '../../hooks/queries'
import type { Organization } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  organization?: Organization | null
}

const emptyForm = {
  name: '',
  code: '',
  email: '',
  phone: '',
  website: '',
  address: '',
}

const emptyAdmin = {
  fullName: '',
  universityId: '',
  email: '',
  password: '',
}

export function OrganizationFormModal({ open, onClose, organization }: Props) {
  const isEdit = Boolean(organization)

  const [form, setForm] = useState(emptyForm)
  const [admin, setAdmin] = useState(emptyAdmin)
  const [withAdmin, setWithAdmin] = useState(false)

  // Reload the form whenever the modal opens for a different record.
  useEffect(() => {
    if (!open) return

    setForm(
      organization
        ? {
            name: organization.name,
            code: organization.code,
            email: organization.email ?? '',
            phone: organization.phone ?? '',
            website: organization.website ?? '',
            address: organization.address ?? '',
          }
        : emptyForm
    )
    setAdmin(emptyAdmin)
    setWithAdmin(false)
  }, [open, organization])

  const create = useCreateOrganization(onClose)
  const update = useUpdateOrganization(onClose)
  const pending = create.isPending || update.isPending

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (isEdit && organization) {
      // Code is immutable: it identifies the tenant in registration links.
      const { code: _code, ...editable } = form
      update.mutate({ id: organization.id, data: editable })
      return
    }

    create.mutate({
      ...form,
      admin: withAdmin ? admin : undefined,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit organization' : 'Add organization'}
      description={
        isEdit
          ? 'Update contact details for this university.'
          : 'Register a new university on the platform.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="organization-form"
            loading={pending}
          >
            {isEdit ? 'Save changes' : 'Create organization'}
          </Button>
        </>
      }
    >
      <form id="organization-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
            placeholder="Cairo University"
          />
          <Input
            label="Code"
            required
            disabled={isEdit}
            value={form.code}
            onChange={(event) => set('code')(event.target.value.toUpperCase())}
            placeholder="CU"
            hint={
              isEdit
                ? 'The code cannot be changed'
                : 'Short unique identifier students use to register'
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => set('email')(event.target.value)}
            placeholder="admin@cu.edu.eg"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(event) => set('phone')(event.target.value)}
            placeholder="+20 2 1234 5678"
          />
        </div>

        <Input
          label="Website"
          type="url"
          value={form.website}
          onChange={(event) => set('website')(event.target.value)}
          placeholder="https://cu.edu.eg"
        />

        <Input
          label="Address"
          value={form.address}
          onChange={(event) => set('address')(event.target.value)}
          placeholder="Giza, Cairo Governorate"
        />

        {!isEdit && (
          <div className="rounded-lg border border-slate-200 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={withAdmin}
                onChange={(event) => setWithAdmin(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Also create the university's super admin
              </span>
            </label>

            {withAdmin && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  required
                  value={admin.fullName}
                  onChange={(event) =>
                    setAdmin({ ...admin, fullName: event.target.value })
                  }
                  placeholder="Ahmed Hassan"
                />
                <Input
                  label="University ID"
                  required
                  value={admin.universityId}
                  onChange={(event) =>
                    setAdmin({ ...admin, universityId: event.target.value })
                  }
                  placeholder="CU-ADM-001"
                />
                <Input
                  label="Email"
                  type="email"
                  required
                  value={admin.email}
                  onChange={(event) =>
                    setAdmin({ ...admin, email: event.target.value })
                  }
                  placeholder="ahmed@cu.edu.eg"
                />
                <Input
                  label="Password"
                  type="password"
                  required
                  minLength={8}
                  value={admin.password}
                  onChange={(event) =>
                    setAdmin({ ...admin, password: event.target.value })
                  }
                  hint="At least 8 characters"
                />
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
}
