import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}

/** Short form for chart axes: $1.2k, $3.4M */
export function formatCompactCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

export function formatPercentage(num: number): string {
  return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

/** "3 days ago", "in 2 months" */
export function formatRelative(date: string | Date): string {
  const target = new Date(date).getTime()
  const diffDays = Math.round((target - Date.now()) / 86_400_000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day')
  if (Math.abs(diffDays) < 365)
    return formatter.format(Math.round(diffDays / 30), 'month')

  return formatter.format(Math.round(diffDays / 365), 'year')
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

/** Shared chart palette, kept in sync with the Tailwind theme. */
export const CHART_COLORS = [
  '#4f46e5',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#7c3aed',
  '#ef4444',
]

export const chartColor = (index: number) =>
  CHART_COLORS[index % CHART_COLORS.length]

/** Recharts tooltip styling used across every chart. */
export const tooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  fontSize: '12px',
}
