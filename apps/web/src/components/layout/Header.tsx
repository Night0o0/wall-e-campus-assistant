import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  onMenuClick?: () => void
}

export function Header({ title, subtitle, actions, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="truncate text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
