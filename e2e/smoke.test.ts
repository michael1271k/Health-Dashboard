import { test, expect } from '@playwright/test'

// `/auth` has ONE button and no input at all — auth/page.tsx states it outright:
// "Single-user app: ONE button. There is no email/password form". These tests
// asserted `getByLabel(/email/i)` against a form that has not existed for a long
// time, which means the suite was describing an app nobody has shipped.
test('auth page loads with the single sign-in button', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: /helix/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /continue as/i })).toBeVisible()
})

test('root page redirects to auth or renders dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveURL(/error/)
  const title = await page.title()
  expect(title).toContain('HELIX')
})

test('unauthenticated / never renders a blank dashboard — AuthGate redirects to /auth', async ({ page }) => {
  // PWA storage isolation: an isolated storage container (no session) must land on
  // the sign-in screen, not an empty-but-"working" dashboard.
  await page.context().clearCookies()
  await page.goto('/')
  await page.waitForURL(/\/auth/, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /continue as/i })).toBeVisible()
})

test('/api/version serves the deploy heartbeat with no-store', async ({ request }) => {
  const res = await request.get('/api/version')
  expect(res.ok()).toBe(true)
  expect(res.headers()['cache-control']).toContain('no-store')
  const { buildId } = await res.json()
  expect(typeof buildId).toBe('string')
  expect(buildId.length).toBeGreaterThan(0)
})

// Was `/log`, with a comment claiming it "server-redirects to /workout". There
// is no /log directory under src/app and no redirect in next.config.ts, so this
// navigated to a 404 and then spent 30s waiting for a URL that never came.
// The route it meant to smoke-test is /workout.
test('workout page renders without crashing', async ({ page }) => {
  await page.goto('/workout')
  await page.waitForURL(/workout|auth/, { timeout: 30_000 })
  await page.waitForLoadState('load')
  await expect(page).not.toHaveURL(/error/)
})
