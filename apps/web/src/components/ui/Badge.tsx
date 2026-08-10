import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type {
  InvoiceStatus,
  OrganizationStatus,
  PaymentStatus,
  UserRole,
} from '../../types/api'

type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'purple'

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  primary: 'bg-primary-100 text-primary-700',
  accent: 'bg-accent-100 text-accent-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-danger-100 text-danger-700',
  purple: 'bg-purple-100 text-purple-700',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

const SUBSCRIPTION_TONES: Record<OrganizationStatus, Tone> = {
  ACTIVE: 'success',
  TRIAL: 'warning',
  PAST_DUE: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  NONE: 'neutral',
}

const SUBSCRIPTION_LABELS: Record<OrganizationStatus, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  PAST_DUE: 'Past due',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  NONE: 'No plan',
}

export function StatusBadge({ status }: { status: OrganizationStatus }) {
  return (
    <Badge tone={SUBSCRIPTION_TONES[status] ?? 'neutral'}>
      {SUBSCRIPTION_LABELS[status] ?? status}
    </Badge>
  )
}

const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  PAID: 'success',
  SENT: 'primary',
  DRAFT: 'neutral',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
}

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge tone={INVOICE_TONES[status] ?? 'neutral'}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  COMPLETED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'neutral',
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONES[status] ?? 'neutral'}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_OWNER: 'System Owner',
  UNIVERSITY_SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  STUDENT: 'Student',
}

const ROLE_TONES: Record<UserRole, Tone> = {
  SYSTEM_OWNER: 'purple',
  UNIVERSITY_SUPER_ADMIN: 'primary',
  ADMIN: 'accent',
  STUDENT: 'neutral',
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={ROLE_TONES[role] ?? 'neutral'}>{ROLE_LABELS[role] ?? role}</Badge>
}
