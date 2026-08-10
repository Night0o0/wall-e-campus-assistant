export type UserRole =
  | 'SYSTEM_OWNER'
  | 'UNIVERSITY_SUPER_ADMIN'
  | 'ADMIN'
  | 'STUDENT'

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED'

export type OrganizationStatus = SubscriptionStatus | 'NONE'

export type BillingCycle = 'MONTHLY' | 'YEARLY'

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'

export interface PageMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface Paginated<T> {
  data: T[]
  meta: PageMeta
}

export interface AuthUser {
  id: string
  universityId: string
  fullName: string
  email: string
  role: UserRole
  isVerified: boolean
  isActive: boolean
  organizationId: string
  organization?: {
    id: string
    name: string
    code: string
    logo: string | null
  }
  createdAt?: string
}

export interface LoginResponse {
  message: string
  token: string
  user: AuthUser
}

export interface Plan {
  id: string
  name: string
  description: string | null
  monthlyPrice: number
  yearlyPrice: number
  maxUsers: number
  maxRobots: number
  maxCourses: number
  features: string[] | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { subscriptions: number }
}

export interface Subscription {
  id: string
  planId: string
  plan: Plan
  status: SubscriptionStatus
  billingCycle: BillingCycle
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt: string | null
  cancelledAt: string | null
  createdAt: string
  organization: {
    id: string
    name: string
    code: string
    logo: string | null
  } | null
}

export interface Organization {
  id: string
  name: string
  code: string
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  logo: string | null
  subscriptionId: string | null
  subscription: Subscription | null
  createdAt: string
  updatedAt: string
  revenue: number
  planName: string | null
  status: OrganizationStatus
  _count: {
    users: number
    courses: number
    sessions: number
    invoices: number
    payments?: number
  }
  userBreakdown?: Record<string, number>
}

export interface User {
  id: string
  universityId: string
  fullName: string
  email: string
  role: UserRole
  isVerified: boolean
  isActive: boolean
  organizationId: string
  organization: { id: string; name: string; code: string } | null
  createdAt: string
  updatedAt: string
  _count?: {
    attendances: number
    createdCourses: number
    createdSessions: number
  }
}

export interface UserStats {
  total: number
  active: number
  inactive: number
  admins: number
  students: number
  owners: number
  byRole: Record<string, number>
}

export interface Invoice {
  id: string
  organizationId: string
  organization: { id: string; name: string; code: string }
  invoiceNumber: string
  amount: number
  tax: number
  total: number
  currency: string
  status: InvoiceStatus
  dueDate: string
  paidAt: string | null
  notes: string | null
  createdAt: string
  payments: Array<{
    id: string
    amount: number
    status: PaymentStatus
    paidAt: string | null
  }>
}

export interface Payment {
  id: string
  organizationId: string
  organization: { id: string; name: string; code: string }
  invoiceId: string | null
  invoice: { id: string; invoiceNumber: string; total: number } | null
  amount: number
  currency: string
  status: PaymentStatus
  paymentMethod: string | null
  transactionId: string | null
  description: string | null
  paidAt: string | null
  createdAt: string
}

export interface MetricsOverview {
  totals: {
    organizations: number
    users: number
    students: number
    activeSubscriptions: number
  }
  monthlyRevenue: {
    current: number
    previous: number
    changePercent: number
  }
  changes: {
    organizations: number
    users: number
    subscriptions: number
  }
  revenueSeries: Array<{
    month: string
    year: number
    revenue: number
    customers: number
  }>
  planDistribution: Array<{
    planId: string
    name: string
    value: number
    percentage: number
  }>
  recentTransactions: Array<{
    id: string
    organization: string
    organizationId: string
    amount: number
    currency: string
    status: PaymentStatus
    date: string
  }>
  topOrganizations: Array<{
    id: string
    name: string
    code: string
    users: number
    courses: number
    revenue: number
  }>
}

export interface RevenueMetrics {
  mrr: number
  arr: number
  arpu: number
  ltv: number | null
  churnRate: number
  activeSubscriptions: number
  lifetimeCollected: number
  movement: {
    newMrr: number
    churnedMrr: number
    netMrr: number
  }
  overdue: {
    amount: number
    count: number
  }
  mrrSeries: Array<{ month: string; year: number; revenue: number }>
  planRevenue: Array<{
    planId: string
    plan: string
    customers: number
    revenue: number
    percentage: number
  }>
}

export interface ListParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: string | number | boolean | undefined
}
