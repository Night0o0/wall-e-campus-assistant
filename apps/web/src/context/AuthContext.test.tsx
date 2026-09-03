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
  id: 'staff-1',
  universityId: 'STAFF-1001',
  fullName: 'Staff One',
  email: 'staff@example.edu',
  role: 'INSTRUCTOR',
  accountStatus: 'ACTIVE',
  isVerified: true,
  isActive: true,
  organizationId: 'org-1',
}

function Harness() {
  const value = useAuth()
  return (
    <div>
      <span>{value.isLoading ? 'loading' : value.user?.email ?? 'anonymous'}</span>
      <button onClick={() => void value.login('staff@example.edu', 'password').catch(() => undefined)}>
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
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
  auth.signOut.mockResolvedValue({ error: null })
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

afterEach(cleanup)

describe('Supabase web session lifecycle', () => {
  it('restores and validates a staff session', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    tokenStorage.get.mockImplementation(() => 'access-token')
    renderProvider()

    await waitFor(() => expect(screen.getByText('staff@example.edu')).toBeTruthy())
    expect(tokenStorage.set).toHaveBeenCalledWith('access-token')
    expect(profile).toHaveBeenCalledTimes(1)
  })

  it('validates the backend profile during login', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'login' }))

    await waitFor(() => expect(screen.getByText('staff@example.edu')).toBeTruthy())
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@example.edu',
      password: 'password',
    })
  })

  it('logs out of Supabase and clears local application state', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    tokenStorage.get.mockReturnValue('access-token')
    renderProvider()
    await waitFor(() => expect(screen.getByText('staff@example.edu')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(tokenStorage.clear).toHaveBeenCalled()
    expect(screen.getByText('anonymous')).toBeTruthy()
  })

  it('signs out an identity that the backend refuses for web', async () => {
    profile.mockRejectedValueOnce(new Error('Student accounts are mobile-only'))
    renderProvider()
    await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1))
    expect(tokenStorage.clear).toHaveBeenCalled()
    expect(screen.getByText('anonymous')).toBeTruthy()
  })

  it('clears a restored Supabase session that the backend rejects', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    tokenStorage.get.mockReturnValue('access-token')
    profile.mockRejectedValueOnce(new Error('This account registration was rejected'))

    renderProvider()

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1))
    expect(tokenStorage.set).toHaveBeenCalledWith('access-token')
    expect(tokenStorage.clear).toHaveBeenCalled()
    expect(screen.getByText('anonymous')).toBeTruthy()
  })
})
