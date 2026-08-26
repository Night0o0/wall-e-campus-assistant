import { describe, expect, it } from 'vitest'
import {
  homeRouteFor,
  navigationFor,
} from './navigation'
import type { AuthUser, UserRole } from '../types/api'

const account = (role: UserRole): AuthUser => ({
  id: 'user-1',
  universityId: 'USER-1',
  fullName: 'Test User',
  email: 'test@example.edu',
  role,
  accountStatus: 'ACTIVE',
  isVerified: true,
  isActive: true,
  organizationId: 'org-1',
})

describe('role navigation', () => {
  it.each([
    ['SYSTEM_OWNER', '/'],
    ['UNIVERSITY_ADMIN', '/'],
    ['DEPARTMENT_ADMIN', '/'],
    ['INSTRUCTOR', '/teaching'],
    ['STUDENT', '/'],
  ] as const)('sends %s to %s after login', (role, path) => {
    expect(homeRouteFor(role)).toBe(path)
  })

  it('gives teaching staff only teaching-console links', () => {
    const paths = navigationFor(account('INSTRUCTOR')).map((item) => item.href)

    expect(paths).toContain('/teaching')
    expect(paths).toContain('/account')
    expect(paths).not.toContain('/directory')
    expect(paths).not.toContain('/organizations')
  })

  it('gives students only their portal links', () => {
    const paths = navigationFor(account('STUDENT')).map((item) => item.href)
    expect(paths).toEqual(['/', '/assignments', '/account'])
  })
})
