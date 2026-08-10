import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Bot, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'

export function Login() {
  const { user, isLoading: isRestoringSession, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isRestoringSession && user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const profile = await login(email.trim(), password)

      if (profile.role !== 'SYSTEM_OWNER') {
        // Signed in successfully, but this console isn't for them.
        setError(
          'This dashboard is for platform owners. Your account does not have access.'
        )
        return
      }

      navigate((location.state as { from?: string } | null)?.from ?? '/', {
        replace: true,
      })
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between gradient-primary p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">WALL-E</p>
            <p className="text-xs text-white/70">Platform Console</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Campus attendance,
            <br />
            run as a platform.
          </h1>
          <p className="mt-4 text-white/80">
            Manage every university on WALL-E — subscriptions, billing, users and
            revenue — from a single console.
          </p>
        </div>

        <p className="text-sm text-white/60">
          © {new Date().getFullYear()} WALL-E Campus Assistant
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900">WALL-E</p>
              <p className="text-xs text-slate-500">Platform Console</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your platform owner account.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@wall-e.io"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-[34px] text-slate-400 transition-colors hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <Button
              type="submit"
              loading={submitting}
              className="w-full"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
