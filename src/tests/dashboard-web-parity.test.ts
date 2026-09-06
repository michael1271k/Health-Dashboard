import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WIDGET_IDS, type WidgetId } from '@/lib/dashboard/layout'

/**
 * Every catalogue id the web offers must have a face to draw.
 *
 * ── WHY THIS IS WRITTEN AGAINST THE SOURCE TEXT ─────────────────────────────
 * `WIDGET_IDS` is ONE catalogue shared with the phone. Wave 12 appended
 * `trajectory` to it for the app grid and WidgetKit, and `renderWidget` in
 * `src/app/page.tsx` — a `switch` with no `default` — gained no case for it.
 * That is not a type error: the switch returns `React.ReactNode`, and
 * `undefined` is a valid `ReactNode`. So it compiled, and `reconcile` (which
 * APPENDS every catalogue id a stored layout predates) put a blank 172 px slot
 * on every dashboard that had ever been arranged.
 *
 * A unit test cannot see that either — the gap is in a switch's completeness,
 * not in any function's return value. So this reads the two files and fails on
 * the mismatch: an id is either drawn by the web or declared as one the web
 * does not draw, and adding a third state is what this test exists to stop.
 */

const PAGE = 'src/app/page.tsx'
const GRID = 'src/components/dashboard/WidgetGrid.tsx'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

/** The ids `renderWidget` has a `case` for. */
function renderedIds(): Set<string> {
  const src = read(PAGE)
  const start = src.indexOf('const renderWidget')
  expect(start, `${PAGE} no longer defines renderWidget`).toBeGreaterThan(-1)
  const out = new Set<string>()
  for (const m of src.slice(start).matchAll(/case '([a-z]+)':/g)) out.add(m[1])
  return out
}

/** The ids `WidgetGrid` declares the web cannot draw. */
function excludedIds(): Set<string> {
  const src = read(GRID)
  const m = src.match(/NOT_ON_WEB[^=]*=\s*new Set<WidgetId>\(\[([^\]]*)\]\)/)
  expect(m, `${GRID} no longer declares NOT_ON_WEB as a literal Set`).not.toBeNull()
  const out = new Set<string>()
  for (const q of m![1].matchAll(/'([a-z]+)'/g)) out.add(q[1])
  return out
}

describe('the web draws every widget it offers', () => {
  it('every catalogue id is either rendered or declared not-on-web', () => {
    const drawn = renderedIds()
    const excluded = excludedIds()
    const orphans = WIDGET_IDS.filter((id) => !drawn.has(id) && !excluded.has(id))
    expect(
      orphans,
      `${orphans.join(', ')} in WIDGET_IDS with no case in ${PAGE}. ` +
        `Add the case, or add the id to NOT_ON_WEB in ${GRID} — an id in neither ` +
        'reconciles onto every stored layout as an empty slot.',
    ).toEqual([])
  })

  it('nothing is both drawn and excluded', () => {
    const drawn = renderedIds()
    const both = [...excludedIds()].filter((id) => drawn.has(id))
    expect(
      both,
      `${both.join(', ')} is in NOT_ON_WEB but ${PAGE} draws it. Remove it from the set.`,
    ).toEqual([])
  })

  it('every excluded id is a real catalogue id', () => {
    const ids = new Set<string>(WIDGET_IDS as readonly string[])
    const unknown = [...excludedIds()].filter((id) => !ids.has(id))
    expect(unknown, `NOT_ON_WEB names ${unknown.join(', ')}, which is not in WIDGET_IDS`).toEqual([])
  })

  it('trajectory is the wave-12 id this exists for', () => {
    // A canary, not a rule: when the web grows the tile, delete this case and
    // the entry together. If it fails because the id is gone from the
    // catalogue, delete the test — the concern went with it.
    expect(WIDGET_IDS as readonly WidgetId[]).toContain('trajectory')
    expect(excludedIds().has('trajectory') || renderedIds().has('trajectory')).toBe(true)
  })
})
