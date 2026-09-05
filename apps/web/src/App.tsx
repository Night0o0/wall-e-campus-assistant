import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Login } from './pages/Login'
import { ForgotPassword, ResetPassword } from './pages/PasswordRecovery'
import { Account } from './pages/Account'
import { NotFound } from './pages/NotFound'

// Platform owner
import { Dashboard } from './pages/Dashboard'
import { Organizations } from './pages/Organizations'
import { OrganizationDetail } from './pages/OrganizationDetail'
import { Users } from './pages/Users'
import { Settings } from './pages/Settings'

// University
import { Overview, Exports } from './pages/campus/Overview'
import { TeachingSchedule } from './pages/campus/TeachingSchedule'
import { Sessions } from './pages/campus/Sessions'
import { SessionDetail } from './pages/campus/SessionDetail'
import { LiveQr } from './pages/campus/LiveQr'
import { Courses } from './pages/campus/Courses'
import { Materials } from './pages/campus/Materials'
import { PendingStudents } from './pages/campus/PendingStudents'
import { Notifications } from './pages/campus/Notifications'
import { Timetable } from './pages/campus/Timetable'
import { Directory } from './pages/campus/Directory'
import { Departments } from './pages/campus/Departments'
import { Assignments as StaffAssignments } from './pages/campus/Assignments'

const PEOPLE = ['SYSTEM_OWNER', 'UNIVERSITY_ADMIN', 'DEPARTMENT_ADMIN', 'INSTRUCTOR']
const SESSION_STAFF = ['INSTRUCTOR', 'UNIVERSITY_ADMIN']
const SUPER_ADMIN = ['UNIVERSITY_ADMIN']
const OWNER = ['SYSTEM_OWNER']
const DEPARTMENT_READERS = ['DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const COURSE_ROLES = ['INSTRUCTOR', 'DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const APPROVAL_ROLES = ['INSTRUCTOR', 'DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const TIMETABLE_ROLES = ['DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const NOTIFICATION_ROLES = ['INSTRUCTOR', 'DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const MATERIAL_ROLES = ['INSTRUCTOR', 'UNIVERSITY_ADMIN']

/**
 * What `/` resolves to.
 *
 * An instructor has no university-wide dashboard to show — their day starts at
 * their own timetable — so they are sent there rather than shown an emptier
 * version of somebody else's overview.
 */
function RoleHome() {
  const { user } = useAuth()

  if (user?.role === 'SYSTEM_OWNER') return <Dashboard />
  if (user?.role === 'UNIVERSITY_ADMIN') {
    return <Overview />
  }
  if (user?.role === 'DEPARTMENT_ADMIN') return <Navigate to="/departments" replace />

  return <Navigate to="/teaching" replace />
}

/**
 * Role-scoped route trees behind one human identity session.
 *
 * ── Why the trees are separate rather than one list with guards ────────────
 *
 * `/` means different things to different roles — the platform owner's estate
 * dashboard, the university's overview — and `/courses` means "every course in
 * the university" to an administrator and "the courses I teach" to an
 * instructor. Expressing that as one tree with a condition inside each element
 * would put the authorisation rule in the page instead of in the routing, where
 * a missing check looks exactly like a page that forgot to render something.
 *
 * Each tree names the roles it admits, and ProtectedRoute refuses the rest.
 * lib/navigation.ts drives the sidebar from the same role split, so a link and
 * a route cannot disagree.
 *
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Full-bleed, deliberately outside DashboardLayout: this goes on a
            projector in front of a room, where a sidebar of admin links is both
            noise and a small privacy leak. */}
        <Route element={<ProtectedRoute roles={SESSION_STAFF} />}>
          <Route path="/sessions/:id/qr" element={<LiveQr />} />
        </Route>

        <Route element={<ProtectedRoute roles={PEOPLE} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/account" element={<Account />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={PEOPLE} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/assignments" element={<StaffAssignments />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['INSTRUCTOR']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/teaching" element={<TeachingSchedule />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={APPROVAL_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/pending-students" element={<PendingStudents />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={SESSION_STAFF} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={COURSE_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/courses" element={<Courses />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={MATERIAL_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/materials" element={<Materials />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={NOTIFICATION_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/notifications" element={<Notifications />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={TIMETABLE_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/timetable" element={<Timetable />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={DEPARTMENT_READERS} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/departments" element={<Departments />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={SUPER_ADMIN} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/directory" element={<Directory />} />
            <Route path="/exports" element={<Exports />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={OWNER} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/organizations/:id" element={<OrganizationDetail />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={PEOPLE} />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<RoleHome />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
