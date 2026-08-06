import { describe, it, expect } from 'vitest'
import {
  PROGRAM_TARGETS, toLandmarkMuscle, volumeZone, weeklyVolumeByMuscle,
  weeklyTonnageByMuscle, landmarkFor, bandZone,
} from '@/lib/training/landmarks'

describe('PROGRAM_TARGETS — user-supplied per-program targets', () => {
  it('cut targets match the spec', () => {
    expect(PROGRAM_TARGETS.cut.Chest).toBe(11)
    expect(PROGRAM_TARGETS.cut['Rear delts']).toBe(2)
    expect(PROGRAM_TARGETS.cut.Adductors).toBe(0)
    expect(PROGRAM_TARGETS.cut['Abs/core']).toBe(10)
  })
  it('bulk targets match the spec', () => {
    expect(PROGRAM_TARGETS.bulk.Back).toBe(14)
    expect(PROGRAM_TARGETS.bulk.Adductors).toBe(2)
    expect(PROGRAM_TARGETS.bulk['Side delts']).toBe(9)
  })
})

describe('toLandmarkMuscle', () => {
  it('folds back tokens into Back', () => {
    for (const t of ['lats', 'upper back', 'traps', 'lower back']) expect(toLandmarkMuscle(t)).toBe('Back')
  })
  it('maps legacy generic shoulders to Side delts, and rear_delts to Rear delts', () => {
    expect(toLandmarkMuscle('shoulders')).toBe('Side delts')
    expect(toLandmarkMuscle('rear_delts')).toBe('Rear delts')
  })
  it('drops untracked tokens (front delts, abductors)', () => {
    expect(toLandmarkMuscle('front_delts')).toBeNull()
    expect(toLandmarkMuscle('abductors')).toBeNull()
  })
})

describe('volumeZone', () => {
  it('a zero-target muscle is n/a (never flagged under)', () => {
    expect(volumeZone(0, 0)).toBe('na')
  })
  it('grades relative to the target', () => {
    expect(volumeZone(2, 10)).toBe('under')     // 0.2
    expect(volumeZone(7, 10)).toBe('building')  // 0.7
    expect(volumeZone(11, 10)).toBe('optimal')  // 1.1
    expect(volumeZone(20, 10)).toBe('over')     // 2.0
  })
})

describe('weeklyVolumeByMuscle', () => {
  it('counts a unilateral L/R pair as ONE set, and multi-muscle rows hit each muscle', () => {
    const rows = [
      { muscleTokens: ['quadriceps', 'glutes'], dedupeKey: 's1' },       // 1 set → Quads + Glutes
      { muscleTokens: ['quadriceps'], dedupeKey: 'pairA' },              // L
      { muscleTokens: ['quadriceps'], dedupeKey: 'pairA' },              // R (same pair → 1 set)
    ]
    const out = weeklyVolumeByMuscle(rows, 'cut')
    const quads = out.find((m) => m.muscle === 'Quads')!
    const glutes = out.find((m) => m.muscle === 'Glutes')!
    expect(quads.sets).toBe(2)   // the multi-muscle row + one deduped pair
    expect(glutes.sets).toBe(1)
    expect(quads.target).toBe(PROGRAM_TARGETS.cut.Quads)
  })

  it('returns every tracked muscle even with no data', () => {
    const out = weeklyVolumeByMuscle([], 'bulk')
    expect(out).toHaveLength(13)
    expect(out.every((m) => m.sets === 0)).toBe(true)
  })
})

describe('legacy 6-group bands (Muscle Focus card)', () => {
  it('landmarkFor returns MEV/MAV/MRV for the broad groups', () => {
    expect(landmarkFor('Legs')).toEqual({ mev: 12, mav: 20, mrv: 32 })
    expect(landmarkFor('Nonsense')).toBeNull()
  })
  it('bandZone grades against the band', () => {
    expect(bandZone(5, { mev: 10, mav: 16, mrv: 22 })).toBe('under')
    expect(bandZone(14, { mev: 10, mav: 16, mrv: 22 })).toBe('building')
    expect(bandZone(20, { mev: 10, mav: 16, mrv: 22 })).toBe('optimal')
    expect(bandZone(30, { mev: 10, mav: 16, mrv: 22 })).toBe('over')
  })
})

/**
 * Weekly TONNAGE per muscle — the kilogram companion to the set counts above.
 * Rows arrive pre-collapsed (see `weeklyTonnageByMuscle`), so what is under test
 * here is attribution and ordering, not the unilateral rule.
 */
describe('weeklyTonnageByMuscle', () => {
  it('sums tonnage per landmark muscle, heaviest first', () => {
    const out = weeklyTonnageByMuscle([
      { muscleTokens: ['chest'], volumeKg: 1000 },
      { muscleTokens: ['quads'], volumeKg: 4000 },
      { muscleTokens: ['chest'], volumeKg: 500 },
    ])
    expect(out.map((t) => [t.muscle, t.volumeKg])).toEqual([['Quads', 4000], ['Chest', 1500]])
  })

  it('credits a compound to EVERY muscle it trains, in full', () => {
    // The same rule the set counts use, so the two breakdowns cannot disagree
    // about one movement. The column over-sums by design; the export says so.
    const out = weeklyTonnageByMuscle([{ muscleTokens: ['quads', 'glutes'], volumeKg: 900 }])
    expect(out).toHaveLength(2)
    expect(out.every((t) => t.volumeKg === 900)).toBe(true)
  })

  it('counts a repeated muscle token once per row', () => {
    const out = weeklyTonnageByMuscle([{ muscleTokens: ['quads', 'quadriceps'], volumeKg: 900 }])
    expect(out).toEqual([expect.objectContaining({ muscle: 'Quads', volumeKg: 900 })])
  })

  it('omits muscles with no work rather than printing a zero row', () => {
    const out = weeklyTonnageByMuscle([{ muscleTokens: ['chest'], volumeKg: 100 }])
    expect(out.map((t) => t.muscle)).toEqual(['Chest'])
  })

  it('ignores rows with no recognised muscle, and zero-tonnage rows', () => {
    expect(weeklyTonnageByMuscle([{ muscleTokens: ['not_a_muscle'], volumeKg: 500 }])).toEqual([])
    expect(weeklyTonnageByMuscle([{ muscleTokens: ['chest'], volumeKg: 0 }])).toEqual([])
  })

  it('keeps quarter-kilogram microloads and kills float drift', () => {
    const out = weeklyTonnageByMuscle([
      { muscleTokens: ['chest'], volumeKg: 101.25 },
      { muscleTokens: ['chest'], volumeKg: 0.1 },
      { muscleTokens: ['chest'], volumeKg: 0.2 },
    ])
    expect(out[0].volumeKg).toBe(101.55)
  })
})
