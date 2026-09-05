import { api } from '../lib/api'
import type { ListParams, Paginated } from '../types/api'
import type {
  AssignmentGradebook,
  AssignmentOfferingOption,
  AttendanceRow,
  CampusAssignment,
  CampusNotification,
  CampusSession,
  CampusUser,
  Course,
  CourseMaterial,
  Department,
  LectureSchedule,
  OrganizationOverview,
  PendingStudent,
  QrToken,
  SessionStats,
  StudentAttendanceHistoryRow,
  StudentAttendanceSummary,
  StudentMaterials,
  StudentProfile,
  StudentTimetable,
} from '../types/campus'

/**
 * The university-scoped endpoints.
 *
 * Note what no function here accepts: an organization id. The tenant comes from
 * the caller's token on the server side and the query schemas do not even
 * declare the field, so sending one would be stripped before it reached a
 * service. Adding one to this file would therefore be dead weight at best and a
 * misleading suggestion that it does something at worst.
 */

const clean = (params: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null
    )
  )

/* ------------------------------ Administration ---------------------------- */

export const campusAdminApi = {
  /** The super admin's university-wide dashboard. */
  overview: () =>
    api.get<OrganizationOverview>('/admin/overview').then((r) => r.data),

  /**
   * The instructor's own lectures — nobody else's.
   *
   * The envelope is `{ instructorId, count, schedules }`. The plural matters:
   * reading `schedule` here silently yielded `undefined`, fell through to an
   * empty array, and left every instructor looking at "No lectures assigned" —
   * on their landing page, and in the lecture picker they publish material
   * from. It typechecked because the declared union described the guess rather
   * than the server.
   */
  myTeachingSchedule: () =>
    api
      .get<{ instructorId: string; count: number; schedules: LectureSchedule[] }>(
        '/admin/schedule'
      )
      .then((r) => r.data.schedules ?? []),

  users: (params: ListParams & Record<string, unknown>) =>
    api
      .get<Paginated<CampusUser>>('/admin/users', { params: clean(params) })
      .then((r) => r.data),

  user: (id: string) =>
    api
      .get<{ user: CampusUser } | CampusUser>(`/admin/users/${id}`)
      .then((r) => ('user' in r.data ? r.data.user : r.data)),

  createUser: (data: Record<string, unknown>) =>
    api.post<CampusUser>('/admin/users', data).then((r) => r.data),

  updateUser: (id: string, data: Record<string, unknown>) =>
    api.patch<CampusUser>(`/admin/users/${id}`, data).then((r) => r.data),

  /**
   * Set somebody else's password. This is the staff recovery path: an INSTRUCTOR who
   * forgets theirs contacts the super admin, who uses this. Staff are
   * deliberately excluded from the emailed self-service reset — see
   * AuthService.requestPasswordReset.
   */
  resetUserPassword: (id: string, password: string) =>
    api
      .patch<{ message: string }>(`/admin/users/${id}/password`, {
        newPassword: password,
      })
      .then((r) => r.data),

  pendingStudents: (params: ListParams = {}) =>
    api
      .get<Paginated<PendingStudent>>('/admin/students/pending', {
        params: clean(params),
      })
      .then((r) => r.data),

  approveStudent: (id: string) =>
    api
      .patch<{ message?: string }>(`/admin/students/${id}/approve`)
      .then((r) => r.data),

  rejectStudent: (id: string) =>
    api
      .patch<{ message?: string }>(`/admin/students/${id}/reject`)
      .then((r) => r.data),
}

/* ------------------------------- Departments ------------------------------ */

export const departmentsApi = {
  list: (params: ListParams & Record<string, unknown> = {}) =>
    api
      .get<Paginated<Department>>('/departments', { params: clean(params) })
      .then((r) => r.data),

  get: (id: string) =>
    api
      .get<{ data: Department }>(`/departments/${id}`)
      .then((r) => r.data.data),

  create: (data: { code: string; name: string }) =>
    api
      .post<{ data: Department }>('/departments', data)
      .then((r) => r.data.data),

  update: (id: string, data: { code?: string; name?: string; isActive?: boolean }) =>
    api
      .patch<{ data: Department }>(`/departments/${id}`, data)
      .then((r) => r.data.data),
}

/* -------------------------------- Students ------------------------------- */

export const studentsApi = {
  profile: () =>
    api
      .get<{ profile: StudentProfile }>('/students/me/profile')
      .then((r) => r.data.profile),

  updateProfile: (data: Record<string, unknown>) =>
    api
      .patch<{ profile: StudentProfile }>('/students/me/profile', data)
      .then((r) => r.data.profile),

  schedule: () =>
    api.get<StudentTimetable>('/students/me/schedule').then((r) => r.data),
}

/* -------------------------------- Timetable ------------------------------- */

export const schedulesApi = {
  list: (params: Record<string, unknown> = {}) =>
    api
      .get<Paginated<LectureSchedule>>('/schedules', { params: clean(params) })
      .then((r) => r.data),

  get: (id: string) =>
    api
      .get<{ schedule: LectureSchedule } | LectureSchedule>(`/schedules/${id}`)
      .then((r) => ('schedule' in r.data ? r.data.schedule : r.data)),

  create: (data: Record<string, unknown>) =>
    api.post<{ schedule: LectureSchedule }>('/schedules', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api
      .patch<{ schedule: LectureSchedule }>(`/schedules/${id}`, data)
      .then((r) => r.data),

  /** Soft delete. A lecture with attendance behind it is never hard deleted. */
  deactivate: (id: string) =>
    api.patch<{ message: string }>(`/schedules/${id}/deactivate`).then((r) => r.data),

  attendanceLog: (id: string) =>
    api.get<unknown>(`/schedules/${id}/attendance-log`).then((r) => r.data),
}

/* --------------------------------- Courses -------------------------------- */

export const coursesApi = {
  list: (params: Record<string, unknown> = {}) =>
    api
      .get<Paginated<Course> | Course[]>('/courses', { params: clean(params) })
      .then((r) => (Array.isArray(r.data) ? { data: r.data, meta: undefined } : r.data)),

  mine: () =>
    api
      .get<Paginated<Course> | Course[]>('/courses/my')
      .then((r) =>
        Array.isArray(r.data) ? { data: r.data, meta: undefined } : r.data
      ),

  get: (id: string) =>
    api
      .get<{ course: Course } | Course>(`/courses/${id}`)
      .then((r) => ('course' in r.data ? r.data.course : r.data)),

  create: (data: Record<string, unknown>) =>
    api.post<Course>('/courses', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Course>(`/courses/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/courses/${id}`).then((r) => r.data),

  /**
   * The roster export. An INSTRUCTOR may only export a course they are assigned to;
   * a super admin may export any course in their own university.
   *
   * Returned as a blob because the server sends a real .xlsx — reading it as
   * JSON would corrupt it.
   */
  exportStudents: (id: string) =>
    api
      .get<Blob>(`/courses/${id}/students/export`, { responseType: 'blob' })
      .then((r) => ({
        blob: r.data,
        filename:
          /filename="?([^"]+)"?/.exec(
            String(r.headers['content-disposition'] ?? '')
          )?.[1] ?? 'students.xlsx',
      })),
}

export const assignmentsApi = {
  list: () =>
    api
      .get<{ assignments: CampusAssignment[] }>('/assignments')
      .then((response) => response.data.assignments),
  options: () =>
    api
      .get<{ offerings: AssignmentOfferingOption[] }>('/assignments/options')
      .then((response) => response.data.offerings),
  create: (data: Record<string, unknown>) =>
    api
      .post<{ assignment: CampusAssignment }>('/assignments', data)
      .then((response) => response.data.assignment),
  update: (id: string, data: Record<string, unknown>) =>
    api
      .patch<{ assignment: CampusAssignment }>(`/assignments/${id}`, data)
      .then((response) => response.data.assignment),
  publish: (id: string) =>
    api
      .post<{ assignment: CampusAssignment }>(`/assignments/${id}/publish`)
      .then((response) => response.data.assignment),
  gradebook: (id: string) =>
    api.get<AssignmentGradebook>(`/assignments/${id}/gradebook`).then((r) => r.data),
  grade: (
    id: string,
    studentId: string,
    data: { score: number; feedback?: string | null; publish?: boolean }
  ) =>
    api
      .put<{ grade: unknown }>(`/assignments/${id}/grades/${studentId}`, data)
      .then((response) => response.data.grade),
}

/* -------------------------------- Sessions -------------------------------- */

export const sessionsApi = {
  /**
   * GET /sessions is paginated (D-2). Tolerates a bare array so a stale
   * deployment does not blank the page.
   */
  list: (params: Record<string, unknown> = {}) =>
    api
      .get<Paginated<CampusSession> | CampusSession[]>('/sessions', {
        params: clean(params),
      })
      .then((r) =>
        Array.isArray(r.data) ? { data: r.data, meta: undefined } : r.data
      ),

  get: (id: string) =>
    api
      .get<{ session: CampusSession } | CampusSession>(`/sessions/${id}`)
      .then((r) => ('session' in r.data ? r.data.session : r.data)),

  /**
   * Opening attendance is a human act. Pass `lectureScheduleId` wherever there
   * is a lecture behind it — an ad-hoc session has no cohort, so nothing can be
   * checked against it, and it is what SCAN_ALLOW_UNLINKED_SESSIONS exists for.
   */
  create: (data: { title: string; lectureScheduleId?: string; room?: string }) =>
    api.post<{ session: CampusSession } | CampusSession>('/sessions', data).then((r) =>
      'session' in r.data ? r.data.session : r.data
    ),

  close: (id: string) =>
    api.patch<CampusSession>(`/sessions/${id}/close`).then((r) => r.data),

  /** Expires in 30 seconds. Refresh at ~25. */
  qr: (id: string) => api.get<QrToken>(`/sessions/${id}/qr`).then((r) => r.data),
}

export const attendanceApi = {
  history: (params: { courseId?: string } = {}) =>
    api
      .get<StudentAttendanceHistoryRow[]>('/attendance/history', {
        params: clean(params),
      })
      .then((r) => r.data),

  summary: () =>
    api
      .get<StudentAttendanceSummary>('/attendance/summary')
      .then((r) => r.data),

  bySession: (sessionId: string) =>
    api
      .get<{ attendance: AttendanceRow[] } | AttendanceRow[]>(
        `/attendance/session/${sessionId}`
      )
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.attendance ?? []))),

  sessionStats: (sessionId: string) =>
    api
      .get<SessionStats>(`/attendance/session/${sessionId}/stats`)
      .then((r) => r.data),

  analytics: (params: Record<string, unknown> = {}) =>
    api.get<unknown>('/attendance/analytics', { params: clean(params) }).then((r) => r.data),
}

/* -------------------------------- Materials ------------------------------- */

export const materialsApi = {
  mine: () =>
    api.get<StudentMaterials>('/materials/my').then((r) => r.data),

  list: (params: Record<string, unknown> = {}) =>
    api
      .get<Paginated<CourseMaterial> | CourseMaterial[]>('/materials', {
        params: clean(params),
      })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.data)),

  /**
   * An INSTRUCTOR publishes by naming one of their OWN lectures: the service copies
   * the academic address off it, which is simultaneously the proof they teach
   * that cohort. Naming a cohort directly is refused for an INSTRUCTOR and is the
   * super admin's form of the same call.
   */
  create: (data: {
    courseId: string
    title: string
    driveUrl: string
    scheduleId?: string
    cohort?: {
      faculty: string
      department: string
      level: number
      semester: number
      section?: string | null
    }
  }) => api.post<CourseMaterial>('/materials', data).then((r) => r.data),

  /** The cohort is not editable — re-addressing a link is a different link. */
  update: (id: string, data: { title?: string; driveUrl?: string; isActive?: boolean }) =>
    api.patch<CourseMaterial>(`/materials/${id}`, data).then((r) => r.data),

  deactivate: (id: string) =>
    api.patch<CourseMaterial>(`/materials/${id}/deactivate`).then((r) => r.data),
}

/* ------------------------------ Notifications ----------------------------- */

export const notificationsApi = {
  list: (params: Record<string, unknown> = {}) =>
    api
      .get<Paginated<CampusNotification> | CampusNotification[]>('/notifications', {
        params: clean(params),
      })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.data)),

  /** The server's field is `unreadCount`, not `count`. */
  unreadCount: () =>
    api
      .get<{ unreadCount: number }>('/notifications/unread-count')
      .then((r) => r.data.unreadCount ?? 0),

  markRead: (id: string) =>
    api.patch<{ message: string }>(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    api.patch<{ message: string }>('/notifications/read-all').then((r) => r.data),

  /**
   * Simulation tools.
   *
   * These paths only exist when the SERVER has dev tools enabled, which is
   * forced off in production regardless of configuration — there they 404 like
   * any unknown route. They are also restricted to UNIVERSITY_ADMIN and
   * SYSTEM_OWNER, never a plain admin. The client hides them behind its own dev
   * check as well, so the buttons do not appear in a production build.
   */
  dev: {
    generate: (horizonMinutes?: number) =>
      api
        .post<{ created: number }>('/notifications/dev/generate', {
          horizonMinutes,
        })
        .then((r) => r.data),

    simulate: (lectureScheduleId: string) =>
      api
        .post<{ moved: number }>('/notifications/dev/simulate', {
          lectureScheduleId,
        })
        .then((r) => r.data),

    dispatch: () =>
      api.post<{ sent: number }>('/notifications/dev/dispatch').then((r) => r.data),
  },
}
