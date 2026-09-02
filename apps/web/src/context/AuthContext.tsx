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
import { supabase, supabaseConfigured } from '../lib/supabase'

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
    if (supabaseConfigured) void supabase?.auth.signOut()
    tokenStorage.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  // Restore the session on boot by validating the stored token.
  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      if (supabaseConfigured) {
        const { data } = await supabase!.auth.getSession()
        if (data.session) {
          tokenStorage.set(data.session.access_token)
        }
      }

      if (!tokenStorage.get()) return null
      return authApi.profile()
    }

    restore()
      .then((profile) => {
        if (!cancelled && profile) setUser(profile)
      })
      .catch(() => {
        if (supabaseConfigured) void supabase?.auth.signOut()
        if (!cancelled) tokenStorage.clear()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) return

    const { data } = supabase!.auth.onAuthStateChange((_event, session) => {
      if (session) tokenStorage.set(session.access_token)
    })

    return () => data.subscription.unsubscribe()
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
    if (supabaseConfigured) {
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      if (!data.session) throw new Error('Sign in did not create a session')

      tokenStorage.set(data.session.access_token)
      try {
        const profile = await authApi.profile()
        setUser(profile)
        return profile
      } catch (error) {
        tokenStorage.clear()
        await supabase!.auth.signOut()
        throw error
      }
    }

    const result = await authApi.login(email, password)
    tokenStorage.set(result.token)

    try {
      // The profile request enforces that student accounts cannot use web.
      const profile = await authApi.profile()
      setUser(profile)
      return profile
    } catch (error) {
      tokenStorage.clear()
      throw error
    }
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
