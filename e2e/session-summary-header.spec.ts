import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ── THE SUMMARY HEADER, AT PHONE WIDTH ───────────────────────────────────────
 *
 * The complaint that started this was a truncation — `"1 warm-up · 1 to fail…"`
 * under the Sets figure — and truncation is exactly the class of defect jsdom
 * cannot see. It has no layout engine: every one of the unit assertions in
 * `session-summary-header.test.tsx` passes on markup that visibly clips.
 *
 * So the fixture that file emits is measured here, in a real browser, at the two
 * widths that matter. The binding case is the widest realistic header: the
 * longest day label in the program, a five-digit volume with a separator, and
 * all three set tags at once.
 *
 * Run the unit suite first — the fixture is its output.
 */

const FIXTURE = resolve(__dirname, '__fixtures__/session-summary-header.html')

const VIEWPORTS = [
  { name: 'iphone-se', width: 360 },
  { name: 'iphone-14', width: 390 },
]

for (const vp of VIEWPORTS) {
  test(`summary header holds its numbers @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run \`npm test\` to emit it`).toBe(true)
    const html = readFileSync(FIXTURE, 'utf8')

    await page.setViewportSize({ width: vp.width, height: 900 })
    await page.goto('/auth', { waitUntil: 'domcontentloaded' })
    await page.evaluate((markup) => {
      const host = document.createElement('div')
      // Pinned above everything: the app's own chrome and Next's dev overlay
      // both paint over content in normal flow, and a screenshot of something
      // underneath them is a screenshot of them.
      host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0A0B0D'
      host.innerHTML = markup
      document.body.appendChild(host)
    }, html)

    // ── NOTHING IN THE HEADER CLIPS ──
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('#probe-summary *'))) {
        const e = el as HTMLElement
        if (!e.textContent?.trim()) continue
        const cs = getComputedStyle(e)
        if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' && cs.textOverflow !== 'ellipsis') continue
        const r = document.createRange()
        r.selectNodeContents(e)
        const textW = r.getBoundingClientRect().width
        r.detach()
        // `clientWidth` rounds up while layout stays fractional, and that gap
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

    // ── THE THREE HEADLINE TILES SHARE A BASELINE AND NONE WRAPS ──
    // The tile grid has no `gap` guard of its own; a cell whose figure grew a
    // second line used to push the row's `leading-none` alignment apart.
    const tiles = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#probe-summary .grid-cols-3 > div')) as HTMLElement[]
      return cells.map((c) => {
        const fig = c.querySelector('.helix-num') as HTMLElement | null
        const cs = fig ? getComputedStyle(fig) : null
        const lh = cs ? parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) : 1
        return {
          label: c.querySelector('span')?.textContent?.trim() ?? '',
          lines: fig ? Math.round(fig.getBoundingClientRect().height / lh) : 0,
          top: fig?.getBoundingClientRect().top ?? 0,
        }
      })
    })
    expect(tiles.length, 'the headline grid is not three cells').toBe(3)
    for (const t of tiles) expect(t.lines, `"${t.label}" wraps`).toBe(1)
    // Within a pixel of each other — the same line, not merely similar heights.
    const tops = tiles.map((t) => t.top)
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1)

    // ── THE SET CHIPS ARE ALL PRESENT, AND ON ONE LINE ──
    // This is the actual complaint: the prose form lost everything after the
    // first tag. Three chips must fit in the slot the sentence did not.
    const chips = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('#probe-summary [title]')) as HTMLElement[]
      const found = spans.filter((s) => /^\d+[WFD]$/.test(s.textContent?.trim() ?? ''))
      const tops = found.map((s) => Math.round(s.getBoundingClientRect().top))
      return { labels: found.map((s) => s.textContent?.trim()), rows: new Set(tops).size }
    })
    expect(chips.labels).toEqual(['2W', '1F', '1D'])
    expect(chips.rows, 'the set chips wrapped onto two lines').toBe(1)

    // ── THE TITLE IS ONE LINE, AND THE TAGS ARE UNDER IT ──
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('[data-probe-part="title"] h1') as HTMLElement
      const cs = getComputedStyle(h1)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)
      const back = document.querySelector('[data-probe-part="title"] button') as HTMLElement | null
      return {
        text: h1.textContent,
        lines: Math.round(h1.getBoundingClientRect().height / lh),
        // On the SAME line as the chevron — that adjacency is what removed the
        // 44px band above it.
        sameRowAsBack: back ? Math.abs(back.getBoundingClientRect().top - h1.getBoundingClientRect().top) < 24 : false,
      }
    })
    expect(title.text).toBe('Legs & Core B')
    expect(title.lines, 'the title wraps').toBe(1)
    expect(title.sameRowAsBack, 'the chevron is not on the title row').toBe(true)

    // And the header never pushes the page sideways.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    await page.locator('#probe-summary').screenshot({ path: `e2e/__screenshots__/session-summary-header-${vp.name}.png` })
  })
}
