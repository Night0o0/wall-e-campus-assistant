import type { LucideIcon } from 'lucide-react'

type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  primary: 'bg-primary-100 text-primary-600',
  accent: 'bg-accent-100 text-accent-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
}

interface SummaryTileProps {
  icon: LucideIcon
  label: string
  value: string
  tone?: Tone
}

/** Compact icon + label + number tile used above the tables. */
export function SummaryTile({
  icon: Icon,
  label,
  value,
  tone = 'primary',
}: SummaryTileProps) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-6 card-shadow">
      <div className="flex items-center gap-4">
        <div className={`shrink-0 rounded-lg p-3 ${tones[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          {/* No truncate: a clipped currency figure is worse than a wrapped one. */}
          <p className="text-2xl font-bold tabular-nums break-words text-slate-900">
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}
