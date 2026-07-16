import { test, expect } from '@playwright/test'

test('auth page loads with sign-in form', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: /helix/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
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
  await expect(page.getByLabel(/email/i)).toBeVisible()
})

test('/api/version serves the deploy heartbeat with no-store', async ({ request }) => {
  const res = await request.get('/api/version')
  expect(res.ok()).toBe(true)
  expect(res.headers()['cache-control']).toContain('no-store')
  const { buildId } = await res.json()
  expect(typeof buildId).toBe('string')
  expect(buildId.length).toBeGreaterThan(0)
})

test('log page renders without crashing', async ({ page }) => {
  await page.goto('/log')
  // /log server-redirects to /workout (or /auth when signed out) — wait for the
  // destination to settle before asserting, otherwise readyState races the redirect.
  await page.waitForURL(/workout|auth/, { timeout: 30_000 })
  await page.waitForLoadState('load')
  await expect(page).not.toHaveURL(/error/)
})
