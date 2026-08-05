import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Dashboard } from './pages/Dashboard'
import { Revenue } from './pages/Revenue'
import { Organizations } from './pages/Organizations'
import { Users } from './pages/Users'

// Placeholder pages for other routes
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-500">This page is under construction</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="users" element={<Users />} />
          <Route path="subscriptions" element={<PlaceholderPage title="Subscriptions" />} />
          <Route path="invoices" element={<PlaceholderPage title="Invoices" />} />
          <Route path="courses" element={<PlaceholderPage title="Courses" />} />
          <Route path="robots" element={<PlaceholderPage title="Robots" />} />
          <Route path="analytics" element={<PlaceholderPage title="Analytics" />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
