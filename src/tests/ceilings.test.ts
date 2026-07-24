import { describe, it, expect } from 'vitest'
import {
  parseRepWindow, repWindowFor, clearedCeiling, progressionVerdict, LOAD_STEP_KG,
} from '@/lib/training/ceilings'

/**
 * The reported bug: the +2.5kg badge fired on Calf Press at 15/14/13 reps.
 * The ceiling was a hardcoded 12; Calf Press is programmed 10–15 (Legs A) and
 * 14–18 (Legs B). Ceilings now come from the program, and the badge follows the
 * program's own two-consecutive-sessions rule.
 */
describe('parseRepWindow', () => {
  it('parses en-dash and hyphen ranges', () => {
    expect(parseRepWindow('10–15')).toEqual({ floor: 10, ceiling: 15 })
    expect(parseRepWindow('8-12')).toEqual({ floor: 8, ceiling: 12 })
    expect(parseRepWindow('12–20')).toEqual({ floor: 12, ceiling: 20 })
  })
  it('treats a single number as a fixed target', () => {
    expect(parseRepWindow('10')).toEqual({ floor: 10, ceiling: 10 })
  })
  it('returns null for timed holds — reps are not the progression axis', () => {
    expect(parseRepWindow('55s')).toBeNull()
  })
  it('returns null for unparseable input', () => {
    expect(parseRepWindow('AMRAP')).toBeNull()
  })
})

describe('repWindowFor', () => {
  it('reads the window for the DAY actually logged', () => {
    expect(repWindowFor('Calf Press', 'legs_a', 'apex51')).toEqual({ floor: 10, ceiling: 15 })
    expect(repWindowFor('Calf Press', 'legs_b', 'apex51')).toEqual({ floor: 14, ceiling: 18 })
  })
  it('falls back to the STRICTEST window when the day is unknown', () => {
    // Ambiguity must under-trigger, never over-trigger, the badge.
    expect(repWindowFor('Calf Press', null, 'apex51')?.ceiling).toBe(18)
  })
  it('is null for an exercise not in the program', () => {
    expect(repWindowFor('Zercher Squat', 'legs_a', 'apex51')).toBeNull()
  })
  it('is null for a timed hold that IS in the program', () => {
    expect(repWindowFor('Side Plank', 'legs_b', 'apex51')).toBeNull()
  })
})

describe('clearedCeiling', () => {
  const ceiling = 15
  it('rejects the reported 15/14/13 case', () => {
    expect(clearedCeiling([
      { weightKg: 65, reps: 15 }, { weightKg: 65, reps: 14 }, { weightKg: 65, reps: 13 },
    ], ceiling)).toBe(false)
  })
  it('accepts every set at the ceiling on one load', () => {
    expect(clearedCeiling([
      { weightKg: 65, reps: 15 }, { weightKg: 65, reps: 16 }, { weightKg: 65, reps: 15 },
    ], ceiling)).toBe(true)
  })
  it('rejects a ceiling reached by dropping the load', () => {
    expect(clearedCeiling([
      { weightKg: 65, reps: 15 }, { weightKg: 55, reps: 15 },
    ], ceiling)).toBe(false)
  })
  it('rejects bodyweight-zero and empty sessions', () => {
    expect(clearedCeiling([{ weightKg: 0, reps: 20 }], ceiling)).toBe(false)
    expect(clearedCeiling([], ceiling)).toBe(false)
  })
})

describe('progressionVerdict', () => {
  const clean = [{ weightKg: 65, reps: 15 }, { weightKg: 65, reps: 15 }]
  const dirty = [{ weightKg: 65, reps: 15 }, { weightKg: 65, reps: 13 }]

  it('needs TWO consecutive clean sessions', () => {
    expect(progressionVerdict([clean, clean], 15)).toEqual({
      state: 'ready', ceiling: 15, suggestKg: 65 + LOAD_STEP_KG,
    })
  })
  it('one clean session says "one more"', () => {
    expect(progressionVerdict([dirty, clean], 15).state).toBe('one-more')
    expect(progressionVerdict([clean], 15).state).toBe('one-more')
  })
  it('the reported case stays silent', () => {
    const reported = [{ weightKg: 65, reps: 15 }, { weightKg: 65, reps: 14 }, { weightKg: 65, reps: 13 }]
    expect(progressionVerdict([reported, reported], 15).state).toBe('no')
  })
  it('an unprogrammed exercise never prompts', () => {
    expect(progressionVerdict([clean, clean], null).state).toBe('no')
  })
})
