import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}))
const updateProfile = vi.hoisted(() => vi.fn())
const changePassword = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: { auth },
}))

vi.mock('../api/endpoints', () => ({
  authApi: { updateProfile, changePassword },
}))

import {
  changeOwnPassword,
  finishSupabasePasswordReset,
  requestSupabasePasswordReset,
  updateOwnAccount,
} from './accountAuth'

beforeEach(() => {
  for (const mock of Object.values(auth)) mock.mockReset()
  updateProfile.mockReset().mockResolvedValue({ id: 'user-1' })
  changePassword.mockReset()
  auth.signInWithPassword.mockResolvedValue({ error: null })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  auth.signOut.mockResolvedValue({ error: null })
})

describe('Supabase account lifecycle', () => {
  it('reauthenticates before changing a signed-in password', async () => {
    await changeOwnPassword({
      email: ' Student@Example.edu ',
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'student@example.edu',
      password: 'old-password',
    })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
  })

  it('does not change the password when reauthentication fails', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('bad current password') })

    await expect(changeOwnPassword({
      email: 'student@example.edu',
      currentPassword: 'wrong',
      newPassword: 'new-password',
    })).rejects.toThrow('bad current password')

    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('uses an origin-bound recovery callback and a normalized email', async () => {
    await requestSupabasePasswordReset(' Student@Example.edu ')

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'student@example.edu',
      { redirectTo: `${window.location.origin}/reset-password` }
    )
  })

  it('refuses an expired recovery session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(finishSupabasePasswordReset('new-password')).rejects.toThrow(
      /invalid or has expired/i
    )
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('changes the password and revokes the recovery browser session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'reset' } } })

    await finishSupabasePasswordReset('new-password')

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('changes email through Supabase and only display data through the API', async () => {
    const result = await updateOwnAccount({
      currentEmail: 'old@example.edu',
      fullName: ' Updated Name ',
      email: ' New@Example.edu ',
    })

    expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Updated Name' })
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.edu' })
    expect(result.emailConfirmationPending).toBe(true)
  })
})
