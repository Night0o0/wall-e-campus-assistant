import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, GraduationCap } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { getErrorMessage } from '../lib/api'
import {
  finishSupabasePasswordReset,
  requestSupabasePasswordReset,
} from '../lib/accountAuth'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await requestSupabasePasswordReset(email)
      setSent(true)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to start password recovery'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RecoveryCanvas>
      {sent ? (
        <>
          <CheckCircle2 className="h-11 w-11 text-success-500" />
          <h1 className="mt-5 text-2xl font-bold text-white">Check your email</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            If the address can recover an account, a secure reset link is on its way.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the email used for your Leornian account.
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Input label="Email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button className="w-full" loading={submitting}>Send reset link</Button>
          </form>
        </>
      )}
      <Link className="mt-6 inline-block text-sm font-semibold text-primary-300" to="/login">
        Return to sign in
      </Link>
    </RecoveryCanvas>
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await finishSupabasePasswordReset(form.password)
      navigate('/login?password-reset=1', { replace: true })
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to reset the password'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RecoveryCanvas>
      <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-400">Use at least eight characters.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <Input label="New password" type="password" minLength={8} required autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input label="Confirm new password" type="password" minLength={8} required autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
        <Button className="w-full" loading={submitting}>Update password</Button>
      </form>
    </RecoveryCanvas>
  )
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return <div role="alert" className="flex gap-3 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-100"><AlertCircle className="h-4 w-4 shrink-0" />{children}</div>
}

function RecoveryCanvas({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#080c18] px-5 py-10 text-white"><div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#111827]/90 p-7 shadow-2xl"><div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary"><GraduationCap className="h-6 w-6" /></div><div><p className="font-bold">Leornian</p><p className="text-xs text-slate-400">University platform</p></div></div>{children}</div></div>
}
