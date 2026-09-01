import {
  Bell,
  Building2,
  CalendarDays,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  MonitorPlay,
  Settings,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { AuthUser } from '../types/api'

/**
 * Who sees which pages, on which screen.
 *
 * ── Why one file rather than a `role &&` in each component ─────────────────
 *
 * Navigation and routing have to agree. A link the sidebar hides but the router
 * still serves is reachable by typing the URL; a route the router drops but the
 * sidebar still lists is a dead link. Both bugs are invisible in review when
 * the two live apart, so they live together: `routesFor` and the sidebar read
 * the same list, and adding a page means adding one entry.
 *
 * ── `mobile`, and why it is not just responsive CSS ────────────────────────
 *
 * Every page here works at every width — the layouts are responsive. `mobile`
 * answers a different question: which pages belong in the navigation of a
 * phone. A super admin has nine pages, and a phone menu of nine is a phone menu
 * nobody reads; the four marked here are the ones somebody actually opens while
 * walking across campus. The rest stay reachable by URL and by any in-page
 * link, they are simply not in the small-screen menu.
 *
 * This is a deliberate editorial decision per role, not a technical limit, and
 * it is why the flag is a property of the page rather than a breakpoint.
 */

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  /** Exact-match highlighting, for index routes. */
  end?: boolean
  /** Appears in the reduced navigation shown on small screens. */
  mobile?: boolean
}

/**
 * The platform console. Unchanged: this is the owner's estate view across every
 * university, and no campus role has ever been able to reach it.
 */
const SYSTEM_OWNER_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true, mobile: true },
  { name: 'Organizations', href: '/organizations', icon: Building2, mobile: true },
  { name: 'Users', href: '/users', icon: Users, mobile: true },
  { name: 'Account', href: '/account', icon: Settings, mobile: true },
  { name: 'Platform', href: '/settings', icon: FolderOpen },
]

/**
 * Teaching staff — professors, doctors, lecturers and engineers alike. There is
 * no separate professor role; the academic title lives on AdminProfile.jobTitle.
 *
 * The mobile four are the lecture-hall ones: open attendance, put the code up,
 * see who scanned, clear the approval queue. Course admin and material
 * publishing are desk work.
 */
const ADMIN_NAV: NavItem[] = [
  { name: 'My Teaching', href: '/teaching', icon: CalendarDays, end: true, mobile: true },
  { name: 'Sessions', href: '/sessions', icon: MonitorPlay, mobile: true },
  { name: 'Pending Students', href: '/pending-students', icon: UserCheck, mobile: true },
  { name: 'My Courses', href: '/courses', icon: Library },
  { name: 'Course Material', href: '/materials', icon: FolderOpen },
  { name: 'Assignments', href: '/assignments', icon: FileText },
  // Instructors receive the 24-hour and 30-minute lecture reminders, so they
  // need somewhere to read them. The generator was writing rows the web client
  // had no page for.
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Account', href: '/account', icon: Settings, mobile: true },
]

/**
 * The university administrator. Nine pages on a desktop, four on a phone.
 *
 * The phone set is what an administrator opens away from their desk: is
 * everything running and who is waiting for approval. Timetable CRUD, course
 * CRUD and exports are desk work and are
 * deliberately absent from the small-screen menu.
 */
const SUPER_ADMIN_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true, mobile: true },
  { name: 'Departments', href: '/departments', icon: Building2 },
  { name: 'Timetable', href: '/timetable', icon: CalendarDays },
  { name: 'Courses', href: '/courses', icon: Library },
  { name: 'Sessions', href: '/sessions', icon: MonitorPlay, mobile: true },
  { name: 'Students & Staff', href: '/directory', icon: GraduationCap, mobile: true },
  // A super admin may approve too — `canApprove` on the server admits them, and
  // routing every registration through one person would make them the
  // bottleneck for the whole university at the start of term.
  { name: 'Pending Students', href: '/pending-students', icon: UserCheck, mobile: true },
  { name: 'Course Material', href: '/materials', icon: FolderOpen },
  { name: 'Assignments', href: '/assignments', icon: FileText },
  { name: 'Exports', href: '/exports', icon: FileText },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Account', href: '/account', icon: Settings },
]

const STUDENT_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true, mobile: true },
  { name: 'Timetable', href: '/timetable', icon: CalendarDays, mobile: true },
  { name: 'Assignments', href: '/assignments', icon: FileText, mobile: true },
  { name: 'Materials', href: '/materials', icon: FolderOpen },
  { name: 'Attendance', href: '/attendance', icon: MonitorPlay, mobile: true },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Account', href: '/account', icon: Settings, mobile: true },
]

const DEPARTMENT_ADMIN_NAV: NavItem[] = [
  { name: 'Departments', href: '/departments', icon: Building2, end: true, mobile: true },
  { name: 'Timetable', href: '/timetable', icon: CalendarDays },
  { name: 'Courses', href: '/courses', icon: Library },
  { name: 'Pending Students', href: '/pending-students', icon: UserCheck, mobile: true },
  { name: 'Assignments', href: '/assignments', icon: FileText, mobile: true },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Account', href: '/account', icon: Settings, mobile: true },
]

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SYSTEM_OWNER: SYSTEM_OWNER_NAV,
  INSTRUCTOR: ADMIN_NAV,
  UNIVERSITY_ADMIN: SUPER_ADMIN_NAV,
  DEPARTMENT_ADMIN: DEPARTMENT_ADMIN_NAV,
  STUDENT: STUDENT_NAV,
}

/** What this user's menu contains. */
export function navigationFor(user: AuthUser | null): NavItem[] {
  if (!user) return []
  return NAV_BY_ROLE[user.role] ?? []
}

/** The reduced small-screen menu. Never empty while the full menu is not. */
export function mobileNavigationFor(user: AuthUser | null): NavItem[] {
  const all = navigationFor(user)
  const mobile = all.filter((item) => item.mobile)

  // A role whose entries were all filtered out by a feature flag would
  // otherwise get an empty phone menu and no way to navigate at all.
  return mobile.length > 0 ? mobile : all
}

/** What this console calls itself, under the Leornian wordmark. */
export function consoleNameFor(user: AuthUser | null): string {
  switch (user?.role) {
    case 'SYSTEM_OWNER':
      return 'Platform Console'
    case 'UNIVERSITY_ADMIN':
      return 'University Admin'
    case 'DEPARTMENT_ADMIN':
      return 'Department Admin'
    case 'INSTRUCTOR':
      return 'Teaching Console'
    case 'STUDENT':
      return 'Student Portal'
    default:
      return 'Campus Assistant'
  }
}

/**
 * Where a role lands after signing in.
 *
 * Every human role has an explicit landing route.
 */
export function homeRouteFor(role: string): string {
  switch (role) {
    case 'INSTRUCTOR':
      return '/teaching'
    case 'UNIVERSITY_ADMIN':
    case 'SYSTEM_OWNER':
      return '/'
    case 'DEPARTMENT_ADMIN':
      return '/departments'
    default:
      return '/'
  }
}

/**
 * Choose a safe, role-accessible destination after authentication.
 *
 * React Router records the protected page an anonymous visitor originally
 * requested. That is useful when the same person signs in, but it must not
 * override the newly authenticated role: a university administrator signing
 * in after an owner signed out from `/settings`, for example, cannot open the
 * platform settings page. Navigation entries are the shared source of truth
 * for role access, and child pages inherit access from their listed parent.
 */
export function routeAfterLogin(role: string, requestedFrom?: string): string {
  const fallback = homeRouteFor(role)

  // Only same-origin application paths are valid redirect targets.
  if (!requestedFrom?.startsWith('/') || requestedFrom.startsWith('//')) {
    return fallback
  }

  const allowed = NAV_BY_ROLE[role] ?? []
  const canOpen = allowed.some(({ href }) => (
    href === '/'
      ? requestedFrom === '/'
      : requestedFrom === href || requestedFrom.startsWith(`${href}/`)
  ))

  return canOpen ? requestedFrom : fallback
}
