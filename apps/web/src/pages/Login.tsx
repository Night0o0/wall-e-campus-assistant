import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/api'
import { routeAfterLogin } from '../lib/navigation'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'

export function Login() {
  const { user, isLoading: isRestoringSession, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isRestoringSession && user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={routeAfterLogin(user.role, from)} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const profile = await login(email.trim(), password)
      const from = (location.state as { from?: string } | null)?.from

      navigate(routeAfterLogin(profile.role, from), { replace: true })
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
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">Leornian</p>
            <p className="text-xs text-white/70">University platform</p>
          </div>
        </div>

        {/* One login for three roles now, so the copy no longer describes only
            the platform owner's console. Students sign in on the mobile app. */}
        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Campus attendance,
            <br />
            without the paperwork.
          </h1>
          <p className="mt-4 text-white/80">
            Timetables, attendance sessions and course material for teaching
            staff, university administrators, and students on web and mobile.
          </p>
        </div>

        <p className="text-sm text-white/60">
          © {new Date().getFullYear()} Leornian
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Leornian</p>
              <p className="text-xs text-slate-500">University platform</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your Leornian account.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {(searchParams.get('registered') === '1' || searchParams.get('password-reset') === '1') && (
              <div className="rounded-lg bg-success-50 p-3 text-sm text-success-700">
                {searchParams.get('registered') === '1'
                  ? 'Registration completed. Sign in to finish your profile and view approval status.'
                  : 'Password updated. Sign in with your new password.'}
              </div>
            )}
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
              placeholder="owner@leornian.local"
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
          <p className="mt-5 text-center text-sm text-slate-500">
            Student without an account?{' '}
            <Link className="font-semibold text-primary-600" to="/register">
              Register
            </Link>
          </p>
          <p className="mt-2 text-center text-sm">
            <Link className="font-semibold text-primary-600" to="/forgot-password">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
