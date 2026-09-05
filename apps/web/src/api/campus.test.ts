import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  patch: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

import { campusAdminApi } from './campus'

describe('campus account API contract', () => {
  beforeEach(() => {
    apiMock.patch.mockReset()
  })

  it('sends the password field required by the admin reset endpoint', async () => {
    apiMock.patch.mockResolvedValue({ data: { message: 'Password updated' } })

    await campusAdminApi.resetUserPassword('user-1', 'NewPassword123')

    expect(apiMock.patch).toHaveBeenCalledWith('/admin/users/user-1/password', {
      newPassword: 'NewPassword123',
    })
  })
})
