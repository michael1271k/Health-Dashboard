import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { LazyMotion, domMax } from 'framer-motion'
import { SetEditorRow } from '@/components/command-center/SetEditorRow'
import {
  setGridFor, setValueLabel, SET_BADGE_W, SET_FRAME_GAP, SET_HEADER_TEXT, SET_TAIL_W,
  type SetGridMode,
} from '@/components/command-center/setGrid'
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
 *
 * ── AND IT EMITS ALL THREE COLUMN MODES ──────────────────────────────────────
 * A hold and a knee raise have fewer columns than a bench press (see
 * `SetGridMode`), and each mode is its own grid template. Measuring only the
 * loaded one would leave the other two — the ones with the widest PREVIOUS
 * column and therefore the most room to get the template wrong — unchecked.
 */

const FIXTURE = resolve(__dirname, '../../e2e/__fixtures__/set-rows.html')

const noop = () => {}

/** A card's worth of rows: warm-up, a heavy load, an open tuner, a ticked set. */
const LOADED: DraftSet[] = [
  { weightKg: 17.5, reps: 12, setType: 'warmup', done: false },
  { weightKg: 102.25, reps: 8, done: false },
  { weightKg: 8.75, reps: 14, rpe: 9, done: false },   // "Very Hard", tuner open
  { weightKg: 60, reps: 10, rpe: 9.5, done: true },    // "Max Effort", ticked
]

/** Bodyweight: reps only, no load anywhere, so no KG column. */
const REPS: DraftSet[] = [
  { weightKg: 0, reps: 15, done: false },
  { weightKg: 0, reps: 12, rpe: 9, done: true },
]

/** A hold: the reps field carries seconds, and there is nothing else. */
const TIME: DraftSet[] = [
  { weightKg: 0, reps: 45, done: false },
  { weightKg: 0, reps: 90, rpe: 9.5, done: true },
]

/** The header frame, spelled exactly as `ExerciseCard` spells it. */
function Header({ mode }: { mode: SetGridMode }) {
  return (
    <div className={`flex items-center ${SET_FRAME_GAP} px-2 pb-1`}>
      <span className={`${SET_BADGE_W} shrink-0 ${SET_HEADER_TEXT}`}>Set</span>
      <span className={`flex-1 ${setGridFor(mode)} ${SET_HEADER_TEXT}`}>
        <span>Previous</span>
        {mode === 'loaded' ? <span>kg</span> : <span aria-hidden="true" />}
        <span>{setValueLabel(mode)}</span>
        <span className="text-right">RPE</span>
      </span>
      <span className={`${SET_TAIL_W} shrink-0`} />
    </div>
  )
}

function Deck({ mode, sets, activeIdx, timed }: {
  mode: SetGridMode
  sets: DraftSet[]
  activeIdx: number
  timed?: boolean
}) {
  return (
    <div data-probe-deck={mode} style={{ padding: 12 }}>
      <Header mode={mode} />
      {sets.map((set, i) => (
        <SetEditorRow
          key={i} index={i} displayNum={i + 1} set={set}
          prev={{ weightKg: mode === 'loaded' ? 17.5 : 0, reps: mode === 'time' ? 60 : 12 }}
          active={i === activeIdx} trackRpe prAxes={[]}
          gridMode={mode} timed={timed} bodyweight={mode !== 'loaded'}
          onActivate={noop} onChange={noop} onRemove={noop}
          onToggleDone={noop} onSplit={noop} onPrTap={noop}
        />
      ))}
    </div>
  )
}

describe('the set row markup the browser test measures', () => {
  it('renders every state and every column mode, and lands in the fixture the e2e spec reads', () => {
    const html = renderToStaticMarkup(
      <LazyMotion features={domMax} strict>
        <div id="probe-deck">
          <Deck mode="loaded" sets={LOADED} activeIdx={2} />
          <Deck mode="reps" sets={REPS} activeIdx={0} />
          <Deck mode="time" sets={TIME} activeIdx={0} timed />
        </div>
      </LazyMotion>,
    )

    // The states the browser test needs to be able to see. If one of these
    // stops rendering, the layout assertions downstream go quietly vacuous.
    expect(html).toContain('Very Hard')   // the tooltip, not a chip
    expect(html).toContain('Max Effort')
    expect(html).toContain('102.25')
    expect(html).toContain('17.5kg × 12')
    // The tuner is open on one row per deck.
    expect(html).toContain('Weight · kg')
    // Effort is a COLUMN now, not a chip on a second line. The words survive
    // only as tooltips, which is what keeps the row one line tall.
    expect(html).not.toContain('>Very Hard<')
    // A hold's previous is seconds, not a weight and not a rep count.
    expect(html).toContain('60s')

    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, html, 'utf8')
  })
})
