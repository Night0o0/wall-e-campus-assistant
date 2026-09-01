import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ACCOUNTS, apiGet, attemptSignInThroughBrowser, signInAs } from './auth'

async function openMobileMenuIfNeeded(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name !== 'mobile') return
  await page.getByRole('button', { name: /open menu/i }).click()
}

async function openRoute(
  page: Page,
  testInfo: TestInfo,
  label: string,
  href: string
) {
  if (testInfo.project.name === 'mobile') {
    await page.goto(href)
    return
  }

  await page.getByRole('link', { name: label }).click()
}

test('system owner sees platform routes and not campus-only navigation', async ({
  context,
  page,
}, testInfo) => {
  await signInAs(context, page, ACCOUNTS.owner)

  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  await openMobileMenuIfNeeded(page, testInfo)
  await expect(page.getByRole('link', { name: 'Organizations' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByRole('link', { name: 'Platform' })).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /platform/i })).toBeVisible()
  } else {
    await expect(page.getByRole('link', { name: 'Platform' })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Courses' })).toHaveCount(0)
})

test('university admin can open academic administration pages', async ({
  context,
  page,
}, testInfo) => {
  await signInAs(context, page, ACCOUNTS.universityAdmin)

  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  for (const [label, href, heading] of [
    ['Departments', '/departments', /departments/i],
    ['Students & Staff', '/directory', /students & staff/i],
    ['Courses', '/courses', /courses/i],
    ['Timetable', '/timetable', /timetable/i],
    ['Sessions', '/sessions', /sessions/i],
    ['Assignments', '/assignments', /assignments/i],
    ['Notifications', '/notifications', /notifications/i],
  ] as const) {
    await openRoute(page, testInfo, label, href)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
})

test('department admin is isolated to department-safe navigation', async ({
  context,
  page,
}, testInfo) => {
  await signInAs(context, page, ACCOUNTS.departmentAdmin)

  await expect(page).toHaveURL(/\/departments$/)
  await openMobileMenuIfNeeded(page, testInfo)
  await expect(page.getByRole('link', { name: 'Departments' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Assignments' })).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByRole('link', { name: 'Courses' })).toHaveCount(0)
    await page.goto('/courses')
    await expect(page.getByRole('heading', { name: /courses/i })).toBeVisible()
  } else {
    await expect(page.getByRole('link', { name: 'Courses' })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Sessions' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Students & Staff' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Course Material' })).toHaveCount(0)
})

test('instructor can open teaching, sessions, qr, materials, assignments and notifications', async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInAs(context, page, ACCOUNTS.instructor)

  await expect(page).toHaveURL(/\/teaching$/)
  await expect(page.getByRole('heading', { name: /my teaching/i })).toBeVisible()

  await openRoute(page, testInfo, 'Sessions', '/sessions')
  await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible()

  const sessions = (await apiGet(request, ACCOUNTS.instructor, '/sessions?limit=1')) as {
    data?: Array<{ id: string }>
  }
  const sessionId = sessions.data?.[0]?.id
  if (sessionId) {
    await page.goto(`/sessions/${sessionId}`)
    await expect(page.getByRole('heading', { name: /session/i })).toBeVisible()
    await page.goto(`/sessions/${sessionId}/qr`)
    await expect(
      page.getByText(/expires in|this session is closed/i)
    ).toBeVisible()
  }

  await page.goto('/materials')
  await expect(page.getByRole('heading', { name: /course material/i })).toBeVisible()
  await page.goto('/assignments')
  await expect(page.getByRole('heading', { name: /assignments/i })).toBeVisible()
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible()
})

test('student can open timetable, assignments, materials, attendance, notifications and account', async ({
  context,
  page,
}) => {
  await signInAs(context, page, ACCOUNTS.student)

  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible()

  for (const destination of [
    ['/timetable', /timetable/i],
    ['/assignments', /assignments/i],
    ['/materials', /course material/i],
    ['/attendance', /attendance/i],
    ['/notifications', /notifications/i],
    ['/account', /account/i],
  ] as const) {
    await page.goto(destination[0])
    await expect(page.getByRole('heading', { name: destination[1] })).toBeVisible()
  }
})

test('pending student is blocked from academic routes but can reach account completion', async ({
  context,
  page,
}) => {
  await signInAs(context, page, ACCOUNTS.pendingStudent)

  await expect(page.getByText(/waiting for university approval/i)).toBeVisible()

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: /account/i })).toBeVisible()
  await expect(page.getByText(/academic profile/i)).toBeVisible()
})

test('disabled-account handling clears access and returns to sign-in', async ({
  page,
}) => {
  await attemptSignInThroughBrowser(page, ACCOUNTS.disabledStudent)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(/deactivated/i)
})

test('cross-role route protection shows access denied rather than leaking a page', async ({
  context,
  page,
}) => {
  await signInAs(context, page, ACCOUNTS.instructor)
  await page.goto('/organizations')
  await expect(page.getByText(/you cannot open this page/i)).toBeVisible()
})
