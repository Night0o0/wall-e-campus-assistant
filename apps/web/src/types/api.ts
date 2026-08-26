export type UserRole =
  | 'SYSTEM_OWNER'
  | 'UNIVERSITY_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'INSTRUCTOR'
  | 'STUDENT'

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'

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
  accountStatus: AccountStatus
  isVerified: boolean
  isActive: boolean
  organizationId: string
  departmentId?: string | null
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

export interface Organization {
  id: string
  name: string
  code: string
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  logo: string | null
  createdAt: string
  updatedAt: string
  _count: {
    users: number
    courses: number
    sessions: number
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

export interface MetricsOverview {
  totals: {
    organizations: number
    users: number
    students: number
    courses: number
    sessions: number
  }
  changes: {
    organizations: number
    users: number
    students: number
  }
  topOrganizations: Array<{
    id: string
    name: string
    code: string
    users: number
    courses: number
    sessions: number
  }>
  recentOrganizations: Array<{
    id: string
    name: string
    code: string
    createdAt: string
    users: number
    courses: number
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
