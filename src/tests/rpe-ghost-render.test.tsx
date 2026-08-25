import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LazyMotion, domMax } from 'framer-motion'
import { SetEditorRow } from '@/components/command-center/SetEditorRow'
import { cascadeSetEdit, type DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE CONTROL THAT DISAPPEARED WHEN IT WAS NEEDED ─────────────────────────
 *
 * `rpe-ladder.test.ts` pins the DATA half of the vanishing-Failure bug: the
 * remembered value survives a rep bump inside `rpeSeed`. That was already true
 * of the broken build — surviving in a field nothing renders is the same as not
 * surviving, which is why the fix is only half a fix without these.
 *
 * These assert the half the user actually reported: after adding a rep to a set
 * showing "10 · Failure", the number, the word and both ± steppers are still on
 * the screen.
 *
 * Server markup rather than jsdom + Testing Library on purpose — it is the
 * cheapest way to ask "is this element in the tree", and the tree is the whole
 * question here.
 */
const noop = () => {}

function rowHtml(set: DraftSet): string {
  return renderToStaticMarkup(
    <LazyMotion features={domMax} strict>
      <SetEditorRow
        index={2}
        displayNum={3}
        set={set}
        active                 // the tuner is open — this is where the ladder lives
        trackRpe
        onActivate={noop}
        onChange={noop}
        onRemove={noop}
        onToggleDone={noop}
      />
    </LazyMotion>,
  )
}

/** The reported set: Lateral Raise Cable, 3.75 kg × 16 @ 10, carried from last session. */
const seeded: DraftSet = {
  weightKg: 3.75, reps: 16, rpe: 10, setType: 'failure',
  rpeSeed: 10, rpeSeedWeightKg: 3.75, rpeSeedReps: 16, done: false,
}

describe('the effort control survives the rep that withdraws its rating', () => {
  const bumped = cascadeSetEdit([seeded], 0, { reps: 17 })[0]

  it('still names the rating after the bump', () => {
    // The state that produced the report. The rating is gone from `rpe` —
    // correctly, it is unconfirmed — and the readout must not fall to
    // "Not rated" as though the number had never existed.
    expect(bumped.rpe).toBeUndefined()
    const html = rowHtml(bumped)
    expect(html).toContain('10 · Failure')
    expect(html).not.toContain('Not rated')
  })

  it('marks it as awaiting an answer rather than as a rating', () => {
    expect(rowHtml(bumped)).toContain('confirm')
  })

  it('keeps both half-step steppers mounted', () => {
    const html = rowHtml(bumped)
    expect(html).toContain('Increase effort for set 3 by half a point')
    expect(html).toContain('Decrease effort for set 3 by half a point')
  })

  it('prints the withdrawn value in the row itself, not a bare dot', () => {
    // The 28px effort column used to collapse to a 1.5px pip, which says that
    // something wants answering without saying what it was.
    expect(rowHtml(bumped)).toContain('unconfirmed')
  })

  it('shows a confirmed rating with no confirm prompt', () => {
    const confirmed = cascadeSetEdit([bumped], 0, { rpe: 10 })[0]
    const html = rowHtml(confirmed)
    expect(html).toContain('10 · Failure')
    expect(html).not.toContain('confirm')
    expect(html).toContain('Increase effort for set 3 by half a point')
  })

  it('still says nothing at all about a set that was never rated', () => {
    const html = rowHtml({ weightKg: 40, reps: 12, done: false })
    expect(html).toContain('Not rated')
    expect(html).not.toContain('Increase effort for set 3 by half a point')
  })
})
