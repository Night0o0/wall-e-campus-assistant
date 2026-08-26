import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Login } from './pages/Login'
import { CompleteRegistration, Register } from './pages/Register'
import { Account } from './pages/Account'
import { StudentDashboard } from './pages/student/StudentDashboard'
import { StudentAssignments } from './pages/student/Assignments'

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

const STAFF = ['INSTRUCTOR', 'DEPARTMENT_ADMIN', 'UNIVERSITY_ADMIN']
const SUPER_ADMIN = ['UNIVERSITY_ADMIN']
const OWNER = ['SYSTEM_OWNER']

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
  if (user?.role === 'STUDENT') return <StudentDashboard />
  if (user?.role === 'UNIVERSITY_ADMIN' || user?.role === 'DEPARTMENT_ADMIN') {
    return <Overview />
  }

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
        <Route path="/register" element={<Register />} />
        <Route path="/register/complete" element={<CompleteRegistration />} />

        {/* Full-bleed, deliberately outside DashboardLayout: this goes on a
            projector in front of a room, where a sidebar of admin links is both
            noise and a small privacy leak. */}
        <Route element={<ProtectedRoute roles={STAFF} />}>
          <Route path="/sessions/:id/qr" element={<LiveQr />} />
        </Route>

        <Route element={<ProtectedRoute roles={['STUDENT']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/assignments" element={<StudentAssignments />} />
            <Route path="/account" element={<Account />} />
          </Route>
        </Route>

        {/* ------------------------- Teaching staff ------------------------- */}
        {/* Only an instructor has a teaching timetable of their own. */}
        <Route element={<ProtectedRoute roles={['INSTRUCTOR']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/teaching" element={<TeachingSchedule />} />
          </Route>
        </Route>

        {/* Shared by both staff roles: the server decides scope, not the page.
            The approval queue belongs here and not under INSTRUCTOR — `canApprove`
            on the server admits UNIVERSITY_ADMIN too, and vetting a
            first-year is routine departmental work that must not bottleneck on
            one person at the start of term. */}
        <Route element={<ProtectedRoute roles={STAFF} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/pending-students" element={<PendingStudents />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/account" element={<Account />} />
          </Route>
        </Route>

        {/* --------------------- University administrator -------------------- */}
        <Route element={<ProtectedRoute roles={SUPER_ADMIN} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/exports" element={<Exports />} />
          </Route>
        </Route>

        {/* ------------------------- Platform owner -------------------------- */}
        <Route element={<ProtectedRoute roles={OWNER} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/organizations/:id" element={<OrganizationDetail />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        {/* `/` means a different dashboard to each role, so it is one route
            that dispatches rather than several competing for the same path —
            React Router resolves the first match, so duplicates would silently
            hand every role whichever one happened to be declared first. */}
        <Route element={<ProtectedRoute roles={[...OWNER, ...STAFF, 'STUDENT']} />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<RoleHome />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
