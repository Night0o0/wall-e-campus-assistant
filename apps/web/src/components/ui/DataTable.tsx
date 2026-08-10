import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import type { PageMeta } from '../../types/api'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  isLoading?: boolean
  error?: unknown
  meta?: PageMeta
  onPageChange?: (page: number) => void
  emptyTitle?: string
  emptyMessage?: string
  emptyAction?: ReactNode
  onRetry?: () => void
  toolbar?: ReactNode
}

const alignment = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  meta,
  onPageChange,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'No records match the current filters.',
  emptyAction,
  onRetry,
  toolbar,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && !error && rows.length === 0

  return (
    <div className="rounded-xl bg-white card-shadow">
      {toolbar && (
        <div className="border-b border-slate-200 p-4 sm:p-6">{toolbar}</div>
      )}

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50">
            <AlertCircle className="h-6 w-6 text-danger-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">Couldn't load this data</p>
            <p className="mt-1 text-sm text-slate-500">
              {error instanceof Error ? error.message : 'Please try again.'}
            </p>
          </div>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Inbox className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{emptyTitle}</p>
            <p className="mt-1 text-sm text-slate-500">{emptyMessage}</p>
          </div>
          {emptyAction}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500',
                      alignment[column.align ?? 'left'],
                      column.className
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading
                ? Array.from({ length: 5 }).map((_, rowIndex) => (
                    <tr key={`skeleton-${rowIndex}`}>
                      {columns.map((column) => (
                        <td key={column.key} className="px-6 py-4">
                          <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-slate-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className="transition-colors hover:bg-slate-50"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-6 py-4',
                            alignment[column.align ?? 'left'],
                            column.className
                          )}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && onPageChange && !error && (
        <Pagination meta={meta} onPageChange={onPageChange} loading={isLoading} />
      )}
    </div>
  )
}

function Pagination({
  meta,
  onPageChange,
  loading,
}: {
  meta: PageMeta
  onPageChange: (page: number) => void
  loading?: boolean
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1
  const to = Math.min(meta.page * meta.limit, meta.total)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-900">{from}</span> to{' '}
        <span className="font-medium text-slate-900">{to}</span> of{' '}
        <span className="font-medium text-slate-900">{meta.total}</span> results
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={!meta.hasPrev || loading}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </Button>
        <span className="px-2 text-sm text-slate-500">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasNext || loading}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
