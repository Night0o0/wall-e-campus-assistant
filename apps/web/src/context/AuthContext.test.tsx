import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}))
const profile = vi.hoisted(() => vi.fn())
const complete = vi.hoisted(() => vi.fn())
const tokenStorage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: { auth },
}))

vi.mock('../api/endpoints', () => ({
  authApi: { profile, login: vi.fn() },
}))

vi.mock('../lib/registration', () => ({
  completeRegistrationForSession: complete,
}))

vi.mock('../lib/api', () => ({
  tokenStorage,
  UNAUTHORIZED_EVENT: 'leornian:unauthorized',
}))

import { AuthProvider, useAuth } from './AuthContext'

const session = {
  access_token: 'access-token',
  user: { user_metadata: {} },
}
const user = {
  id: 'student-1',
  universityId: 'STU-1001',
  fullName: 'Student One',
  email: 'student@example.edu',
  role: 'STUDENT',
  accountStatus: 'PENDING',
  isVerified: false,
  isActive: true,
  organizationId: 'org-1',
}

function Harness() {
  const value = useAuth()
  return (
    <div>
      <span>{value.isLoading ? 'loading' : value.user?.email ?? 'anonymous'}</span>
      <button onClick={() => void value.login('student@example.edu', 'password')}>
        login
      </button>
      <button onClick={value.logout}>logout</button>
    </div>
  )
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><Harness /></AuthProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  for (const mock of Object.values(auth)) mock.mockReset()
  for (const mock of Object.values(tokenStorage)) mock.mockReset()
  profile.mockReset().mockResolvedValue(user)
  complete.mockReset().mockResolvedValue({})
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
  auth.signOut.mockResolvedValue({ error: null })
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

afterEach(cleanup)

describe('Supabase web session lifecycle', () => {
  it('restores a session and idempotently repairs registration before profile', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    tokenStorage.get.mockReturnValue('access-token')
    renderProvider()

    await waitFor(() => expect(screen.getByText('student@example.edu')).toBeTruthy())
    expect(complete).toHaveBeenCalledWith(session)
    expect(profile).toHaveBeenCalledTimes(1)
  })

  it('completes cross-device registration during login before loading profile', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'login' }))

    await waitFor(() => expect(screen.getByText('student@example.edu')).toBeTruthy())
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'student@example.edu',
      password: 'password',
    })
    expect(complete).toHaveBeenCalledWith(session)
  })

  it('logs out of Supabase and clears local application state', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    tokenStorage.get.mockReturnValue('access-token')
    renderProvider()
    await waitFor(() => expect(screen.getByText('student@example.edu')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(tokenStorage.clear).toHaveBeenCalled()
    expect(screen.getByText('anonymous')).toBeTruthy()
  })
})
