import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Bot, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { homeRouteFor } from '../../lib/navigation'

function BootScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl gradient-primary">
        <Bot className="h-8 w-8 text-white" />
      </div>
      <p className="text-sm text-slate-500">Loading your dashboard…</p>
    </div>
  )
}

/**
 * The gate.
 *
 * It used to admit SYSTEM_OWNER and nobody else, because the platform console
 * was the only thing behind it. Now three roles have route trees of their own,
 * so the gate takes the roles it admits as a prop and each tree names its own.
 *
 * Two things it deliberately does NOT do:
 *
 * Redirect a signed-in user who lacks the role to somewhere they do have. That
 * turns a mistyped URL into a silent teleport, and makes a genuine permissions
 * problem look like a routing quirk. It says what happened instead, and offers
 * the way back.
 *
 * Pending students may authenticate to finish account setup, but cannot enter
 * academic feature routes before university approval.
 */
export function ProtectedRoute({ roles }: { roles: string[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <BootScreen />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!roles.includes(user.role)) {
    return <AccessDenied />
  }

  return <Outlet />
}

function Shell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center card-shadow">
        {icon}
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        <div className="mt-2 text-sm text-slate-500">{children}</div>
        <button
          onClick={logout}
          className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function AccessDenied() {
  const { user } = useAuth()

  return (
    <Shell
      icon={
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-50">
          <ShieldAlert className="h-7 w-7 text-danger-600" />
        </div>
      }
      title="You cannot open this page"
    >
      <p>
        Your account
        {user ? ` (${user.email})` : ''} has the{' '}
        <span className="font-medium text-slate-700">{user?.role}</span> role,
        which does not include this page.
      </p>
      {user && (
        <a
          href={homeRouteFor(user.role)}
          className="mt-4 inline-block font-medium text-primary-600 hover:text-primary-700"
        >
          Go to your dashboard
        </a>
      )}
    </Shell>
  )
}
