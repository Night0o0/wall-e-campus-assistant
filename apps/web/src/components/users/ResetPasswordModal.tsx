import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'
import { useResetUserPassword } from '../../hooks/queries'
import type { User } from '../../types/api'

interface Props {
  open: boolean
  onClose: () => void
  user?: User | null
}

export function ResetPasswordModal({ open, onClose, user }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirm('')
    setError(null)
  }, [open])

  const reset = useResetUserPassword(onClose)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setError(null)
    if (user) reset.mutate({ id: user.id, password })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset password"
      description={user ? `Set a new password for ${user.fullName}.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" loading={reset.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="At least 8 characters"
        />
        <Input
          label="Confirm password"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={error ?? undefined}
        />
        <p className="text-xs text-slate-500">
          The user is not notified automatically — share the new password with them
          yourself.
        </p>
      </form>
    </Modal>
  )
}
