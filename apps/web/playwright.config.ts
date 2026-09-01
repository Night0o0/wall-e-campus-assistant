import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

const viteEnv = loadEnv('', process.cwd(), '')
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? viteEnv.VITE_SUPABASE_URL ?? ''
const supabasePublishableKey =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ??
  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  ''

process.env.E2E_SUPABASE_URL = supabaseUrl
process.env.E2E_SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey
process.env.E2E_AUTH_MODE =
  process.env.E2E_AUTH_MODE ?? (supabaseUrl && supabasePublishableKey ? 'supabase' : 'legacy')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
