import { expect, test, type Page, type Route } from '@playwright/test'

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockJson(
  page: Page,
  matcher: string | RegExp,
  handler: (route: Route) => Promise<void> | void
) {
  await page.route(matcher, async (route) => {
    await handler(route)
  })
}

test('student web sessions are rejected and cleared before a staff route opens', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('walle.token', 'student-supabase-access-token')
  })
  await mockJson(page, /\/(?:api\/)?auth\/profile(?:\?.*)?$/, (route) =>
    json(route, 403, {
      message: 'Student accounts are available in the mobile app only',
      code: 'MOBILE_ONLY_ACCOUNT',
    })
  )

  await page.goto('/account')

  await expect(page).toHaveURL(/\/login$/)
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('walle.token')))
    .toBeNull()
})

test('a rejected stored session is cleared before the user reaches the console', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('walle.token', 'rejected-supabase-access-token')
  })
  await mockJson(page, /\/(?:api\/)?auth\/profile(?:\?.*)?$/, (route) =>
    json(route, 401, {
      message: 'This account registration was rejected',
      code: 'ACCOUNT_REJECTED',
    })
  )

  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('walle.token')))
    .toBeNull()
})

test('removed public web routes stay unavailable when requested directly', async ({
  page,
}) => {
  for (const path of ['/register', '/attendance']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible()
    await expect(page.getByText(/does not exist in this web application/i)).toBeVisible()
  }
})
