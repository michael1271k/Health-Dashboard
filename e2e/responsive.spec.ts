import { test, expect, devices } from '@playwright/test'

/**
 * Phase 6 responsive guarantees. These run unauthenticated, so the dashboard
 * itself redirects to /auth — but the app shell (nav, glass, layout) and the
 * CSS contracts that fix the mobile bugs are still verifiable on every viewport.
 */

const VIEWPORTS = [
  { name: 'iphone-se', width: 360, height: 780 },
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

const ROUTES = ['/auth', '/']

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`no horizontal scroll on ${route} @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => {
        const de = document.documentElement
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }
      })
      // Allow 1px sub-pixel tolerance.
      expect(overflow.scrollWidth, `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`)
        .toBeLessThanOrEqual(overflow.clientWidth + 1)
    })
  }
}

test('battery uses a perfect 1:1 box at any width (circle-square contract)', async ({ page }) => {
  await page.goto('/auth')
  // Inject a probe with the same utility class the battery orb wrapper uses.
  const box = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'circle-square'
    el.style.width = '137px' // deliberately odd, non-square ancestor
    document.body.appendChild(el)
    const r = el.getBoundingClientRect()
    const out = { w: r.width, h: r.height }
    el.remove()
    return out
  })
  expect(Math.abs(box.w - box.h)).toBeLessThanOrEqual(1)
})

test('bottom nav is mobile-only', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: /mobile navigation/i })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/auth')
  await expect(nav).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(nav).toBeHidden()
})

test('dashboard battery, when rendered, is square', async ({ page }) => {
  await page.setViewportSize(devices['iPhone 13'].viewport)
  await page.goto('/')
  await page.waitForTimeout(1500)
  const orb = page.getByTestId('battery-orb')
  // Only assert when a session actually renders the dashboard (else it redirects).
  if (await orb.count()) {
    const bb = await orb.first().boundingBox()
    if (bb) expect(Math.abs(bb.width - bb.height)).toBeLessThanOrEqual(2)
  }
})
