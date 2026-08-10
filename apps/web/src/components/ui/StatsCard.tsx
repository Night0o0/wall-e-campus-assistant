import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, formatPercentage } from '../../lib/utils'

interface StatsCardProps {
  title: string
  value: string
  /** Omit to show `changeLabel` on its own as a plain caption. */
  change?: number
  changeLabel?: string
  icon: LucideIcon
  iconColor?: 'primary' | 'accent' | 'success' | 'warning' | 'danger'
}

const iconColors = {
  primary: 'bg-primary-100 text-primary-600',
  accent: 'bg-accent-100 text-accent-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel = 'vs last month',
  icon: Icon,
  iconColor = 'primary',
}: StatsCardProps) {
  const hasChange = change !== undefined
  const isFlat = change === 0
  const isPositive = hasChange && change > 0

  return (
    <div className="rounded-xl bg-white p-6 card-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          {/* Currency values need to survive a narrow 4-up grid without clipping. */}
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 xl:text-3xl">
            {value}
          </p>

          {hasChange ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {isFlat ? (
                <Minus className="h-4 w-4 text-slate-400" />
              ) : isPositive ? (
                <TrendingUp className="h-4 w-4 text-success-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-danger-500" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  isFlat
                    ? 'text-slate-500'
                    : isPositive
                      ? 'text-success-600'
                      : 'text-danger-600'
                )}
              >
                {formatPercentage(change)}
              </span>
              <span className="text-sm text-slate-400">{changeLabel}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">{changeLabel}</p>
          )}
        </div>

        <div className={cn('shrink-0 rounded-lg p-3', iconColors[iconColor])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}
