import { describe, it, expect } from 'vitest'
import { sessionVolumeKg } from '@/lib/sessions/volume'

/**
 * The asymmetry rule: a unilateral L/R pair is scored at the WEAKER side,
 * counted twice — otherwise the strong side's extra reps inflate the session
 * total and the week-over-week volume trend drifts up without the work.
 */
describe('sessionVolumeKg', () => {
  it('sums bilateral sets as weight × reps', () => {
    expect(sessionVolumeKg([
      { weightKg: 60, reps: 12 },
      { weightKg: 60, reps: 11 },
      { weightKg: 57.5, reps: 10 },
    ])).toBe(60 * 12 + 60 * 11 + 57.5 * 10)
  })

  it('scores an asymmetric L/R pair at the LOWER rep count, both sides', () => {
    // The brief's example: L 5kg × 10, R 5kg × 14 → 100 kg, not 120 kg.
    expect(sessionVolumeKg([
      { weightKg: 5, reps: 10, side: 'L', pairId: 'p1' },
      { weightKg: 5, reps: 14, side: 'R', pairId: 'p1' },
    ])).toBe(100)
  })

  it('also takes the lower WEIGHT when the sides used different loads', () => {
    expect(sessionVolumeKg([
      { weightKg: 7.5, reps: 12, side: 'L', pairId: 'p1' },
      { weightKg: 10, reps: 12, side: 'R', pairId: 'p1' },
    ])).toBe(2 * 7.5 * 12)
  })

  it('leaves a symmetric pair untouched', () => {
    expect(sessionVolumeKg([
      { weightKg: 7.5, reps: 15, side: 'L', pairId: 'p1' },
      { weightKg: 7.5, reps: 15, side: 'R', pairId: 'p1' },
    ])).toBe(2 * 7.5 * 15)
  })

  it('scores a lone logged side on its own (not a pair)', () => {
    expect(sessionVolumeKg([
      { weightKg: 20, reps: 10, side: 'L', pairId: 'p1' },
    ])).toBe(200)
  })

  it('keeps pairs independent and mixes them with bilateral work', () => {
    expect(sessionVolumeKg([
      { weightKg: 60, reps: 10 },
      { weightKg: 5, reps: 10, side: 'L', pairId: 'p1' },
      { weightKg: 5, reps: 14, side: 'R', pairId: 'p1' },
      { weightKg: 5, reps: 12, side: 'L', pairId: 'p2' },
      { weightKg: 5, reps: 12, side: 'R', pairId: 'p2' },
    ])).toBe(600 + 100 + 120)
  })

  // A quarter-kg plate can only ever land on a quarter, so 2 dp is exact rather
  // than generous. 1 dp used to report this set as 200.3 — a tenth of a kg the
  // lifter never moved, and the reason the export and the Session Report
  // disagreed about the same session's tonnage.
  it('keeps quarter-kg microload volumes exact, not rounded to a tenth', () => {
    expect(sessionVolumeKg([{ weightKg: 22.25, reps: 9 }])).toBe(200.25)
  })

  it('still snaps float representation error away', () => {
    // 0.1 × 3 is 0.30000000000000004 in binary floating point.
    expect(sessionVolumeKg([{ weightKg: 0.1, reps: 3 }])).toBe(0.3)
  })

  it('treats a pairId with no side as an ordinary set', () => {
    expect(sessionVolumeKg([
      { weightKg: 40, reps: 8, pairId: 'p1' },
      { weightKg: 40, reps: 6, pairId: 'p1' },
    ])).toBe(320 + 240)
  })

  it('is 0 for no sets', () => {
    expect(sessionVolumeKg([])).toBe(0)
  })
})
