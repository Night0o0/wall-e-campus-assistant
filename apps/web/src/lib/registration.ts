import type { Session } from '@supabase/supabase-js'
import { api, tokenStorage } from './api'

export const PENDING_REGISTRATION_KEY = 'leornian.pendingRegistration'

export interface PendingRegistration {
  universityId: string
  fullName: string
  organizationCode: string
}

export function registrationFromMetadata(value: unknown): PendingRegistration | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.universityId !== 'string' ||
    typeof candidate.fullName !== 'string' ||
    typeof candidate.organizationCode !== 'string'
  ) return null
  return {
    universityId: candidate.universityId,
    fullName: candidate.fullName,
    organizationCode: candidate.organizationCode,
  }
}

/**
 * Project a verified Supabase identity into the application database.
 *
 * Calling this for an existing account is deliberately harmless. That lets
 * login and session restoration repair an identity whose email confirmation
 * happened on another device, where this browser has no PKCE verifier or
 * localStorage. Registration metadata supplies convenience fields only; the
 * backend still derives identity/email from the signed access token and forces
 * STUDENT/PENDING.
 */
export async function completeRegistrationForSession(
  session: Session,
  preferred?: PendingRegistration | null
) {
  const metadata = registrationFromMetadata(
    session.user.user_metadata?.registration
  )
  const registration = preferred ?? metadata

  tokenStorage.set(session.access_token)
  return api.post(
    '/auth/register/supabase',
    registration ?? {},
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  )
}
