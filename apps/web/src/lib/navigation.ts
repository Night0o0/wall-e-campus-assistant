import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Library,
  MonitorPlay,
  Radio,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { billingEnabled } from './features'
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
  /** Hidden entirely when the billing feature flag is off. */
  billing?: boolean
}

/**
 * The platform console. Unchanged: this is the owner's estate view across every
 * university, and no campus role has ever been able to reach it.
 */
const SYSTEM_OWNER_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true, mobile: true },
  { name: 'Revenue', href: '/revenue', icon: TrendingUp, billing: true },
  { name: 'Organizations', href: '/organizations', icon: Building2, mobile: true },
  { name: 'Users', href: '/users', icon: Users, mobile: true },
  { name: 'Subscriptions', href: '/subscriptions', icon: CreditCard, billing: true },
  { name: 'Plans', href: '/plans', icon: Layers, billing: true },
  { name: 'Invoices', href: '/invoices', icon: FileText, billing: true },
  { name: 'Robots', href: '/robots', icon: Bot, mobile: true },
  { name: 'Settings', href: '/settings', icon: Settings },
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
 * everything running, who is waiting for approval, and is that robot in B-204
 * still alive. Timetable CRUD, course CRUD and exports are desk work and are
 * deliberately absent from the small-screen menu.
 */
const SUPER_ADMIN_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true, mobile: true },
  { name: 'Timetable', href: '/timetable', icon: CalendarDays },
  { name: 'Courses', href: '/courses', icon: Library },
  { name: 'Sessions', href: '/sessions', icon: MonitorPlay, mobile: true },
  { name: 'Students & Staff', href: '/directory', icon: GraduationCap, mobile: true },
  // A super admin may approve too — `canApprove` on the server admits them, and
  // routing every registration through one person would make them the
  // bottleneck for the whole university at the start of term.
  { name: 'Pending Students', href: '/pending-students', icon: UserCheck, mobile: true },
  { name: 'Course Material', href: '/materials', icon: FolderOpen },
  { name: 'Robot Devices', href: '/devices', icon: Radio, mobile: true },
  { name: 'Exports', href: '/exports', icon: FileText },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Account', href: '/account', icon: Settings },
]

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SYSTEM_OWNER: SYSTEM_OWNER_NAV,
  ADMIN: ADMIN_NAV,
  UNIVERSITY_SUPER_ADMIN: SUPER_ADMIN_NAV,
}

/** What this user's menu contains, with billing-only entries already dropped. */
export function navigationFor(user: AuthUser | null): NavItem[] {
  if (!user) return []

  return (NAV_BY_ROLE[user.role] ?? []).filter(
    (item) => billingEnabled || !item.billing
  )
}

/** The reduced small-screen menu. Never empty while the full menu is not. */
export function mobileNavigationFor(user: AuthUser | null): NavItem[] {
  const all = navigationFor(user)
  const mobile = all.filter((item) => item.mobile)

  // A role whose entries were all filtered out by a feature flag would
  // otherwise get an empty phone menu and no way to navigate at all.
  return mobile.length > 0 ? mobile : all
}

/** What this console calls itself, under the WALL-E wordmark. */
export function consoleNameFor(user: AuthUser | null): string {
  switch (user?.role) {
    case 'SYSTEM_OWNER':
      return 'Platform Console'
    case 'UNIVERSITY_SUPER_ADMIN':
      return 'University Admin'
    case 'ADMIN':
      return 'Teaching Console'
    default:
      return 'Campus Assistant'
  }
}

/**
 * Where a role lands after signing in.
 *
 * STUDENT is absent on purpose. There is no student web client — students use
 * the Flutter app — so a student who signs in here is shown an explanation
 * rather than being redirected somewhere that would 403 on every request.
 */
export function homeRouteFor(role: string): string {
  switch (role) {
    case 'ADMIN':
      return '/teaching'
    case 'UNIVERSITY_SUPER_ADMIN':
    case 'SYSTEM_OWNER':
      return '/'
    default:
      return '/'
  }
}
