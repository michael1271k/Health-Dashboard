import { describe, it, expect } from 'vitest'
import { niceDomain, compactKg } from '@/lib/charts/scale'
import { programWeekNumber, weekNumberOf } from '@/lib/reports/weekNumber'
import { weekStartOf } from '@/lib/utils/week'

describe('niceDomain', () => {
  it('fits the DATA, not zero — the flat-volume-chart bug', () => {
    // Real shape of a training block: ~8.4t to ~9.1t. Zero-based, the whole
    // series is a 7% band at the top of the chart.
    const [lo, hi] = niceDomain([8400, 8900, 8600, 9100, 8750])
    expect(lo).toBeGreaterThan(7000)
    expect(hi).toBeLessThan(10_000)
    expect(lo).toBeLessThanOrEqual(8400)
    expect(hi).toBeGreaterThanOrEqual(9100)
  })

  it('includes zero only when asked', () => {
    expect(niceDomain([8400, 9100], { zeroBased: true })[0]).toBe(0)
  })

  it('gives a flat series breathing room instead of a zero-height axis', () => {
    const [lo, hi] = niceDomain([70, 70, 70])
    expect(hi).toBeGreaterThan(lo)
    expect(lo).toBeLessThan(70)
    expect(hi).toBeGreaterThan(70)
  })

  it('survives an empty or all-null series', () => {
    expect(niceDomain([])).toEqual([0, 1])
    expect(niceDomain([null, undefined])).toEqual([0, 1])
  })

  it('ignores nulls among real values', () => {
    const [lo, hi] = niceDomain([null, 50, undefined, 60])
    expect(lo).toBeLessThanOrEqual(50)
    expect(hi).toBeGreaterThanOrEqual(60)
  })

  it('respects hardMin so a count axis never goes negative', () => {
    expect(niceDomain([1, 2, 3], { hardMin: 0 })[0]).toBe(0)
  })

  it('snaps to round steps', () => {
    const [lo, hi] = niceDomain([103, 197])
    expect(Number.isInteger(lo)).toBe(true)
    expect(Number.isInteger(hi)).toBe(true)
  })
})

describe('compactKg', () => {
  it('keeps a decimal below 10 t so near weeks stay distinguishable', () => {
    // The old formatter rendered both of these as "8k" / "9k".
    expect(compactKg(8400)).toBe('8.4k')
    expect(compactKg(9100)).toBe('9.1k')
  })

  it('drops the decimal once it stops adding information', () => {
    expect(compactKg(12_000)).toBe('12k')
  })

  it('leaves sub-tonne values alone', () => {
    expect(compactKg(750)).toBe('750')
  })
})

describe('current-week timeframe', () => {
  it('numbers the PROGRAM week, not the calendar week', () => {
    // The header used to read "Week 31" — the ISO calendar week, a true fact
    // about the year and a useless one about training.
    expect(programWeekNumber('2026-07-31')).toBe(2)
    expect(programWeekNumber('2026-08-02')).toBe(3)
  })

  it('agrees with the Progress timeline EXACTLY, week 0 included', () => {
    // The bug: a second 1-based counter read Wk 4 on 2026-08-03 while Momentum's
    // capsule for the same week read "Week 3". Both are now one function, so the
    // two can no longer drift — this asserts the identity, not two constants.
    for (const d of ['2026-07-15', '2026-07-19', '2026-07-26', '2026-08-01', '2026-08-03']) {
      expect(programWeekNumber(d)).toBe(weekNumberOf(weekStartOf(d)))
    }
  })

  it('calls the opening half week Week 0, because it IS a half week', () => {
    // Training began Wed 2026-07-15. Four days is not a week and is not counted
    // as one; the 1-based counter called it Week 1 and ran one ahead forever.
    expect(programWeekNumber('2026-07-15')).toBe(0)
    expect(programWeekNumber('2026-07-18')).toBe(0)
    // First FULL week.
    expect(programWeekNumber('2026-07-19')).toBe(1)
  })

  it('rolls over exactly at the week boundary and nowhere else', () => {
    // 2026-08-01 is a Saturday, 08-02 the Sunday that opens the next week.
    expect(programWeekNumber('2026-07-27')).toBe(2)
    expect(programWeekNumber('2026-08-01')).toBe(2)
    expect(programWeekNumber('2026-08-02')).toBe(3)
  })

  it('yields a number, never NaN, on a malformed date', () => {
    // `weekStartOf` echoes input it cannot parse, so the bad value reaches the
    // arithmetic intact; "Week NaN" in a badge is worse than a wrong week.
    expect(Number.isFinite(programWeekNumber('not-a-date'))).toBe(true)
  })

  // `currentWeekDays` went with the plan-week chart toggle: every chart now has
  // exactly two windows (1 Month / era), and a week-scoped range implied that a
  // trend line over 3 days meant something. Week-scoped FACTS still exist — they
  // live in WeekToDateTargets, which sits above the timeframe control precisely
  // because it does not honour one.
})

describe('the session report curve is not a flat line', () => {
  /**
   * The failure this guards, stated as numbers: three sessions of one routine
   * at 3 000 / 3 010 / 3 020 kg. Against the old hardcoded [0, max] domain the
   * whole 20 kg of progression occupies 20/3020 of the plot — on a 38px-tall
   * lane, about a quarter of a pixel. The progression was real and the axis
   * was hiding it.
   */
  it('zooms a 20kg move on 3 tonnes into a readable share of the plot', () => {
    const [lo, hi] = niceDomain([3000, 3010, 3020], { padPct: 0.12, hardMin: 0 })
    const span = hi - lo
    expect(lo, 'the axis is still pinned to zero').toBeGreaterThan(0)
    // The data's own range has to be a meaningful fraction of the axis. A tenth
    // is generous — it is ~0.7% under the zero-based domain.
    expect(20 / span).toBeGreaterThan(0.1)
    // And the bounds still have to be numbers a human reads as round.
    expect(Number.isInteger(lo)).toBe(true)
    expect(Number.isInteger(hi)).toBe(true)
  })

  it('never crops a point out of view', () => {
    const values = [3000, 3010, 3020]
    const [lo, hi] = niceDomain(values, { padPct: 0.12, hardMin: 0 })
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(lo)
      expect(v).toBeLessThanOrEqual(hi)
    }
  })

  it('survives a routine performed exactly once', () => {
    // One point is a flat series; a zero-height domain divides by zero in the
    // curve's y().
    const [lo, hi] = niceDomain([3000], { padPct: 0.12, hardMin: 0 })
    expect(hi).toBeGreaterThan(lo)
  })
})
