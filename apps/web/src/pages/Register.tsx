import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, GraduationCap } from 'lucide-react'
import { api, getErrorMessage, tokenStorage } from '../lib/api'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'

const PENDING_KEY = 'leornian.pendingRegistration'

interface PendingRegistration {
  universityId: string
  fullName: string
  organizationCode: string
}

async function completeRegistration(
  registration: PendingRegistration,
  accessToken: string
) {
  tokenStorage.set(accessToken)
  return api.post(
    '/auth/register/supabase',
    registration,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
}

export function Register() {
  const [form, setForm] = useState({
    organizationCode: '',
    universityId: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!supabaseConfigured) {
      setError('Student registration is not configured on this deployment yet.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const registration: PendingRegistration = {
      organizationCode: form.organizationCode.trim().toUpperCase(),
      universityId: form.universityId.trim(),
      fullName: form.fullName.trim(),
    }

    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(registration))
      const { data, error: signUpError } = await supabase!.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/register/complete`,
        },
      })

      if (signUpError) throw signUpError

      if (data.session) {
        await completeRegistration(registration, data.session.access_token)
        localStorage.removeItem(PENDING_KEY)
      }

      setSent(true)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to create your account'))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthCanvas>
        <CheckCircle2 className="h-12 w-12 text-success-500" />
        <h1 className="mt-5 text-2xl font-bold text-white">Check your email</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Confirm your address to finish registration. After confirmation, your
          account will wait for university approval.
        </p>
        <Link className="mt-6 inline-block text-sm font-semibold text-primary-300" to="/login">
          Return to sign in
        </Link>
      </AuthCanvas>
    )
  }

  return (
    <AuthCanvas wide>
      <h1 className="text-2xl font-bold text-white">Student registration</h1>
      <p className="mt-2 text-sm text-slate-400">
        Create a student account. Staff accounts are issued by the university.
      </p>
      <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2 flex gap-3 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-100">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <Input label="University code" required value={form.organizationCode} onChange={(e) => change('organizationCode', e.target.value)} />
        <Input label="University ID" required value={form.universityId} onChange={(e) => change('universityId', e.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Full name" required value={form.fullName} onChange={(e) => change('fullName', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Input label="University email" type="email" required value={form.email} onChange={(e) => change('email', e.target.value)} />
        </div>
        <Input label="Password" type="password" minLength={8} required value={form.password} onChange={(e) => change('password', e.target.value)} />
        <Input label="Confirm password" type="password" minLength={8} required value={form.confirmPassword} onChange={(e) => change('confirmPassword', e.target.value)} />
        <div className="sm:col-span-2">
          <Button className="w-full" loading={submitting}>Create student account</Button>
        </div>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        Already registered? <Link className="font-semibold text-primary-300" to="/login">Sign in</Link>
      </p>
    </AuthCanvas>
  )
}

export function CompleteRegistration() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Finishing your registration…')

  useEffect(() => {
    void (async () => {
      try {
        const raw = localStorage.getItem(PENDING_KEY)
        const { data } = await supabase!.auth.getSession()
        if (!raw || !data.session) throw new Error('Registration details or session are missing.')
        await completeRegistration(JSON.parse(raw) as PendingRegistration, data.session.access_token)
        localStorage.removeItem(PENDING_KEY)
        navigate('/', { replace: true })
      } catch (caught) {
        setMessage(getErrorMessage(caught, 'Registration could not be completed.'))
      }
    })()
  }, [navigate])

  return <AuthCanvas><p className="text-sm text-slate-300">{message}</p></AuthCanvas>
}

function AuthCanvas({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-[#080c18] px-5 py-10 text-white">
      <div className={`mx-auto ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-white/10 bg-[#111827]/90 p-7 shadow-2xl`}>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary"><GraduationCap className="h-6 w-6" /></div>
          <div><p className="font-bold">Leornian</p><p className="text-xs text-slate-400">University platform</p></div>
        </div>
        {children}
      </div>
    </div>
  )
}
