import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  FileText,
  Settings,
  Bot,
  Layers,
  TrendingUp,
  LogOut,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { billingEnabled } from '../../lib/features'
import { useAuth } from '../../context/AuthContext'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true },
  { name: 'Revenue', href: '/revenue', icon: TrendingUp, billing: true },
  { name: 'Organizations', href: '/organizations', icon: Building2 },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Subscriptions', href: '/subscriptions', icon: CreditCard, billing: true },
  { name: 'Plans', href: '/plans', icon: Layers, billing: true },
  { name: 'Invoices', href: '/invoices', icon: FileText, billing: true },
  { name: 'Robots', href: '/robots', icon: Bot },
  { name: 'Settings', href: '/settings', icon: Settings },
].filter((item) => billingEnabled || !item.billing)

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user, logout } = useAuth()

  return (
    <>
      {/* Backdrop, mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">WALL-E</h1>
            <p className="text-xs text-slate-500">Platform Console</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
              <span className="text-sm font-semibold text-primary-700">
                {user ? initials(user.fullName) : '—'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {user?.fullName ?? 'Not signed in'}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-danger-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
