import { describe, it, expect } from 'vitest'
import { formatSet, formatLoad, formatReps, isUnloadedSet } from '@/lib/utils/setFormat'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

const s = (weightKg: number, reps: number, extra: Partial<ExportSet> = {}): ExportSet =>
  ({ weightKg, reps, rpe: null, side: null, failure: false, pairId: null, ...extra })

/**
 * "0 kg × 17" states a load that does not exist and buries the only number the
 * set has behind it. Every surface hand-rolled `${w}${unit} × ${reps}`, so the
 * rule has to live in one place or it will drift back on the next component.
 */
describe('formatSet', () => {
  it('reads a loaded set as load × reps', () => {
    expect(formatSet(60, 12)).toBe('60kg × 12')
    expect(formatSet(16.25, 15)).toBe('16.25kg × 15')
  })

  it('reads unloaded work as reps', () => {
    expect(formatSet(0, 17)).toBe('17 reps')
    expect(formatSet(0, 1)).toBe('1 rep')
    expect(formatSet(null, 15)).toBe('15 reps')
  })

  it('reads a timed hold as seconds, whatever the load column says', () => {
    expect(formatSet(0, 58, { timed: true })).toBe('58 sec')
    // A weighted carry is still scored on time.
    expect(formatSet(20, 45, { timed: true })).toBe('45 sec')
  })

  it('converts and labels the unit for loaded sets only', () => {
    const toLb = (kg: number) => Math.round(kg * 2.20462 * 100) / 100
    expect(formatSet(60, 12, { unit: 'lb', toDisplay: toLb })).toBe('132.28lb × 12')
    // No load to convert — the unit must not leak onto a rep count.
    expect(formatSet(0, 17, { unit: 'lb', toDisplay: toLb })).toBe('17 reps')
  })

  it('has a bare form for columns that already say which number this is', () => {
    expect(formatSet(0, 17, { bare: true })).toBe('17')
    expect(formatSet(0, 58, { timed: true, bare: true })).toBe('58s')
  })

  it('treats only a real positive load as loaded', () => {
    expect(isUnloadedSet(0)).toBe(true)
    expect(isUnloadedSet(null)).toBe(true)
    expect(isUnloadedSet(undefined)).toBe(true)
    expect(isUnloadedSet(Number.NaN)).toBe(true)
    expect(isUnloadedSet(-5)).toBe(true)
    expect(isUnloadedSet(0.25)).toBe(false)
  })

  it('formats the halves independently', () => {
    expect(formatLoad(40)).toBe('40kg')
    expect(formatLoad(0)).toBe('bodyweight')
    expect(formatReps(12)).toBe('12 reps')
    expect(formatReps(58, true)).toBe('58 sec')
  })
})

describe('setDetail carries the same rule into the export', () => {
  it('groups a loaded exercise by load', () => {
    expect(setDetail([s(60, 12), s(60, 11), s(57.5, 10)], 'Hack Squat'))
      .toBe('60kg × 12,11 · 57.5kg × 10 (RPE not reported)')
  })

  it('writes bodyweight work as reps, not as 0 kg', () => {
    expect(setDetail([s(0, 17), s(0, 16)], 'Reverse Crunch')).toBe('17,16 reps (RPE not reported)')
  })

  it('writes a hold as seconds', () => {
    expect(setDetail([s(0, 58)], 'Side Plank')).toBe('58 sec (RPE not reported)')
  })

  it('keeps the tags spelled out on unloaded sets too', () => {
    expect(setDetail([s(0, 12, { warmup: true }), s(0, 17)], 'Hanging Knee Raise'))
      .toBe('12 reps (Warmup) · 17 reps (RPE not reported)')
  })
})

/**
 * PER-SET EFFORT IN THE EXPORT.
 *
 * `ExportSet` had no `rpe` field and the query never selected the column, so
 * per-set effort could not reach the report at all. The rating now rides on the
 * REP — `60kg × 12@8.5, 11@9` — which keeps the load grouping that makes the
 * line readable while still reporting a rating that changed between sets.
 *
 * A missing rating is STATED, never implied: an omitted rating and a set that
 * felt easy are different facts. The marker sits at the coarsest unambiguous
 * level, because putting it on every group would train the reader to stop
 * seeing it.
 */
describe('setDetail — per-set RPE', () => {
  it('hangs the rating off the rep, keeping the load grouping intact', () => {
    expect(setDetail([s(60, 12, { rpe: 8.5 }), s(60, 11, { rpe: 9 }), s(60, 10, { rpe: 10 })], 'Hack Squat'))
      .toBe('60kg × 12@8.5,11@9,10@10')
  })

  it('states it once for the exercise when nothing was rated', () => {
    expect(setDetail([s(60, 12), s(60, 11)], 'Hack Squat'))
      .toBe('60kg × 12,11 (RPE not reported)')
  })

  it('marks the UNRATED group when the exercise is partly rated', () => {
    expect(setDetail([s(60, 12, { rpe: 8.5 }), s(65, 10)], 'Hack Squat'))
      .toBe('60kg × 12@8.5 · 65kg × 10 (RPE not reported)')
  })

  it('never asks a warm-up for a rating', () => {
    // The warm-up is silent by design, so the note belongs to the working set.
    expect(setDetail([s(20, 12, { warmup: true }), s(60, 10, { rpe: 9 })], 'Hack Squat'))
      .toBe('20kg × 12 (Warmup) · 60kg × 10@9')
    // …and an all-warm-up line makes no claim about effort at all.
    expect(setDetail([s(20, 12, { warmup: true })], 'Hack Squat'))
      .toBe('20kg × 12 (Warmup)')
  })

  it('keeps the failure tag and the effort together, not competing', () => {
    expect(setDetail([s(60, 8, { rpe: 10, failure: true })], 'Hack Squat'))
      .toBe('60kg × 8@10 (Failure)')
  })

  it('rates unloaded work too — reps are the only axis it has', () => {
    expect(setDetail([s(0, 17, { rpe: 9 })], 'Reverse Crunch')).toBe('17@9 reps')
  })

  /** The rating is PER SIDE, like the failure tag — a weaker arm can genuinely
   *  rate harder at the same load. */
  it('carries a rating on each side of a unilateral pair', () => {
    expect(setDetail([
      s(20, 12, { side: 'L', pairId: 'p1', rpe: 8.5 }),
      s(20, 10, { side: 'R', pairId: 'p1', rpe: 10 }),
    ], 'Single Arm Row')).toBe('S1 L 20kg×12@8.5 · R 20kg×10@10')
  })

  it('marks an unrated pair once, not twice', () => {
    expect(setDetail([
      s(20, 12, { side: 'L', pairId: 'p1', rpe: 8.5 }),
      s(20, 10, { side: 'R', pairId: 'p1', rpe: 10 }),
      s(20, 10, { side: 'L', pairId: 'p2' }),
      s(20, 10, { side: 'R', pairId: 'p2' }),
    ], 'Single Arm Row'))
      .toBe('S1 L 20kg×12@8.5 · R 20kg×10@10 · S2 L 20kg×10 · R 20kg×10 (RPE not reported)')
  })
})
