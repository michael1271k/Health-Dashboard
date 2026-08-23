import { describe, it, expect } from 'vitest'
import { basisOf, compareProgress } from '@/lib/hooks/useSessionIntel'

/**
 * ── THE `═` THAT SHOULD HAVE BEEN `⬆️` ───────────────────────────────────────
 *
 * Upper A on 2026-08-23, read out of `workout_sets`, against the last completed
 * Upper A (2026-08-16). Three movements improved and all three printed "held",
 * because the comparison basis was the TOP SET's estimated 1RM and on a double-
 * progression program the top set is the set that is pinned: it arrives at the
 * rep ceiling first and then deliberately stops moving while the back-off sets
 * climb toward it.
 *
 * The basis is the MEAN across the working sets now — `useSessionTrends` has
 * plotted that axis since 2026-08-18, so the glyph and the sparkline next to it
 * are finally the same number. These are the real rows.
 */
type Row = { weight_kg: number; reps: number; est_1rm_kg: number | null; side: string | null; pair_id: string | null }
const set = (weight_kg: number, reps: number): Row =>
  ({ weight_kg, reps, est_1rm_kg: null, side: null, pair_id: null })

const AUG_16 = {
  'Incline DB Press': [set(40, 11), set(40, 9), set(40, 7)],
  'Lat Pulldown': [set(49.5, 10), set(49.5, 10), set(47, 11)],
  'Face Pull': [set(16.25, 15), set(16.25, 14), set(16.25, 11)],
}
const AUG_23 = {
  'Incline DB Press': [set(40, 11), set(40, 9), set(40, 9)],
  'Lat Pulldown': [set(49.5, 10), set(49.5, 10), set(49.5, 9)],
  'Face Pull': [set(16.25, 15), set(16.25, 14), set(16.25, 12)],
}

const NAMES = Object.keys(AUG_16) as Array<keyof typeof AUG_16>

describe('the vs-last-session basis', () => {
  it('reads every one of the three as PROGRESS, not as held', () => {
    for (const name of NAMES) {
      const before = basisOf(AUG_16[name], false)
      const after = basisOf(AUG_23[name], false)
      expect(after, name).toBeGreaterThan(before)
    }
  })

  it('the OLD top-set basis called all three a tie — which is the bug', () => {
    // Ranked (weight, then reps), exactly as the card picks its best set.
    const topOf = (rows: Row[]) =>
      rows.reduce((b, s) => (s.weight_kg > b.weight_kg || (s.weight_kg === b.weight_kg && s.reps > b.reps) ? s : b), rows[0])
    for (const name of NAMES) {
      const a = topOf(AUG_16[name]), b = topOf(AUG_23[name])
      expect([b.weight_kg, b.reps], name).toEqual([a.weight_kg, a.reps])
    }
  })

  it('credits a LOAD increase that costs a rep', () => {
    // Lat Pulldown set 3 went 47×11 → 49.5×9. Tonnage FALLS (1507 → 1435.5), so
    // a volume-based axis would print a regression on the exact session the
    // program was waiting for. The mean est-1RM rises, and it is right.
    const tonnage = (rows: Row[]) => rows.reduce((n, s) => n + s.weight_kg * s.reps, 0)
    expect(tonnage(AUG_23['Lat Pulldown'])).toBeLessThan(tonnage(AUG_16['Lat Pulldown']))
    expect(basisOf(AUG_23['Lat Pulldown'], false)).toBeGreaterThan(basisOf(AUG_16['Lat Pulldown'], false))
  })

  it('credits an ADDED set — the case the top set can never see', () => {
    const three = [set(40, 10), set(40, 10), set(40, 10)]
    const four = [...three, set(40, 10)]
    // Same mean, so a fourth identical set is not itself "stronger"…
    expect(basisOf(four, false)).toBeCloseTo(basisOf(three, false), 6)
    // …but a fourth set at ANY better quality moves it, which is what a session
    // that added work should read as.
    expect(basisOf([...three, set(42.5, 10)], false)).toBeGreaterThan(basisOf(three, false))
  })

  it('scores unloaded work on reps, and collapses a unilateral pair to one set', () => {
    const reps = (r: number): Row => ({ weight_kg: 0, reps: r, est_1rm_kg: null, side: null, pair_id: null })
    expect(basisOf([reps(15), reps(13)], true)).toBe(14)
    // L and R of one pair are ONE set: the right side leads.
    const pair: Row[] = [
      { weight_kg: 20, reps: 10, est_1rm_kg: null, side: 'L', pair_id: 'p1' },
      { weight_kg: 20, reps: 12, est_1rm_kg: null, side: 'R', pair_id: 'p1' },
    ]
    expect(basisOf(pair, false)).toBeCloseTo(basisOf([set(20, 12)], false), 6)
  })

  it('prefers the STORED est-1RM, and treats a stored 0 as absent', () => {
    // `||` not `??` — a zero in that column is an unloaded row, never a real
    // one-rep max. See `unloaded-work-blind-spot`.
    const stored: Row = { weight_kg: 40, reps: 10, est_1rm_kg: 61, side: null, pair_id: null }
    expect(basisOf([stored], false)).toBe(61)
    const zero: Row = { weight_kg: 40, reps: 10, est_1rm_kg: 0, side: null, pair_id: null }
    expect(basisOf([zero], false)).toBeGreaterThan(40)
  })

  it('is 0 for a session with no working sets, so no baseline is invented', () => {
    expect(basisOf([], false)).toBe(0)
  })
})

/**
 * ── A WARM-UP IS NOT A REGRESSION ────────────────────────────────────────────
 * `basisOf` is handed only the WORKING sets, so an exercise that was warmed up
 * and then abandoned has an empty list and a basis of 0. Zero is the absence of
 * work, not a measurement of it — `useSessionIntel` therefore treats a zero on
 * EITHER side as "no comparison", not as a fall to nothing. Guarding only the
 * previous side would print ⬇️ on a lift you never actually worked.
 */
describe('a session with no working set on an exercise', () => {
  const comparable = (a: number, b: number) => a > 0 && b > 0

  it('scores 0, and 0 is disqualifying on either side', () => {
    expect(basisOf([], false)).toBe(0)
    const real = basisOf([set(40, 10), set(40, 9)], false)
    expect(real).toBeGreaterThan(0)
    expect(comparable(basisOf([], false), real)).toBe(false)   // today was warm-ups only
    expect(comparable(real, basisOf([], false))).toBe(false)   // last time was
    expect(comparable(real, real)).toBe(true)
  })

  it('a real unloaded set is never 0, so bodyweight work is never disqualified', () => {
    const reps = (r: number) => ({ weight_kg: 0, reps: r, est_1rm_kg: null, side: null, pair_id: null })
    expect(basisOf([reps(1)], true)).toBe(1)
  })
})

/**
 * ── THE TIEBREAK: WHAT COUNTS AS PROGRESS WHEN INTENSITY DOES NOT MOVE ───────
 *
 * `basisOf` is a MEAN, so it is deliberately blind to how many sets it averages
 * — that is what makes it immune to a warm-up and to a dropped back-off set.
 * The cost is that it is also silent on the one form of overload that changes
 * nothing else: the same work, one more time.
 *
 * `compareProgress` is the rule that closes that gap without reopening the one
 * this file was written for. Intensity decides; tonnage only breaks an exact
 * tie. See its header for why there is no dead band.
 */
describe('compareProgress — intensity first, tonnage as the tiebreak', () => {
  it('lets intensity decide even when tonnage disagrees — the Lat Pulldown case', () => {
    // 16 Aug 49.5×10, 49.5×10, 47×11 → 23 Aug 49.5×10, 49.5×10, 49.5×9.
    // The load went up on set 3 and cost two reps: tonnage FALLS by 71.5 kg
    // while the mean est-1RM rises. Volume-first would call this a regression.
    const before = { basis: basisOf(AUG_16['Lat Pulldown'], false), volumeKg: 1507 }
    const now = { basis: basisOf(AUG_23['Lat Pulldown'], false), volumeKg: 1435.5 }
    expect(now.volumeKg).toBeLessThan(before.volumeKg)
    expect(compareProgress(now, before)).toEqual({ delta: 1, axis: 'intensity' })
  })

  it('never demotes a small intensity gain to the volume axis — no dead band', () => {
    // The same session, stated as the invariant rather than as a number: the
    // Lat Pulldown moved +0.1%, and any floor worth having would have swallowed
    // it and handed the verdict to a tonnage that fell.
    const a = basisOf(AUG_23['Lat Pulldown'], false)
    const b = basisOf(AUG_16['Lat Pulldown'], false)
    expect(Math.abs((a - b) / b) * 100).toBeLessThan(1)
    expect(compareProgress({ basis: a, volumeKg: 1 }, { basis: b, volumeKg: 999 }).axis).toBe('intensity')
  })

  it('credits the same work done one more time', () => {
    // Three sets of 40×10 → four sets of 40×10. Identical mean, 25% more work.
    // This is the case a pure mean cannot see, and it is unambiguously progress.
    const three = basisOf([set(40, 10), set(40, 10), set(40, 10)], false)
    const four = basisOf([set(40, 10), set(40, 10), set(40, 10), set(40, 10)], false)
    // NOT `toBe`. Averaging the same value over three divisors and over four
    // lands 1.4e-14 apart in IEEE 754 — which is precisely why
    // `compareProgress` compares to 1e-9 instead of with `===`. Asserting exact
    // equality here would have failed on a rule that is behaving correctly.
    expect(four).toBeCloseTo(three, 9)
    expect(compareProgress({ basis: four, volumeKg: 1600 }, { basis: three, volumeKg: 1200 }))
      .toEqual({ delta: 1, axis: 'volume' })
  })

  it('reports a dropped set on the VOLUME axis, so a deload can be described as one', () => {
    // The symmetric case, and the reason `axis` is exported rather than kept
    // private: during a maintenance week this fires often, and a surface that
    // knows the intensity held can say "same weights, less work" instead of
    // showing a bare red arrow for a planned week.
    const v = compareProgress(
      { basis: basisOf([set(40, 10), set(40, 10)], false), volumeKg: 800 },
      { basis: basisOf([set(40, 10), set(40, 10), set(40, 10)], false), volumeKg: 1200 },
    )
    expect(v).toEqual({ delta: -1, axis: 'volume' })
  })

  it('holds only when NEITHER dial moved', () => {
    expect(compareProgress({ basis: 50, volumeKg: 1200 }, { basis: 50, volumeKg: 1200 }))
      .toEqual({ delta: 0, axis: 'intensity' })
  })

  it('does not mistake float noise in a mean for a change', () => {
    // Two sessions of the same sets can differ in the last bit; that is not a
    // week of progress.
    expect(compareProgress({ basis: 50 + 1e-12, volumeKg: 1200 }, { basis: 50, volumeKg: 1200 }))
      .toEqual({ delta: 0, axis: 'intensity' })
  })
})
