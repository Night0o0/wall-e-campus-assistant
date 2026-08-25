import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

const auth = vi.hoisted(() => ({
  user: null as null | {
    id: string
    email: string
    role: string
  },
  isLoading: false,
  logout: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

afterEach(() => {
  cleanup()
  auth.user = null
  auth.isLoading = false
  auth.logout.mockReset()
})

function renderGate(roles: string[]) {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route element={<ProtectedRoute roles={roles} />}>
          <Route path="/private" element={<div>Protected page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('role route guard', () => {
  it('renders a page for an admitted role', () => {
    auth.user = { id: 'admin-1', email: 'admin@example.edu', role: 'ADMIN' }

    renderGate(['ADMIN'])

    expect(screen.getByText('Protected page')).toBeTruthy()
  })

  it('explains a role mismatch instead of serving the page', () => {
    auth.user = {
      id: 'super-1',
      email: 'super@example.edu',
      role: 'UNIVERSITY_SUPER_ADMIN',
    }

    renderGate(['ADMIN'])

    expect(screen.getByText('You cannot open this page')).toBeTruthy()
  })

  it('sends students to the mobile-app notice', () => {
    auth.user = {
      id: 'student-1',
      email: 'student@example.edu',
      role: 'STUDENT',
    }

    renderGate(['ADMIN'])

    expect(screen.getByText('Use the mobile app')).toBeTruthy()
  })

  it('redirects an anonymous visitor to login', () => {
    renderGate(['ADMIN'])

    expect(screen.getByText('Login screen')).toBeTruthy()
  })
})
