import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/endpoints'
import { tokenStorage, UNAUTHORIZED_EVENT } from '../lib/api'
import type { AuthUser } from '../types/api'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => void
  setUser: (user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  // Restore the session on boot by validating the stored token.
  useEffect(() => {
    if (!tokenStorage.get()) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    authApi
      .profile()
      .then((profile) => {
        if (!cancelled) setUser(profile)
      })
      .catch(() => {
        if (!cancelled) tokenStorage.clear()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // The axios interceptor fires this when any request comes back 401.
  useEffect(() => {
    const handle = () => {
      setUser(null)
      queryClient.clear()
    }

    window.addEventListener(UNAUTHORIZED_EVENT, handle)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    tokenStorage.set(result.token)

    // The login payload omits the organization, so read the full profile.
    const profile = await authApi.profile().catch(() => result.user)

    setUser(profile)
    return profile
  }, [])

  const value = useMemo(
    () => ({ user, isLoading, login, logout, setUser }),
    [user, isLoading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }

  return context
}
