import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Bot, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

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
 * Gate for the platform console. Only SYSTEM_OWNER accounts belong here —
 * university staff would get 403s from every endpoint behind it.
 */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <BootScreen />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (user.role !== 'SYSTEM_OWNER') {
    return <AccessDenied />
  }

  return <Outlet />
}

function AccessDenied() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl bg-white p-8 text-center card-shadow">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-50">
          <ShieldAlert className="h-7 w-7 text-danger-600" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Platform access only
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This console is for platform owners. Your account
          {user ? ` (${user.email})` : ''} has the{' '}
          <span className="font-medium text-slate-700">{user?.role}</span> role.
        </p>
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
