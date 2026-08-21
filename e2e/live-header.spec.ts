import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ── THE LIVE HEADER, AT PHONE WIDTH ──────────────────────────────────────────
 *
 * The hero exists because the session's identity was rendered SMALLER than the
 * numbers beside it. The obvious way to get that wrong in the other direction
 * is a title that now wraps, or three metric tiles that squeeze their figures —
 * and jsdom, which has no layout engine, cannot see either.
 *
 * The longest day label in the program is "Legs & Core B"; the widest realistic
 * volume is five digits with a thousands separator. Both are in the fixture.
 *
 * Run the unit suite first; the fixture is `src/tests/live-header.test.tsx`'s
 * output.
 */

const FIXTURE = resolve(__dirname, '__fixtures__/live-header.html')

const VIEWPORTS = [
  { name: 'iphone-se', width: 360 },
  { name: 'iphone-14', width: 390 },
]

for (const vp of VIEWPORTS) {
  test(`live header holds one line @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run \`npm test\` to emit it`).toBe(true)
    const html = readFileSync(FIXTURE, 'utf8')

    await page.setViewportSize({ width: vp.width, height: 800 })
    await page.goto('/auth', { waitUntil: 'domcontentloaded' })
    await page.evaluate((markup) => {
      const host = document.createElement('div')
      // Pinned: the app's fixed chrome and Next's dev overlay both paint above
      // content in normal flow, and a screenshot of something underneath them
      // is a screenshot of them.
      host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0A0B0D'
      host.innerHTML = markup
      document.body.appendChild(host)
    }, html)

    // ── The title is one line, and it is the biggest text in the block ──
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('[data-probe-part="hero"] h1') as HTMLElement
      const cs = getComputedStyle(h1)
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)
      const figure = document.querySelector('#probe-header .helix-num') as HTMLElement
      return {
        fontSize: parseFloat(cs.fontSize),
        lines: Math.round(h1.getBoundingClientRect().height / lineHeight),
        figureSize: figure ? parseFloat(getComputedStyle(figure).fontSize) : 0,
      }
    })
    expect(title.lines, 'the title wraps').toBe(1)
    // The whole point: the workout's name is no longer smaller than the numbers
    // printed under it.
    expect(title.fontSize).toBeGreaterThan(title.figureSize)

    // ── No tile clips its figure ──
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('#probe-header *'))) {
        const e = el as HTMLElement
        if (!e.textContent?.trim()) continue
        const cs = getComputedStyle(e)
        if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' && cs.textOverflow !== 'ellipsis') continue
        const r = document.createRange()
        r.selectNodeContents(e)
        const textW = r.getBoundingClientRect().width
        r.detach()
        // `clientWidth` rounds up while the layout stays fractional — that gap
        // false-passed a visible clip three times on the set row. The content
        // box is reconstructed from the fractional rect instead.
        const cw = e.getBoundingClientRect().width
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
          - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
        if (textW > cw + 0.05) out.push(`"${e.textContent.trim().slice(0, 32)}" ${cw.toFixed(2)} < ${textW.toFixed(2)}`)
      }
      return out
    })
    expect(clipped, `clipped: ${clipped.join(' · ')}`).toEqual([])

    // ── The collapsed bar is two lines, and the title is one of them ──
    // It used to be one line carrying a title, a date and three stat columns at
    // 360px, so the title got what was left — an ellipsis mid-strapline. The
    // name now has a line to itself and the numbers have the line below it.
    const bar = await page.evaluate(() => {
      const root = document.querySelector('[data-probe-part="bar"] header') as HTMLElement
      const h1 = root.querySelector('h1') as HTMLElement
      const meta = root.querySelector('p') as HTMLElement
      const cs = getComputedStyle(h1)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)
      return {
        title: h1.textContent,
        titleLines: Math.round(h1.getBoundingClientRect().height / lh),
        // Two boxes, one above the other, is what "two lines" means here.
        stacked: meta.getBoundingClientRect().top >= h1.getBoundingClientRect().bottom - 1,
        buttons: root.querySelectorAll('button').length,
      }
    })
    // The NAME, never the strapline — see `cleanSessionTitle`.
    expect(bar.title).toBe('Legs & Core B')
    expect(bar.titleLines, 'the collapsed title wraps').toBe(1)
    expect(bar.stacked, 'the collapsed bar is not two lines').toBe(true)
    // Back and the muscle figure. Nothing else earns a permanent target here.
    expect(bar.buttons).toBe(2)

    // And it never pushes the page sideways.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    await page.locator('#probe-header').screenshot({ path: `e2e/__screenshots__/live-header-${vp.name}.png` })
  })
}
