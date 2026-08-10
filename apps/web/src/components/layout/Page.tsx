import type { ReactNode } from 'react'
import { Header } from './Header'
import { useSidebar } from './useSidebar'

interface PageProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

/** Standard page frame: sticky header plus padded content. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  const { open } = useSidebar()

  return (
    <div className="min-h-screen">
      <Header
        title={title}
        subtitle={subtitle}
        actions={actions}
        onMenuClick={open}
      />
      <div className="space-y-6 p-4 sm:p-6">{children}</div>
    </div>
  )
}

/** White rounded container used for every card on a page. */
export function Card({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  // min-w-0: grid children default to min-width:auto, which lets a Recharts
  // ResponsiveContainer inflate its column and overflow the page.
  return (
    <div className={`min-w-0 rounded-xl bg-white p-6 card-shadow ${className}`}>
      {(title || actions) && (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-slate-500">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
