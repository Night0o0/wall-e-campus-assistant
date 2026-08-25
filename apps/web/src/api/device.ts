import { deviceApi } from '../lib/deviceApi'
import type { DeviceSelf, QrToken } from '../types/campus'

/** One entry in the robot's list of sessions it may display. */
export interface DeviceActiveSession {
  id: string
  title: string
  status: 'ACTIVE' | 'CLOSED'
  startTime: string
  courseId: string | null
  course: { id: string; courseCode: string; courseName: string } | null
  room: string | null
  lectureScheduleId: string | null
  /** Null for an ad-hoc session — the display must cope, not assume. */
  lecture: {
    id: string
    courseCode: string
    courseName: string
    instructor: string
    startTime: string
    endTime: string
  } | null
  attendanceCount: number
}

export interface DeviceActiveSessions {
  room: string | null
  roomFilterActive: boolean
  /** Sessions in this list with no room recorded. Zero on a migrated campus. */
  unlocatedCount: number
  /** ACTIVE sessions whose lecture has ended, withheld from this response. */
  expiredCount: number
  count: number
  sessions: DeviceActiveSession[]
}

export interface DeviceAuthResult {
  token: string
  /** Seconds, so the client can schedule a refresh without parsing the JWT. */
  expiresIn: number
  device: DeviceSelf
}

/**
 * The robot's four calls. There is no fifth, and in particular there is no way
 * to open a session: that is a human act, and the capability that once allowed
 * it was deleted rather than switched off.
 */
export const robotApi = {
  authenticate: (deviceKeyId: string, deviceSecret: string) =>
    deviceApi
      .post<DeviceAuthResult>('/devices/auth', { deviceKeyId, deviceSecret })
      .then((r) => r.data),

  me: () =>
    deviceApi.get<{ device: DeviceSelf }>('/devices/me').then((r) => r.data.device),

  activeSessions: () =>
    deviceApi
      .get<DeviceActiveSessions>('/devices/me/sessions/active')
      .then((r) => r.data),

  /** Expires in 30 seconds. The console refreshes at 25. */
  qr: (sessionId: string) =>
    deviceApi
      .get<QrToken>(`/devices/me/sessions/${sessionId}/qr`)
      .then((r) => r.data),
}
