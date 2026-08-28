import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const post = vi.hoisted(() => vi.fn())
const setToken = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({
  api: { post },
  tokenStorage: { set: setToken },
}))

import { completeRegistrationForSession } from './registration'

const session = (registration?: Record<string, unknown>) => ({
  access_token: 'verified-access-token',
  user: {
    user_metadata: registration ? { registration } : {},
  },
}) as Session

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} })
  setToken.mockReset()
})

describe('registration completion', () => {
  it('uses identity metadata when confirmation continues on another device', async () => {
    const registration = {
      universityId: 'STU-1001',
      fullName: 'Cross Device Student',
      organizationCode: 'NCTU',
    }

    await completeRegistrationForSession(session(registration))

    expect(setToken).toHaveBeenCalledWith('verified-access-token')
    expect(post).toHaveBeenCalledWith(
      '/auth/register/supabase',
      registration,
      { headers: { Authorization: 'Bearer verified-access-token' } }
    )
  })

  it('sends an empty idempotent completion for an already-linked account', async () => {
    await completeRegistrationForSession(session())

    expect(post).toHaveBeenCalledWith(
      '/auth/register/supabase',
      {},
      expect.any(Object)
    )
  })
})
