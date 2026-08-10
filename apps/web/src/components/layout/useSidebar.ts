import { createContext, useContext } from 'react'

interface SidebarContextValue {
  open: () => void
}

export const SidebarContext = createContext<SidebarContextValue>({
  open: () => {},
})

/** Lets any page open the mobile sidebar from its own Header. */
export const useSidebar = () => useContext(SidebarContext)
