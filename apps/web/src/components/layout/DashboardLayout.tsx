import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarContext } from './useSidebar'

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <SidebarContext.Provider value={{ open: () => setSidebarOpen(true) }}>
      <div className="min-h-screen bg-slate-50">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="lg:ml-64">
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  )
}
