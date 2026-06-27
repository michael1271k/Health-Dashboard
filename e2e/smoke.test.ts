import { test, expect } from '@playwright/test'

test('auth page loads with sign-in form', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: /apex/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
})

test('root page redirects to auth or renders dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveURL(/error/)
  const title = await page.title()
  expect(title).toContain('APEX')
})

test('log page renders without crashing', async ({ page }) => {
  await page.goto('/log')
  await expect(page).not.toHaveURL(/error/)
  const status = await page.evaluate(() => document.readyState)
  expect(status).toBe('complete')
})
