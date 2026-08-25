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
  // "Helix", not "HELIX": the display name was lowercased across the app, the
  // manifest and both iOS targets on 2026-08-24.
  expect(title).toContain('Helix')
})

test('unauthenticated / never renders a blank dashboard — AuthGate redirects to /auth', async ({ page }) => {
  /**
   * ── THE BUDGET, NOT THE ASSERTION ──────────────────────────────────────────
   * This is the only spec that needs TWO routes compiled from cold: `/`, to get
   * the redirect, and then `/auth` to get its button. Playwright's default 30s
   * is the whole TEST's budget, and under the full parallel run five workers ask
   * the dev server for different first-compiles at once — so `page.goto('/')`
   * alone can eat it before `waitForURL` has anything to wait for. Isolated it
   * finishes in under three seconds.
   *
   * Raising the individual assertion timeouts did not help, because the timeout
   * being hit is this one. The bet was on compile speed, not on the app.
   *
   * The same bet is inside the two waits below, and `waitForURL`'s 30s lost it
   * once the dashboard's first compile grew — twelve widget bodies where there
   * used to be one shell. It is a DEV-SERVER compile cost and nothing the built
   * app pays, so the honest fix is to stop timing the compiler: 60s each, well
   * inside the 120s the test has.
   */
  test.setTimeout(120_000)
  // PWA storage isolation: an isolated storage container (no session) must land on
  // the sign-in screen, not an empty-but-"working" dashboard.
  await page.context().clearCookies()
  await page.goto('/')
  await page.waitForURL(/\/auth/, { timeout: 60_000 })
  // The dev server compiles /auth on first request, and under the full parallel
  // run several specs ask for it at once — so the redirect lands before the
  // button's chunk does. Playwright's default 5s assertion timeout is a bet on
  // compile speed, not on the app; this waits for the page to actually be there.
  await expect(page.getByRole('button', { name: /continue as/i })).toBeVisible({ timeout: 60_000 })
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
