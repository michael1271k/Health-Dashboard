import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ── THE ALIGNMENT CLAIM, MEASURED IN A REAL BROWSER ──────────────────────────
 *
 * The set row's failures were layout failures: numbers that zig-zagged because
 * one cell packed four children, an effort column fixed at 44px that rendered
 * "VERY HARD" as "ver…", an input that clipped `8.75` because it was a `flex-1`
 * fighting four steppers for one line. None of that is visible to jsdom, which
 * has no layout engine at all.
 *
 * So the real markup — emitted by `src/tests/set-row-markup.test.tsx`, which is
 * where React's JSX transform lives — is injected into a page that has already
 * loaded the app's real stylesheet, and measured. Two claims:
 *
 *   · every cell N shares a left edge down the card. That IS a column.
 *   · nothing that carries a word is narrower than the word it carries.
 *
 * Run the unit suite first; the fixture is its output.
 */

const FIXTURE = resolve(__dirname, '__fixtures__/set-rows.html')

const VIEWPORTS = [
  { name: 'iphone-se', width: 360 },
  { name: 'iphone-14', width: 390 },
]

for (const vp of VIEWPORTS) {
  test(`set rows form real columns @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run \`npm test\` to emit it`).toBe(true)
    const html = readFileSync(FIXTURE, 'utf8')

    await page.setViewportSize({ width: vp.width, height: 844 })
    await page.goto('/auth', { waitUntil: 'domcontentloaded' })
    await page.evaluate((markup) => {
      const host = document.createElement('div')
      host.innerHTML = markup
      document.body.appendChild(host)
    }, html)

    const lefts = await page.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('#probe-deck [class*="grid-cols-["]'))
      return grids.map((g) => Array.from(g.children).map((c) => Math.round(c.getBoundingClientRect().left)))
    })
    // Header + four rows.
    expect(lefts.length, 'the fixture did not render as grids').toBeGreaterThanOrEqual(5)
    for (let col = 0; col < 4; col++) {
      const xs = lefts.map((r) => r[col])
      const drift = Math.max(...xs) - Math.min(...xs)
      expect(drift, `column ${col} drifts by ${drift}px across ${xs.length} rows`).toBeLessThanOrEqual(1)
    }

    // `scrollWidth` past `clientWidth` is exactly what an ellipsis hides.
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('#probe-deck *'))) {
        const e = el as HTMLElement
        if (!e.textContent?.trim() || e.children.length) continue
        if (e.scrollWidth > e.clientWidth + 1) out.push(`"${e.textContent.trim()}" ${e.clientWidth}px < ${e.scrollWidth}px`)
      }
      return out
    })
    expect(clipped, `clipped text: ${clipped.join(' · ')}`).toEqual([])

    // And the card never pushes the page sideways.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    await page.locator('#probe-deck').screenshot({ path: `e2e/__screenshots__/set-rows-${vp.name}.png` })
  })
}
