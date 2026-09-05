import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Login } from './Login'

const login = vi.hoisted(() => vi.fn())

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login,
  }),
}))

describe('multi-role login', () => {
  it('admits teaching staff and sends them to their teaching page', async () => {
    login.mockResolvedValueOnce({ role: 'INSTRUCTOR' })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/teaching" element={<div>Teaching page</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: 'teacher@example.edu' },
    })
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('Teaching page')).toBeTruthy()
    })

    expect(login).toHaveBeenCalledWith('teacher@example.edu', 'Password123')
  })
})
