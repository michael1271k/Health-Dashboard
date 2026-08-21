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
 * loaded the app's real stylesheet, and measured. Three claims:
 *
 *   · every cell N shares a left edge down the card. That IS a column.
 *   · nothing that carries a word is narrower than the word it carries.
 *   · and each of the three column MODES resolves to the tracks it claims.
 *
 * Run the unit suite first; the fixture is its output.
 */

const FIXTURE = resolve(__dirname, '__fixtures__/set-rows.html')

const VIEWPORTS = [
  { name: 'iphone-se', width: 360 },
  { name: 'iphone-14', width: 390 },
]

/**
 * How many DATA columns each mode has — the badge and the tick are outside.
 * Four in every mode now: the load track is always present so every value in
 * the deck shares an edge, and the unloaded modes leave it empty.
 */
const TRACKS: Record<string, number> = { loaded: 4, reps: 4, time: 4 }

for (const vp of VIEWPORTS) {
  test(`set rows form real columns @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run \`npm test\` to emit it`).toBe(true)
    const html = readFileSync(FIXTURE, 'utf8')

    await page.setViewportSize({ width: vp.width, height: 1400 })
    await page.goto('/auth', { waitUntil: 'domcontentloaded' })
    await page.evaluate((markup) => {
      const host = document.createElement('div')
      // Pinned over the page. The app's fixed chrome and Next's dev overlay
      // both paint above content in normal flow, and an element screenshot of
      // something underneath them is a screenshot of them.
      host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0A0B0D'
      host.innerHTML = markup
      document.body.appendChild(host)
    }, html)

    /**
     * ── THE GRID HAS TO HAVE COMPILED ──────────────────────────────────────
     * `setGridFor` builds arbitrary Tailwind classes (`grid-cols-[28px_…]`).
     * A class the dev server has not compiled yet resolves to `none`, and every
     * measurement below then describes an UNSTYLED stack of spans — which
     * aligns perfectly and clips nothing. This probe once passed a screenshot
     * that visibly showed the bug for exactly that reason.
     */
    const modes = await page.evaluate(() => {
      const out: Array<{ mode: string; tracks: number[]; lefts: number[][] }> = []
      for (const deck of Array.from(document.querySelectorAll('[data-probe-deck]'))) {
        const mode = (deck as HTMLElement).dataset.probeDeck ?? '?'
        const grids = Array.from(deck.querySelectorAll('[class*="grid-cols-["]'))
        out.push({
          mode,
          tracks: grids.map((g) => getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean).length),
          lefts: grids.map((g) => Array.from(g.children).map((c) => Math.round(c.getBoundingClientRect().left))),
        })
      }
      return out
    })

    expect(modes.map((m) => m.mode), 'the fixture did not emit all three column modes')
      .toEqual(['loaded', 'reps', 'time'])

    for (const { mode, tracks, lefts } of modes) {
      const want = TRACKS[mode]
      // Header + at least two rows.
      expect(lefts.length, `${mode}: the fixture did not render as grids`).toBeGreaterThanOrEqual(3)
      for (const t of tracks) {
        expect(t, `${mode}: grid resolved to ${t} tracks, not ${want} — the arbitrary class did not compile`)
          .toBe(want)
      }
      for (let col = 0; col < want; col++) {
        const xs = lefts.map((r) => r[col])
        const drift = Math.max(...xs) - Math.min(...xs)
        expect(drift, `${mode}: column ${col} drifts by ${drift}px across ${xs.length} rows`).toBeLessThanOrEqual(1)
      }
    }

    // `scrollWidth` past `clientWidth` is exactly what an ellipsis hides.
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('[data-probe-deck] *'))) {
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

    // And the card never pushes the page sideways.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    await page.locator('#probe-deck').screenshot({ path: `e2e/__screenshots__/set-rows-${vp.name}.png` })
  })
}
