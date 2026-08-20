import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { LazyMotion, domMax } from 'framer-motion'
import { SetEditorRow } from '@/components/command-center/SetEditorRow'
import { SET_GRID, SET_HEADER_TEXT, SET_TAIL_W } from '@/components/command-center/setGrid'
import type { DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE BRIDGE TO THE BROWSER ────────────────────────────────────────────────
 *
 * jsdom has no layout engine: it will happily report that a 44px column
 * contains "VERY HARD", because it never computes a width. Every bug the set
 * row was rebuilt for — zig-zagging numbers, `ver…`, `8.75` clipped inside its
 * own input — is invisible to this suite by construction. They are only visible
 * to a real browser with the real stylesheet, i.e. to `e2e/set-row-grid.spec.ts`.
 *
 * That spec cannot import the component itself. Playwright transpiles every
 * file it loads with ITS OWN JSX factory (elements come out as `__pw_type`
 * objects for component testing), so `renderToStaticMarkup` receives something
 * React cannot render — verified, not assumed.
 *
 * So the markup is emitted here, where the JSX transform is React's, and the
 * Playwright spec reads the file. Running the unit suite refreshes it, which is
 * why this lives in `src/tests` rather than in a script nobody remembers to run.
 */

const FIXTURE = resolve(__dirname, '../../e2e/__fixtures__/set-rows.html')

const noop = () => {}

/** A card's worth of rows: warm-up, a heavy load, an open tuner, a ticked set. */
const SETS: DraftSet[] = [
  { weightKg: 17.5, reps: 12, setType: 'warmup', done: false },
  { weightKg: 102.25, reps: 8, done: false },
  { weightKg: 8.75, reps: 14, rpe: 9, done: false },   // "Very Hard", tuner open
  { weightKg: 60, reps: 10, rpe: 9.5, done: true },    // "Max Effort", ticked
]

describe('the set row markup the browser test measures', () => {
  it('renders every state, and lands in the fixture the e2e spec reads', () => {
    const html = renderToStaticMarkup(
      <LazyMotion features={domMax} strict>
        <div id="probe-deck" style={{ padding: 12 }}>
          <div className="flex items-center gap-2 px-2 pb-1">
            <span className={`flex-1 ${SET_GRID} ${SET_HEADER_TEXT}`}>
              <span>Set</span><span>Previous</span><span>kg</span><span>Reps</span>
            </span>
            <span className={`${SET_TAIL_W} shrink-0`} />
          </div>
          {SETS.map((set, i) => (
            <SetEditorRow
              key={i} index={i} displayNum={i + 1} set={set}
              prev={{ weightKg: 17.5, reps: 12 }}
              active={i === 2} trackRpe prAxes={[]}
              onActivate={noop} onChange={noop} onRemove={noop}
              onToggleDone={noop} onSplit={noop} onPrTap={noop}
            />
          ))}
        </div>
      </LazyMotion>,
    )

    // The states the browser test needs to be able to see. If one of these
    // stops rendering, the layout assertions downstream go quietly vacuous.
    expect(html).toContain('Very Hard')
    expect(html).toContain('Max Effort')
    expect(html).toContain('102.25')
    expect(html).toContain('17.5kg × 12')
    expect(html).toContain('Warm-up')      // the words, not just "W"
    expect(html).toContain('Remove set')   // the tuner is open on row 3

    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, html, 'utf8')
  })
})
