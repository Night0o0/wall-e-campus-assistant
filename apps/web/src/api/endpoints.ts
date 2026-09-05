import { api } from '../lib/api'
import type {
  AuthUser,
  ListParams,
  LoginResponse,
  MetricsOverview,
  Organization,
  Paginated,
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

export const metricsApi = {
  overview: (months = 8) =>
    api
      .get<MetricsOverview>('/metrics/overview', { params: { months } })
      .then((r) => r.data),
}
