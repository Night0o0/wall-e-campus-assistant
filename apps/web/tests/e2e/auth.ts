import { createClient } from '@supabase/supabase-js'
import { expect, type BrowserContext, type Page, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:5000/api'
const AUTH_MODE =
  process.env.E2E_AUTH_MODE ??
  (process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_PUBLISHABLE_KEY
    ? 'supabase'
    : 'legacy')

export const ACCOUNTS = {
  owner: 'owner@leornian.dev',
  universityAdmin: 'admin.nctu@leornian.dev',
  departmentAdmin: 'dept.mechatronics@leornian.dev',
  instructor: 'instructor.a@leornian.dev',
  student: 'student.approved@leornian.dev',
  pendingStudent: 'student.pending@leornian.dev',
  disabledStudent: 'student.disabled@leornian.dev',
} as const

interface BrowserAuthState {
  token: string
}

function demoPassword() {
  const password = process.env.E2E_DEMO_PASSWORD
  if (!password) {
    throw new Error(
      'Set E2E_DEMO_PASSWORD before running credentialed browser tests.'
    )
  }
  return password
}

async function authStateFor(email: string): Promise<BrowserAuthState> {
  if (AUTH_MODE === 'supabase') {
    const url = process.env.E2E_SUPABASE_URL
    const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY

    if (!url || !key) {
      throw new Error('Supabase E2E auth mode requires E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY.')
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: demoPassword(),
    })

    if (error) throw error
    if (!data.session) throw new Error(`No session returned for ${email}`)
    return { token: data.session.access_token }
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: demoPassword() }),
  })

  const body = (await response.json()) as { token?: string; message?: string }
  if (!response.ok || !body.token) {
    throw new Error(body.message ?? `Legacy sign-in failed for ${email}`)
  }

  return { token: body.token }
}

export async function signInAs(context: BrowserContext, page: Page, email: string) {
  const state = await authStateFor(email)

  await context.addInitScript((value: BrowserAuthState) => {
    window.localStorage.setItem('walle.token', value.token)
  }, state)

  await page.goto('/')
}

export async function attemptSignInThroughBrowser(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(demoPassword())
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export async function apiGet(
  request: APIRequestContext,
  email: string,
  path: string
) {
  const { token } = await authStateFor(email)
  const response = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}
