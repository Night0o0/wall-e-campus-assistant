import { authApi } from '../api/endpoints'
import type { AuthUser } from '../types/api'
import { supabase, supabaseConfigured } from './supabase'

export interface ProfileUpdateResult {
  user: AuthUser
  emailConfirmationPending: boolean
}

export async function updateOwnAccount(input: {
  currentEmail: string
  fullName: string
  email: string
}): Promise<ProfileUpdateResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  if (!supabaseConfigured) {
    return {
      user: await authApi.updateProfile({
        fullName: input.fullName.trim(),
        email: normalizedEmail,
      }),
      emailConfirmationPending: false,
    }
  }

  // Application display data is written through the API. Sign-in email is
  // changed through Supabase so its confirmation policy is honored; the API
  // synchronizes the confirmed email from the next verified access token.
  const user = await authApi.updateProfile({ fullName: input.fullName.trim() })
  if (normalizedEmail === input.currentEmail.trim().toLowerCase()) {
    return { user, emailConfirmationPending: false }
  }

  const { error } = await supabase!.auth.updateUser({ email: normalizedEmail })
  if (error) throw error
  return { user, emailConfirmationPending: true }
}

export async function changeOwnPassword(input: {
  email: string
  currentPassword: string
  newPassword: string
}) {
  if (!supabaseConfigured) {
    return authApi.changePassword(input.currentPassword, input.newPassword)
  }

  // Reauthenticate immediately before the sensitive update. A restored session
  // alone proves possession of a token, not knowledge of the current password.
  const { error: signInError } = await supabase!.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.currentPassword,
  })
  if (signInError) throw signInError

  const { error } = await supabase!.auth.updateUser({
    password: input.newPassword,
  })
  if (error) throw error
}

export async function requestSupabasePasswordReset(email: string) {
  if (!supabaseConfigured) {
    throw new Error('Password recovery is not configured on this deployment.')
  }

  const { error } = await supabase!.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${window.location.origin}/reset-password` }
  )
  if (error) throw error
}

export async function finishSupabasePasswordReset(password: string) {
  if (!supabaseConfigured) {
    throw new Error('Password recovery is not configured on this deployment.')
  }

  const { data } = await supabase!.auth.getSession()
  if (!data.session) {
    throw new Error('This password-reset link is invalid or has expired.')
  }

  const { error } = await supabase!.auth.updateUser({ password })
  if (error) throw error
  await supabase!.auth.signOut()
}
