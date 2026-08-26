import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { UserRole } from '../../types/api'

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

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_OWNER: 'System Owner',
  UNIVERSITY_ADMIN: 'University Admin',
  DEPARTMENT_ADMIN: 'Department Admin',
  INSTRUCTOR: 'Instructor',
  STUDENT: 'Student',
}

const ROLE_TONES: Record<UserRole, Tone> = {
  SYSTEM_OWNER: 'purple',
  UNIVERSITY_ADMIN: 'primary',
  DEPARTMENT_ADMIN: 'purple',
  INSTRUCTOR: 'accent',
  STUDENT: 'neutral',
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={ROLE_TONES[role] ?? 'neutral'}>{ROLE_LABELS[role] ?? role}</Badge>
}
