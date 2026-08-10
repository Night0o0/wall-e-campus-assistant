import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Revenue } from './pages/Revenue'
import { Organizations } from './pages/Organizations'
import { OrganizationDetail } from './pages/OrganizationDetail'
import { Users } from './pages/Users'
import { Subscriptions } from './pages/Subscriptions'
import { Plans } from './pages/Plans'
import { Invoices } from './pages/Invoices'
import { Robots } from './pages/Robots'
import { Settings } from './pages/Settings'
import { billingEnabled } from './lib/features'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="organizations/:id" element={<OrganizationDetail />} />
            <Route path="users" element={<Users />} />

            {/* Billing routes disappear with the feature flag; the catch-all
                below sends any stale bookmark back to the dashboard. */}
            {billingEnabled && (
              <>
                <Route path="revenue" element={<Revenue />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="plans" element={<Plans />} />
                <Route path="invoices" element={<Invoices />} />
              </>
            )}

            <Route path="robots" element={<Robots />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
