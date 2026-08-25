/**
 * The university-facing half of the API.
 *
 * `types/api.ts` describes the platform-owner console — organizations, plans,
 * invoices. Everything here belongs to a single university and is scoped by the
 * caller's own token: no request in this file carries an organization id, and
 * none may ever be given one. See "THE TENANT RULE" in PAGES_AND_GAPS.txt.
 */

export type DayOfWeek =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]

export interface CourseSummary {
  id: string
  courseCode: string
  courseName: string
}

export interface Course extends CourseSummary {
  description?: string | null
  credits?: number | null
  semester?: string | null
  department?: string | null
  createdById?: string
  createdBy?: { id: string; fullName: string } | null
  _count?: { sessions?: number }

  /**
   * What the SERVER says this caller may do with this row.
   *
   * Sent by /courses and /courses/my. The client must not re-derive these:
   * the export rule is "created it OR instructs an active lecture of it", and
   * a client that guessed rendered a download button on every row and produced
   * a 403 toast on most of them (D-5).
   *
   * Optional only so a cached older response does not fail to parse. Treat an
   * absent value as "not permitted".
   */
  canExport?: boolean
  canManage?: boolean
}

/**
 * A lecture as BOTH /api/schedules and /api/admin/schedule return it.
 *
 * Note what is absent: flat `courseId` and `instructorId`. Neither endpoint
 * sends them — the ids live inside the nested `course` and `instructor`
 * objects. Declaring them here as required is what made the material publish
 * form post `courseId: undefined` and the timetable edit form blank its own
 * dropdowns, both of which typechecked perfectly against the invented shape.
 */
export interface LectureSchedule {
  id: string
  course: CourseSummary & { credits?: number }
  /** `jobTitle` is flat on this projection, not nested under a profile. */
  instructor: {
    id: string
    fullName: string
    email?: string
    jobTitle?: string | null
    office?: string | null
  }
  faculty: string
  department: string
  level: number
  /** The number the API filters on. `semesterLabel` is the display string. */
  semester: number
  semesterLabel?: string
  section?: string | null
  groupName?: string | null
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  room: string
  isActive: boolean
}

export type SessionStatus = 'ACTIVE' | 'CLOSED'

export interface CampusSession {
  id: string
  title: string
  status: SessionStatus
  startTime: string
  endTime?: string | null
  room?: string | null
  courseId?: string | null
  /**
   * The course this session belongs to, or null for a genuinely ad-hoc one.
   *
   * REQUIRED, not optional, and the distinction matters. While this was
   * optional the server simply never sent it on three of its four session
   * projections, TypeScript had nothing to complain about, and every session
   * on /sessions and /sessions/:id was labelled "Ad-hoc session - no course"
   * including ones opened straight from a lecture (D-1, D-3).
   *
   * Making it required-but-nullable means a projection that forgets it is a
   * compile error, and null now means "ad-hoc" rather than "nobody asked for
   * it".
   */
  course: CourseSummary | null
  createdBy?: { id: string; fullName: string } | null
  lectureSchedule?: {
    id: string
    room: string
    dayOfWeek: DayOfWeek
    startTime: string
    endTime: string
    course: CourseSummary
    instructor: { id: string; fullName: string }
  } | null
  /** Scans that are not ABSENT — i.e. people who actually turned up. */
  _count?: { attendances: number }
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT'

export interface AttendanceRow {
  id: string
  status: AttendanceStatus
  /**
   * The column is `scanTime`, not `scannedAt`. Named here as the server names
   * it — an alias in the client is a rename nobody can grep for.
   */
  scanTime?: string | null
  student: {
    id: string
    fullName: string
    universityId: string
    email?: string
  }
}

export interface SessionStats {
  /**
   * Who turned up. Deliberately EXCLUDES absent — this is what the figure has
   * always meant, and folding swept absences into it would silently change
   * every existing caller's idea of how many people attended.
   */
  total: number
  present: number
  late: number
  absent: number
  /** The cohort size: present + late + absent. */
  roll: number
}

/** A rotating attendance code. Expires in 30 seconds — refresh well before. */
export interface QrToken {
  token: string
  expiresIn: number
}

export interface CourseMaterial {
  id: string
  courseId: string
  course?: CourseSummary
  faculty: string
  department: string
  level: number
  semester: number
  section?: string | null
  title: string
  driveUrl: string
  isActive: boolean
  addedById: string
  addedBy?: { id: string; fullName: string } | null
  createdAt: string
}

/** The academic record the approver judges a registration against. */
export interface AcademicProfile {
  status?: string
  faculty?: string | null
  department?: string | null
  level?: number | null
  /** A label such as "Spring 2026" here, unlike the numeric one on a lecture. */
  semester?: string | null
  section?: string | null
  groupName?: string | null
  academicYear?: string | null
  phoneNumber?: string | null
}

export interface PendingStudent {
  id: string
  universityId: string
  fullName: string
  email: string
  /** `registeredAt`, not `createdAt` — reading the wrong one renders "Invalid Date". */
  registeredAt: string
  profile?: AcademicProfile | null
}

export type CampusRole = 'UNIVERSITY_SUPER_ADMIN' | 'ADMIN' | 'STUDENT'

export interface CampusUser {
  id: string
  universityId: string
  fullName: string
  email: string
  role: CampusRole
  isActive: boolean
  isVerified: boolean
  verifiedAt?: string | null
  verifiedById?: string | null
  createdAt: string
  /**
   * ONE key, named `profile` — not `adminProfile` / `studentProfile`. The
   * directory projection carries the student's academic record here and sends
   * null for staff. Reading the nested-per-role names left the cohort column
   * blank for every student and the "profile incomplete" badge unreachable.
   */
  profile?: AcademicProfile | null
}

/** Mirrors AdminService.getOverview exactly. Do not reshape it here. */
export interface OrganizationOverview {
  organization?: { id: string; name: string; code: string }
  people: {
    activeStudents: number
    inactiveStudents: number
    staff: number
    /**
     * Registered but never finished their academic profile. They receive no
     * timetable and no reminders, so this is the number worth acting on.
     */
    incompleteProfiles: number
  }
  academics: { courses: number; activeLectures: number }
  sessions: { today: number; active: number; closedThisWeek: number }
  attendance: {
    scansThisWeek: number
    /**
     * Null — not zero — when no session closed this week. Not a percentage
     * either: a rate needs a denominator, and with no enrollment model that
     * number would be a guess. This is a measurement.
     */
    averageAttendeesPerSession: number | null
  }
  window?: { timeZone: string; weekStartedAt: string }
}

export type DeviceStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

export interface RobotDevice {
  id: string
  name: string
  room?: string | null
  deviceKeyId: string
  status: DeviceStatus
  /** Always `["qr:display"]` today. There is no session-opening capability. */
  capabilities?: string[]
  lastSeenAt?: string | null
  lastIpAddress?: string | null
  revokedAt?: string | null
  revokedReason?: string | null
  createdAt: string
}

/**
 * The one response that ever carries a secret. Shown once, never re-readable.
 *
 * The credential is NESTED under `credentials`, and the field is
 * `deviceSecret`. Reading a flat `secret` off the top level rendered two empty
 * boxes in the pairing dialog — which made provisioning a robot impossible from
 * the console, and typechecked perfectly.
 */
export interface ProvisionedDevice {
  device: RobotDevice
  credentials: {
    deviceKeyId: string
    deviceSecret: string
    /** The server's own "store this now" wording. Shown rather than restated. */
    warning?: string
  }
}

export interface CampusNotification {
  id: string
  type: string
  title: string
  body: string
  scheduledFor: string
  sentAt?: string | null
  readAt?: string | null
  status: string
}

/** What a robot sees: only sessions it may display, already window-filtered. */
export interface DeviceSession {
  id: string
  title: string
  status: SessionStatus
  startTime: string
  courseId?: string | null
  course?: CourseSummary | null
  room?: string | null
}

export interface DeviceSelf {
  id: string
  name: string
  room?: string | null
  deviceKeyId: string
  status: DeviceStatus
  organizationId: string
  capabilities?: string[]
}
