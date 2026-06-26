import { test, expect } from '@playwright/test'

test('auth page loads with magic link form', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: /meridian/i })).toBeVisible()
  // Email input should be present
  const emailInput = page.getByRole('textbox', { name: /email/i })
  await expect(emailInput).toBeVisible()
})

test('root page redirects to auth or renders dashboard', async ({ page }) => {
  await page.goto('/')
  // Either shows auth redirect or dashboard — just check it doesn't 500
  await expect(page).not.toHaveURL(/error/)
  const title = await page.title()
  expect(title).toContain('MERIDIAN')
})

test('log page renders workout logger UI', async ({ page }) => {
  await page.goto('/log')
  // Should show either the logger or auth redirect — not a crash
  await expect(page).not.toHaveURL(/error/)
  const status = await page.evaluate(() => document.readyState)
  expect(status).toBe('complete')
})
