import axios, { AxiosError } from 'axios'

const TOKEN_KEY = 'walle.token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const api = axios.create({
  // Dev goes through the Vite proxy; set VITE_API_URL for other environments.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = tokenStorage.get()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/** Emitted when the server rejects our token, so AuthContext can sign out. */
export const UNAUTHORIZED_EVENT = 'walle:unauthorized'

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      tokenStorage.clear()
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }

    return Promise.reject(error)
  }
)

/** Pulls a human-readable message out of whatever the server sent back. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; errors?: Array<{ message?: string }> }
      | undefined

    const fieldError = data?.errors?.[0]?.message

    if (fieldError) return fieldError
    if (data?.message) return data.message

    if (error.code === 'ERR_NETWORK') {
      return 'Cannot reach the server. Is the backend running?'
    }
  }

  if (error instanceof Error) return error.message

  return fallback
}
