import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={style}
      className={cn('animate-pulse rounded bg-slate-100', className)}
    />
  )
}

/** Placeholder matching the footprint of a StatsCard. */
export function StatsCardSkeleton() {
  return (
    <div className="rounded-xl bg-white p-6 card-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-12 w-12 rounded-lg" />
      </div>
    </div>
  )
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="flex flex-col justify-end gap-2" style={{ height }}>
      <div className="flex flex-1 items-end gap-3">
        {[45, 70, 55, 85, 60, 95, 75, 100].map((value, index) => (
          <Skeleton
            key={index}
            className="flex-1 rounded-t"
            // Static ramp so the placeholder reads as a chart, not noise.
            style={{ height: `${value}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  )
}
