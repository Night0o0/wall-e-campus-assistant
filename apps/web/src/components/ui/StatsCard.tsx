import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatPercentage } from '../../lib/utils'

interface StatsCardProps {
  title: string
  value: string
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
  const isPositive = change !== undefined && change >= 0

  return (
    <div className="rounded-xl bg-white p-6 card-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {change !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-success-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-danger-500" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  isPositive ? 'text-success-600' : 'text-danger-600'
                )}
              >
                {formatPercentage(change)}
              </span>
              <span className="text-sm text-slate-400">{changeLabel}</span>
            </div>
          )}
        </div>
        <div className={cn('rounded-lg p-3', iconColors[iconColor])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}
