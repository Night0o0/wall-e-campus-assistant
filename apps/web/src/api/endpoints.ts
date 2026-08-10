import { api } from '../lib/api'
import type {
  AuthUser,
  Invoice,
  ListParams,
  LoginResponse,
  MetricsOverview,
  Organization,
  Paginated,
  Payment,
  Plan,
  RevenueMetrics,
  Subscription,
  User,
  UserStats,
} from '../types/api'

/** Drops empty values so we don't send `?search=` on every request. */
const clean = (params: ListParams = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null
    )
  )

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  profile: () =>
    api.get<{ user: AuthUser }>('/auth/profile').then((r) => r.data.user),

  updateProfile: (data: { fullName?: string; email?: string }) =>
    api.patch<{ user: AuthUser }>('/auth/profile', data).then((r) => r.data.user),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .patch<{ message: string }>('/auth/password', { currentPassword, newPassword })
      .then((r) => r.data),
}

export const organizationsApi = {
  list: (params: ListParams) =>
    api
      .get<Paginated<Organization>>('/organizations', { params: clean(params) })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<Organization>(`/organizations/${id}`).then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<Organization>('/organizations', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Organization>(`/organizations/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/organizations/${id}`).then((r) => r.data),
}

export const usersApi = {
  list: (params: ListParams) =>
    api.get<Paginated<User>>('/users', { params: clean(params) }).then((r) => r.data),

  stats: () => api.get<UserStats>('/users/stats').then((r) => r.data),

  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),

  resetPassword: (id: string, password: string) =>
    api
      .patch<{ message: string }>(`/users/${id}/password`, { password })
      .then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/users/${id}`).then((r) => r.data),
}

export const plansApi = {
  list: (includeInactive = true) =>
    api
      .get<Plan[]>('/plans', { params: { includeInactive } })
      .then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<Plan>('/plans', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Plan>(`/plans/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/plans/${id}`).then((r) => r.data),
}

export const subscriptionsApi = {
  list: (params: ListParams) =>
    api
      .get<Paginated<Subscription>>('/subscriptions', { params: clean(params) })
      .then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<Subscription>('/subscriptions', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Subscription>(`/subscriptions/${id}`, data).then((r) => r.data),

  cancel: (id: string) =>
    api.patch<Subscription>(`/subscriptions/${id}/cancel`).then((r) => r.data),

  renew: (id: string) =>
    api.patch<Subscription>(`/subscriptions/${id}/renew`).then((r) => r.data),
}

export const invoicesApi = {
  list: (params: ListParams) =>
    api
      .get<Paginated<Invoice>>('/invoices', { params: clean(params) })
      .then((r) => r.data),

  get: (id: string) => api.get<Invoice>(`/invoices/${id}`).then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<Invoice>('/invoices', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Invoice>(`/invoices/${id}`, data).then((r) => r.data),

  markPaid: (id: string, paymentMethod?: string) =>
    api.patch<Invoice>(`/invoices/${id}/pay`, { paymentMethod }).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/invoices/${id}`).then((r) => r.data),
}

export const paymentsApi = {
  list: (params: ListParams) =>
    api
      .get<Paginated<Payment>>('/payments', { params: clean(params) })
      .then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<Payment>('/payments', data).then((r) => r.data),

  refund: (id: string) =>
    api.patch<Payment>(`/payments/${id}/refund`).then((r) => r.data),
}

export const metricsApi = {
  overview: (months = 8) =>
    api
      .get<MetricsOverview>('/metrics/overview', { params: { months } })
      .then((r) => r.data),

  revenue: (months = 8) =>
    api
      .get<RevenueMetrics>('/metrics/revenue', { params: { months } })
      .then((r) => r.data),
}
