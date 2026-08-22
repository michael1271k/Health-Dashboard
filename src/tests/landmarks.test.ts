import { describe, it, expect } from 'vitest'
import {
  PROGRAM_TARGETS, toLandmarkMuscle, volumeZone, weeklyVolumeByMuscle,
  weeklyTonnageByMuscle, landmarkFor, bandZone, LANDMARK_MUSCLES,
} from '@/lib/training/landmarks'

describe('PROGRAM_TARGETS — user-supplied per-program targets', () => {
  it('cut targets match the spec', () => {
    expect(PROGRAM_TARGETS.cut.Chest).toBe(11)
    expect(PROGRAM_TARGETS.cut['Rear delts']).toBe(2)
    expect(PROGRAM_TARGETS.cut.Adductors).toBe(0)
    expect(PROGRAM_TARGETS.cut['Abs/core']).toBe(10)
  })
  it('bulk targets match the spec', () => {
    // The three back numbers replaced a single `Back: 14` and still sum to it.
    expect(PROGRAM_TARGETS.bulk.Lats + PROGRAM_TARGETS.bulk['Upper back']
      + PROGRAM_TARGETS.bulk['Lower back']).toBe(14)
    expect(PROGRAM_TARGETS.bulk.Lats).toBe(8)
    expect(PROGRAM_TARGETS.bulk.Adductors).toBe(2)
    expect(PROGRAM_TARGETS.bulk['Side delts']).toBe(9)
  })
})

describe('toLandmarkMuscle', () => {
  it('separates the three back muscles rather than folding them together', () => {
    // They were ONE landmark, which meant a pulldown and a rack pull scored
    // against the same weekly number and no back session could read as
    // unbalanced. A bare "back" is a pulldown or a row in this catalog, so it
    // is lat work, not a fourth bucket.
    expect(toLandmarkMuscle('lats')).toBe('Lats')
    expect(toLandmarkMuscle('back')).toBe('Lats')
    expect(toLandmarkMuscle('upper back')).toBe('Upper back')
    expect(toLandmarkMuscle('traps')).toBe('Upper back')
    expect(toLandmarkMuscle('rhomboids')).toBe('Upper back')
    expect(toLandmarkMuscle('lower back')).toBe('Lower back')
    expect(toLandmarkMuscle('erectors')).toBe('Lower back')
  })
  it('maps legacy generic shoulders to Side delts, and rear_delts to Rear delts', () => {
    expect(toLandmarkMuscle('shoulders')).toBe('Side delts')
    expect(toLandmarkMuscle('rear_delts')).toBe('Rear delts')
  })
  it('routes the anterior deltoid to its own landmark', () => {
    // This used to return null on the theory that pressing "covers" the front
    // delt. Pressing does cover it — nine weighted sets in a real week — which
    // is exactly why discarding the credit made a trained muscle read as zero.
    expect(toLandmarkMuscle('front_delts')).toBe('Front delts')
    expect(toLandmarkMuscle('anterior_delts')).toBe('Front delts')
  })

  it('drops untracked tokens (abductors)', () => {
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
      { primary: ['quadriceps', 'glutes'], secondary: [], dedupeKey: 's1' },       // 1 set → Quads + Glutes
      { primary: ['quadriceps'], secondary: [], dedupeKey: 'pairA' },              // L
      { primary: ['quadriceps'], secondary: [], dedupeKey: 'pairA' },              // R (same pair → 1 set)
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
    expect(out).toHaveLength(LANDMARK_MUSCLES.length)
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
      { primary: ['chest'], secondary: [], volumeKg: 1000 },
      { primary: ['quads'], secondary: [], volumeKg: 4000 },
      { primary: ['chest'], secondary: [], volumeKg: 500 },
    ])
    expect(out.map((t) => [t.muscle, t.volumeKg])).toEqual([['Quads', 4000], ['Chest', 1500]])
  })

  it('credits a compound to EVERY muscle it trains, in full', () => {
    // The same rule the set counts use, so the two breakdowns cannot disagree
    // about one movement. The column over-sums by design; the export says so.
    const out = weeklyTonnageByMuscle([{ primary: ['quads', 'glutes'], secondary: [], volumeKg: 900 }])
    expect(out).toHaveLength(2)
    expect(out.every((t) => t.volumeKg === 900)).toBe(true)
  })

  it('counts a repeated muscle token once per row', () => {
    const out = weeklyTonnageByMuscle([{ primary: ['quads', 'quadriceps'], secondary: [], volumeKg: 900 }])
    expect(out).toEqual([expect.objectContaining({ muscle: 'Quads', volumeKg: 900 })])
  })

  it('omits muscles with no work rather than printing a zero row', () => {
    const out = weeklyTonnageByMuscle([{ primary: ['chest'], secondary: [], volumeKg: 100 }])
    expect(out.map((t) => t.muscle)).toEqual(['Chest'])
  })

  it('ignores rows with no recognised muscle, and zero-tonnage rows', () => {
    expect(weeklyTonnageByMuscle([{ primary: ['not_a_muscle'], secondary: [], volumeKg: 500 }])).toEqual([])
    expect(weeklyTonnageByMuscle([{ primary: ['chest'], secondary: [], volumeKg: 0 }])).toEqual([])
  })

  it('keeps quarter-kilogram microloads and kills float drift', () => {
    const out = weeklyTonnageByMuscle([
      { primary: ['chest'], secondary: [], volumeKg: 101.25 },
      { primary: ['chest'], secondary: [], volumeKg: 0.1 },
      { primary: ['chest'], secondary: [], volumeKg: 0.2 },
    ])
    expect(out[0].volumeKg).toBe(101.55)
  })
})

/**
 * Secondary movers. The system had two opposite bugs on this axis and this
 * block pins the resolution to both: crediting only the primary reported a week
 * of RDLs as zero glute work, crediting the secondary in full put Biceps at 22
 * against a target of 8.
 */
describe('secondary mover credit', () => {
  it('pays a secondary mover half a set and the primary a full one', () => {
    const out = weeklyVolumeByMuscle(
      [{ primary: ['hamstrings'], secondary: ['glutes'], dedupeKey: 's1' }],
      'cut',
    )
    const ham = out.find((m) => m.muscle === 'Hamstrings')!
    const glute = out.find((m) => m.muscle === 'Glutes')!
    expect(ham.sets).toBe(1)
    expect(ham.directSets).toBe(1)
    expect(glute.sets).toBe(0.5)
    expect(glute.directSets).toBe(0)
    expect(glute.indirectSets).toBe(0.5)
  })

  it('gives ONE full credit when a muscle is both primary and secondary', () => {
    // `lats` primary and `lats` secondary on one row is still 1.0, not 1.5.
    const out = weeklyVolumeByMuscle(
      [{ primary: ['lats'], secondary: ['lats', 'biceps'], dedupeKey: 's1' }],
      'cut',
    )
    expect(out.find((m) => m.muscle === 'Lats')!.sets).toBe(1)
    expect(out.find((m) => m.muscle === 'Biceps')!.sets).toBe(0.5)
  })

  it('scores a pulldown\'s lats and upper back apart, not as one Back', () => {
    // They used to fold into a single landmark, so a session of nothing but
    // pulldowns graded a whole back as trained. The lats take the full set, the
    // upper back takes the assisting half.
    const out = weeklyVolumeByMuscle(
      [{ primary: ['lats'], secondary: ['upper back', 'biceps'], dedupeKey: 's1' }],
      'cut',
    )
    expect(out.find((m) => m.muscle === 'Lats')!.sets).toBe(1)
    expect(out.find((m) => m.muscle === 'Upper back')!.sets).toBe(0.5)
  })

  it('still collapses a unilateral L/R pair to one credited set', () => {
    const rows = [
      { primary: ['chest'], secondary: ['triceps'], dedupeKey: 'pair-1' },
      { primary: ['chest'], secondary: ['triceps'], dedupeKey: 'pair-1' },
    ]
    const out = weeklyVolumeByMuscle(rows, 'cut')
    expect(out.find((m) => m.muscle === 'Chest')!.sets).toBe(1)
    expect(out.find((m) => m.muscle === 'Triceps')!.sets).toBe(0.5)
  })

  it('lifts a muscle out of UNDER on assistance, but never into OVER', () => {
    // Hamstrings: 3 direct + 5 assisted sets against a target of 8. Direct alone
    // reads UNDER (0.375); the total is 5.5 (0.69) → building. It can climb no
    // further than "on target" on assistance no matter how much arrives.
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => ({ primary: ['hamstrings'], secondary: [], dedupeKey: `d${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ primary: ['glutes'], secondary: ['hamstrings'], dedupeKey: `a${i}` })),
    ]
    const ham = weeklyVolumeByMuscle(rows, 'cut').find((m) => m.muscle === 'Hamstrings')!
    expect(ham.directSets).toBe(3)
    expect(ham.indirectSets).toBe(2.5)
    expect(ham.zone).toBe('building')
  })

  it('does not flag OVER on assistance alone — only direct work can', () => {
    // Triceps target 6 on a cut. 7 direct + 14 assisted = 14 weighted sets.
    // Grading the total would say OVER ("cut arm volume") because someone
    // pressed; the direct work is 7, which is on target.
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => ({ primary: ['triceps'], secondary: [], dedupeKey: `d${i}` })),
      ...Array.from({ length: 14 }, (_, i) => ({ primary: ['chest'], secondary: ['triceps'], dedupeKey: `a${i}` })),
    ]
    const tri = weeklyVolumeByMuscle(rows, 'cut').find((m) => m.muscle === 'Triceps')!
    expect(tri.sets).toBe(14)
    expect(tri.directSets).toBe(7)
    expect(tri.zone).toBe('optimal')
  })

  it('still flags OVER when the DIRECT work overshoots', () => {
    // Rear delts target 2 on a cut; 3 direct face-pull sets is a genuine over.
    const rows = Array.from({ length: 3 }, (_, i) => ({
      primary: ['rear_delts'], secondary: [], dedupeKey: `d${i}`,
    }))
    expect(weeklyVolumeByMuscle(rows, 'cut').find((m) => m.muscle === 'Rear delts')!.zone).toBe('over')
  })

  it('halves a secondary mover’s TONNAGE the same way it halves its sets', () => {
    const out = weeklyTonnageByMuscle([
      { primary: ['hamstrings'], secondary: ['glutes'], volumeKg: 900 },
    ])
    expect(out.find((t) => t.muscle === 'Hamstrings')).toMatchObject({ volumeKg: 900, directKg: 900 })
    expect(out.find((t) => t.muscle === 'Glutes')).toMatchObject({ volumeKg: 450, directKg: 0 })
  })

  it('never pays tonnage twice to a muscle named by both lists', () => {
    const out = weeklyTonnageByMuscle([
      { primary: ['lats'], secondary: ['lats'], volumeKg: 500 },
    ])
    expect(out).toEqual([expect.objectContaining({ muscle: 'Lats', volumeKg: 500, directKg: 500 })])
  })

  it('credits the hip-adduction machine to Adductors — it used to credit nothing', () => {
    // `inner_thigh` resolved to null, so the Adductors target could never be met.
    const out = weeklyVolumeByMuscle(
      [{ primary: ['inner_thigh'], secondary: [], dedupeKey: 's1' }],
      'bulk',
    )
    expect(out.find((m) => m.muscle === 'Adductors')!.sets).toBe(1)
  })
})
