import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ── THE SESSION REPORT'S LEDGER, MEASURED ────────────────────────────────────
 *
 * Every complaint about this ledger was a layout failure, and jsdom has no
 * layout engine: it will report that a 46px column contains "VERY HARD" and
 * that a chip 40px wide contains `8.75kg × 12`, because it never computes a
 * width. So the real markup — emitted by `src/tests/session-report-render.test.tsx`,
 * where React's JSX transform lives — is injected into a page that has already
 * loaded the app's stylesheet, and measured.
 *
 * The fixture carries the hard cases on purpose: a three-digit decimal load, a
 * failure set that is also a record, a unilateral pair whose sides differ, and
 * the longest real exercise name in the catalogue.
 *
 * Run the unit suite first; the fixture is its output.
 */

const FIXTURE = resolve(__dirname, '__fixtures__/session-ledger.html')

const VIEWPORTS = [
  { name: 'iphone-se', width: 360 },
  { name: 'iphone-14', width: 390 },
]

for (const vp of VIEWPORTS) {
  test(`session ledger holds its columns @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run \`npm test\` to emit it`).toBe(true)

    // Tall on purpose: only the WIDTH decides the columns, and a short viewport
    // puts the last rows under Next's dev overlay in the screenshot.
    await page.setViewportSize({ width: vp.width, height: 1200 })
    await page.goto('/auth', { waitUntil: 'domcontentloaded' })
    await page.evaluate((markup) => {
      const host = document.createElement('div')
      host.id = 'probe-ledger'
      host.innerHTML = markup
      // PINNED TO THE TOP OF THE VIEWPORT. Appended into the flow it lands
      // below /auth's own full-height content — off screen, and in the
      // screenshot, underneath Next's fixed dev-overlay badge. Prepending
      // instead puts it where React's root reconciliation removes it mid-test.
      // Fixed at the top costs nothing: it still resolves against the viewport
      // width, which is the only dimension these assertions are about.
      Object.assign(host.style, {
        position: 'fixed', top: '0', left: '0', right: '0', zIndex: '99999',
        background: '#0A0B0D',
      })
      document.body.appendChild(host)
    }, readFileSync(FIXTURE, 'utf8'))

    /* ── THE GRID HAS TO ACTUALLY BE APPLIED BEFORE ANY OF THIS MEANS ANYTHING ──
       `LEDGER_GRID` is a Tailwind ARBITRARY value, so changing a column width
       mints a class the dev server has not compiled yet. Measured against a
       stylesheet that predates the edit, the rows fall back to an implicit
       one-column grid — and every assertion below then describes a layout that
       does not exist. It cost half an hour once; it costs one assertion now. */
    const tracks = await page.evaluate(() => {
      const el = document.querySelector('#probe-ledger [data-set-row]')
      return el ? getComputedStyle(el).gridTemplateColumns.split(/\s+/).length : 0
    })
    expect(tracks, 'the ledger grid class has not been compiled — restart the dev server').toBe(4)

    // The header row and every set row share one template, so cell N of each
    // must share a left edge. That is what makes it a table rather than five
    // rows that happen to be stacked.
    const lefts = await page.evaluate(() => {
      const sel = '#probe-ledger [data-set-head], #probe-ledger [data-set-row]'
      return Array.from(document.querySelectorAll(sel))
        .map((g) => Array.from(g.children).map((c) => Math.round(c.getBoundingClientRect().left)))
    })
    expect(lefts.length, 'the fixture did not render its rows').toBeGreaterThanOrEqual(5)
    for (let col = 0; col < 4; col++) {
      const xs = lefts.map((r) => r[col])
      const drift = Math.max(...xs) - Math.min(...xs)
      expect(drift, `column ${col} drifts ${drift}px across ${xs.length} rows`).toBeLessThanOrEqual(1)
    }

    // `scrollWidth` past `clientWidth` is precisely what an ellipsis hides —
    // this is the assertion that `8.75` stays `8.75` and VERY HARD stays whole.
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('#probe-ledger *'))) {
        const e = el as HTMLElement
        if (!e.textContent?.trim()) continue
        // ── CHECK EVERY ELEMENT, NOT JUST LEAVES ──
        // The first version skipped anything with element children, on the
        // theory that only a text node can be clipped. It let a real clip
        // through: `102.25kg × 8` ellipsized inside a `truncate` span whose
        // own box was fine, because the shrinking happened one level up. What
        // identifies a clip is not childlessness, it is a box that hides
        // overflow while holding more than it can show.
        const cs = getComputedStyle(e)
        const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis'
        if (!clips) continue
        // ── MEASURED WITH A RANGE, NOT WITH `scrollWidth` ──
        // `scrollWidth` reported 107 against a 107px box for text the browser
        // was visibly rendering as "102.25kg ×…". It rounds, and on a box whose
        // content is a single nowrap text run it can agree with `clientWidth`
        // while an ellipsis is on screen. A Range over the element's contents
        // measures the text's own laid-out extent, which is the thing being
        // clipped, and it caught what two earlier versions of this check let
        // through.
        const r = document.createRange()
        r.selectNodeContents(e)
        const textW = r.getBoundingClientRect().width
        r.detach()
        // ── THE BOX IS FRACTIONAL; `clientWidth` IS NOT ──
        // `102.25kg × 8` measured 106.72px of text and reported a clientWidth
        // of 107, so every integer comparison said it fit — while the browser
        // drew "102.25kg ×…" on screen, because the REAL box was 106.53px and
        // the last glyph fell outside it. `clientWidth` rounds up; the layout
        // does not. So the content box is reconstructed from the fractional
        // rect, and the comparison is exact.
        const cw = e.getBoundingClientRect().width
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
          - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
        if (textW > cw + 0.05) {
          out.push(`"${e.textContent.trim().slice(0, 40)}" box ${cw.toFixed(2)}px < text ${textW.toFixed(2)}px`)
        }
      }
      return out
    })
    expect(clipped, `clipped text: ${clipped.join(' · ')}`).toEqual([])

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    // The app's own fixed chrome paints over an element screenshot, which hid
    // the unilateral row — the one this probe most exists to look at.
    await page.evaluate(() => {
      document.querySelectorAll('nav, header, .app-chrome, nextjs-portal').forEach((el) => {
        (el as HTMLElement).style.display = 'none'
      })
    })
    await page.locator('#probe-ledger').screenshot({ path: `e2e/__screenshots__/session-ledger-${vp.name}.png` })
  })
}
