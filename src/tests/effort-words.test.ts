import { describe, it, expect } from 'vitest'
import {
  EFFORT_WORDS, EFFORT_COLD_BASELINE, effortCr10, effortWordFor, suggestEffortWord,
} from '@/lib/training/effort'
import { deriveSessionRpe } from '@/lib/training/rpeMemory'

/**
 * THE SUGGESTION WAS HARSH, AND THE DATA SAYS BY HOW MUCH.
 *
 * Across every set logged since 2026-07-15 the mean per-set rating is 8.86 —
 * 138 of 172 sets sit at 8.5–9.5, which is simply what a hypertrophy block
 * looks like on a reps-in-reserve ladder. Across the 19 sessions rated by hand
 * the mean is 7.16 and the maximum is 8.
 *
 * So the old volume-weighted mean proposed ~8.9 against an answer of ~7.2,
 * every session — and `battery.ts` reads the result as `sessionRpe / 10`, so a
 * 9.5 suggestion is a 19% larger drain than the truth.
 *
 * The fix is to read the mean RELATIVE to what that day type usually costs,
 * which is what these pin.
 */

describe('the ladder', () => {
  it('is five words, ascending, spanning the scale', () => {
    expect(EFFORT_WORDS).toHaveLength(5)
    const values = EFFORT_WORDS.map((w) => w.cr10)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
    expect(values[0]).toBeGreaterThanOrEqual(1)
    expect(values[values.length - 1]).toBe(10)
  })

  it('maps a word to the number that gets stored', () => {
    expect(effortCr10('hard')).toBe(8)
    expect(effortCr10('easy')).toBe(5)
    expect(effortCr10('nonsense')).toBeNull()
    expect(effortCr10(null)).toBeNull()
  })

  it('reads the 19 historical rows back as words', () => {
    // 6, 7 and 8 are every value ever stored. They must not read as null, or
    // an old session would lose its rating the moment the control changed.
    // 7 is nearer 6.5 than 8, so it reads Solid. Nearest rung is the only
    // defensible reading of a number recorded on a different control.
    expect(effortWordFor(6)?.label).toBe('Solid')
    expect(effortWordFor(7)?.label).toBe('Solid')
    expect(effortWordFor(8)?.label).toBe('Hard')
    expect(effortWordFor(null)).toBeNull()
  })
})

describe('the suggestion, against the real distribution', () => {
  /** A typical session for this athlete: sets rated 8.5–9.5. */
  const typical = [
    { weightKg: 40, reps: 10, rpe: 8.5 },
    { weightKg: 40, reps: 10, rpe: 9 },
    { weightKg: 50, reps: 8, rpe: 9 },
    { weightKg: 50, reps: 8, rpe: 9.5 },
  ]

  it('calls an ordinary session Hard, not Brutal — the regression that matters', () => {
    const mean = deriveSessionRpe(typical)!
    expect(mean).toBeGreaterThan(8.5)            // the old suggestion's number
    // Against a baseline of the same shape, that is simply a normal session.
    expect(suggestEffortWord(mean, [8.8, 8.9, 8.8, 9])!.label).toBe('Hard')
  })

  it('lands on Hard with NO history at all', () => {
    // The cold-start baseline is this athlete's own trailing mean, so a first
    // session of a new split is not graded against an absolute ladder.
    expect(suggestEffortWord(EFFORT_COLD_BASELINE, [])!.label).toBe('Hard')
    expect(suggestEffortWord(deriveSessionRpe(typical), [])!.label).toBe('Hard')
  })

  it('never proposes above Hard for a session that matches its own baseline', () => {
    for (const b of [7, 8, 8.5, 8.8, 9, 9.5]) {
      expect(suggestEffortWord(b, [b, b, b])!.cr10).toBeLessThanOrEqual(8)
    }
  })

  it('still has room to say a session was worse than usual', () => {
    // The point of going relative is not to flatten everything to "Hard".
    expect(suggestEffortWord(9, [8.5, 8.5, 8.5])!.label).toBe('Brutal')       // +0.5
    expect(suggestEffortWord(9.6, [8.5, 8.5, 8.5])!.label).toBe('Everything')  // +1.1
    expect(suggestEffortWord(8.3, [8.8, 8.8, 8.8])!.label).toBe('Solid')       // −0.5
    expect(suggestEffortWord(7.8, [8.8, 8.8, 8.8])!.label).toBe('Easy')        // −1.0
  })

  it('uses a median, so one savage session cannot move the bar', () => {
    // A mean baseline would be dragged up by the outlier and then judge the
    // next ordinary session as easy.
    expect(suggestEffortWord(8.8, [8.8, 8.8, 8.8, 10])!.label).toBe('Hard')
  })

  it('ignores a history too short to be a baseline', () => {
    // Two sessions is a coin toss with a decimal point; fall back to cold.
    expect(suggestEffortWord(8.8, [5, 5])!.label).toBe('Hard')
  })

  it('stays null when nothing was rated, so the battery default can do its job', () => {
    expect(suggestEffortWord(null, [8.8, 8.8, 8.8])).toBeNull()
    expect(suggestEffortWord(deriveSessionRpe([{ weightKg: 40, reps: 10 }]), [])).toBeNull()
  })
})
