import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Copy, KeyRound, Plus, ShieldAlert } from 'lucide-react'
import { Page, Card } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Field'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { devicesApi } from '../../api/campus'
import { getErrorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import type { ProvisionedDevice, RobotDevice } from '../../types/campus'

const STATUS_TONES = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'neutral',
  REVOKED: 'danger',
} as const

/**
 * Robot credentials.
 *
 * ── What a device is ───────────────────────────────────────────────────────
 *
 * Not a user. A device authenticates with its own key id and secret, gets a
 * short-lived token signed with a different key from any user token, and can
 * reach exactly four endpoints. It is not tied to any particular hardware: the
 * client can be a browser on a wall-mounted screen, a phone, or anything else
 * with a display. What makes it a robot is the credential, not the device.
 *
 * ── What it can never do ───────────────────────────────────────────────────
 *
 * Open a session. Attendance is opened by a person, and the robot displays the
 * code for what they opened. The capability that once allowed otherwise was
 * deleted rather than switched off, and Session.createdById is a non-nullable
 * foreign key to User, which a device principal cannot satisfy.
 *
 * ── The secret is shown once ───────────────────────────────────────────────
 *
 * Provisioning is the only response that ever carries it, and only bcrypt over
 * it is stored. If it is lost, rotate — there is no way to read it back, which
 * is the property that makes a leaked database useless for impersonating a
 * robot.
 */
export function Devices() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [provisioning, setProvisioning] = useState(false)
  const [credential, setCredential] = useState<ProvisionedDevice | null>(null)
  const [rotating, setRotating] = useState<RobotDevice | null>(null)
  const [revoking, setRevoking] = useState<RobotDevice | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campus', 'devices'],
    queryFn: () => devicesApi.list({ limit: 50 }),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['campus', 'devices'] })

  const rotate = useMutation({
    mutationFn: (id: string) => devicesApi.rotateSecret(id),
    onSuccess: (result) => {
      invalidate()
      setRotating(null)
      setCredential(result)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => devicesApi.revoke(id, 'Revoked from the console'),
    onSuccess: () => {
      invalidate()
      toast.success('Device revoked')
      setRevoking(null)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const columns: Column<RobotDevice>[] = [
    {
      key: 'name',
      header: 'Device',
      render: (device) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{device.name}</p>
          <p className="truncate font-mono text-xs text-slate-500">
            {device.deviceKeyId}
          </p>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Room',
      render: (device) => (
        <span className="text-slate-600">
          {device.room ?? (
            <span className="text-slate-400">Unbound — serves every room</span>
          )}
        </span>
      ),
    },
    {
      key: 'lastSeen',
      header: 'Last seen',
      render: (device) => (
        <span className="text-slate-600">
          {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (device) => (
        <Badge tone={STATUS_TONES[device.status] ?? 'neutral'}>
          {device.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (device) => (
        <div className="flex justify-end gap-1">
          {device.status !== 'REVOKED' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={KeyRound}
                title="Rotate secret"
                onClick={() => setRotating(device)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={Ban}
                title="Revoke"
                onClick={() => setRevoking(device)}
              />
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <Page
      title="Robot Devices"
      subtitle="Credentials for the screens that display attendance codes."
      actions={
        <Button icon={Plus} onClick={() => setProvisioning(true)}>
          Provision a device
        </Button>
      }
    >
      <Card title="How a device is paired">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Provision it here and copy the key id and secret.</li>
          <li>
            Open <span className="font-mono text-slate-900">/robot</span> on the
            screen that will display codes — any browser, any size.
          </li>
          <li>Paste the credential once. It re-authenticates on its own after that.</li>
        </ol>
        <p className="mt-3 text-sm text-slate-500">
          A device only ever shows the code for a session a person has already
          opened. It cannot start attendance itself.
        </p>
      </Card>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(device) => device.id}
        isLoading={isLoading}
        error={error}
        meta={data?.meta}
        onRetry={() => void refetch()}
        emptyTitle="No devices yet"
        emptyMessage="Provision one to put an attendance code on a screen."
      />

      <ProvisionModal
        open={provisioning}
        onClose={() => setProvisioning(false)}
        onProvisioned={(result) => {
          invalidate()
          setProvisioning(false)
          setCredential(result)
        }}
      />

      <CredentialModal
        credential={credential}
        onClose={() => setCredential(null)}
      />

      <ConfirmDialog
        open={rotating !== null}
        title={`Rotate the secret for ${rotating?.name ?? 'this device'}?`}
        message="The current secret stops working immediately, so the device will fall back to its pairing screen until the new one is entered. Do this from somewhere you can reach the screen."
        confirmLabel="Rotate secret"
        destructive
        loading={rotate.isPending}
        onConfirm={() => rotating && rotate.mutate(rotating.id)}
        onClose={() => setRotating(null)}
      />

      <ConfirmDialog
        open={revoking !== null}
        title={`Revoke ${revoking?.name ?? 'this device'}?`}
        message="Revocation is terminal — a revoked device is never reactivated, a replacement is provisioned instead. It stops working on its very next request, because the device row is re-read every time."
        confirmLabel="Revoke device"
        destructive
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        onClose={() => setRevoking(null)}
      />
    </Page>
  )
}

function ProvisionModal({
  open,
  onClose,
  onProvisioned,
}: {
  open: boolean
  onClose: () => void
  onProvisioned: (result: ProvisionedDevice) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', room: '' })

  const provision = useMutation({
    mutationFn: () =>
      devicesApi.provision({ name: form.name, room: form.room || null }),
    onSuccess: (result) => {
      setForm({ name: '', room: '' })
      onProvisioned(result)
    },
    onError: (caught) => toast.error(getErrorMessage(caught)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    provision.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Provision a device"
      description="Creates a credential. The secret is shown once and never again."
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name"
          required
          placeholder="B-204 wall screen"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />

        <Input
          label="Room"
          placeholder="B-204"
          hint="Bind it to a room and it only ever shows that room's sessions. Leave empty and it serves the whole university."
          value={form.room}
          onChange={(event) => setForm({ ...form, room: event.target.value })}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={provision.isPending}>
            Provision
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CredentialModal({
  credential,
  onClose,
}: {
  credential: ProvisionedDevice | null
  onClose: () => void
}) {
  const toast = useToast()

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy — select the text and copy it by hand')
    }
  }

  return (
    <Modal
      open={credential !== null}
      onClose={onClose}
      title="Device credential"
      description="This is the only time the secret is shown."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-warning-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
          <p className="text-sm text-warning-800">
            {credential?.credentials.warning ??
              'Only a bcrypt hash of this secret is stored, so it cannot be read back. If it is lost, rotate the secret and pair the screen again.'}
          </p>
        </div>

        <CredentialRow
          label="Device key id"
          value={credential?.credentials.deviceKeyId ?? ''}
          onCopy={copy}
        />
        <CredentialRow
          label="Device secret"
          value={credential?.credentials.deviceSecret ?? ''}
          onCopy={copy}
        />

        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Enter both on the screen at{' '}
          <span className="font-mono text-slate-900">/robot</span>.
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>I have copied them</Button>
        </div>
      </div>
    </Modal>
  )
}

function CredentialRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: (label: string, value: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100">
          {value}
        </code>
        <Button
          variant="secondary"
          icon={Copy}
          onClick={() => onCopy(label, value)}
          aria-label={`Copy ${label}`}
        />
      </div>
    </div>
  )
}
