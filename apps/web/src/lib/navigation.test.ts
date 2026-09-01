import { describe, expect, it } from 'vitest'
import {
  homeRouteFor,
  navigationFor,
  routeAfterLogin,
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
    ['DEPARTMENT_ADMIN', '/departments'],
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
    expect(paths).toEqual([
      '/',
      '/timetable',
      '/assignments',
      '/materials',
      '/attendance',
      '/notifications',
      '/account',
    ])
  })

  it('returns a user to a route their role can open', () => {
    expect(routeAfterLogin('INSTRUCTOR', '/sessions/session-1')).toBe('/sessions/session-1')
    expect(routeAfterLogin('SYSTEM_OWNER', '/organizations/org-1')).toBe('/organizations/org-1')
  })

  it('falls back to the role home when the requested route is forbidden', () => {
    expect(routeAfterLogin('UNIVERSITY_ADMIN', '/settings')).toBe('/')
    expect(routeAfterLogin('STUDENT', '/sessions/session-1')).toBe('/')
  })

  it('rejects external redirect targets', () => {
    expect(routeAfterLogin('SYSTEM_OWNER', '//example.com')).toBe('/')
    expect(routeAfterLogin('INSTRUCTOR', 'https://example.com')).toBe('/teaching')
  })
})
