import { describe, it, expect } from 'vitest'
import { lookupMuscles, resolveMovers } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle } from '@/lib/training/landmarks'

/**
 * The Muscle-Focus overcount: Side Delts read 11 on a cut whose target is 7.
 * Root cause — every `shoulders` primary folded into Side delts, so overhead
 * PRESS (front delt) and FACE PULLS (rear delt) inflated the side-delt count.
 * Reverse curls (a forearm move) were likewise mis-credited to biceps. The fix
 * routes each to its real primary at the dictionary source.
 */
describe('deltoid + forearm primaries', () => {
  const primary = (name: string) => lookupMuscles(name)?.primary ?? []

  it('lateral raises are the only true SIDE-DELT primary', () => {
    expect(primary('Cable Lateral Raise')).toEqual(['side_delts'])
    expect(primary('Single Arm Lateral Raise (Cable)')).toEqual(['side_delts'])
  })
  it('face pull is a REAR-DELT movement, not side delt', () => {
    expect(primary('Face Pull')).toEqual(['rear_delts'])
  })
  it('overhead press is a FRONT-DELT movement (an untracked isolation target)', () => {
    expect(primary('DB Shoulder Press')).toEqual(['front_delts'])
  })
  it('reverse (pronated) curl is a FOREARM movement, not biceps', () => {
    expect(primary('Reverse EZ-Bar Curl')).toEqual(['forearms'])
  })
})

describe('weekly deltoid distribution after the fix', () => {
  // One working set of each of a week's APEX shoulder movements, resolved
  // through resolveMovers exactly as useWeeklyVolume does.
  const names = [
    'Cable Lateral Raise', 'Single Arm Lateral Raise (Cable)', // side delts, DIRECT
    'Face Pull',                                               // rear delts, DIRECT
    'DB Shoulder Press',                                       // front delts (untracked)
  ]
  const out = weeklyVolumeByMuscle(
    names.map((n, i) => ({ ...resolveMovers(n), dedupeKey: `s${i}` })),
    'cut',
  )
  const of = (m: string) => out.find((x) => x.muscle === m)!

  it('lateral raises are the only DIRECT side-delt work', () => {
    expect(of('Side delts').directSets).toBe(2)
  })
  it('an overhead press pays the side delts a HALF set, not a full one and not zero', () => {
    // The press is a front-delt movement, and front delts are not a tracked
    // target — but the medial head genuinely assists, so the set is neither the
    // full credit that inflated Side delts to 11/7 nor the zero that replaced it.
    expect(of('Side delts').indirectSets).toBe(0.5)
    expect(of('Side delts').sets).toBe(2.5)
    expect(of('Triceps').sets).toBe(0.5)
  })
  it('face pull lands on rear delts direct, and pays the back indirectly', () => {
    expect(of('Rear delts').sets).toBe(1)
    expect(of('Rear delts').directSets).toBe(1)
    expect(of('Back').sets).toBe(0.5)
  })
})

/**
 * The catalogue audit. Every one of these was verified against the live
 * `exercises` table; the DB column has since been re-seeded from this dictionary
 * by `scripts/reseed-muscle-groups.mts`.
 */
describe('secondary movers across the catalogue', () => {
  const movers = (name: string) => resolveMovers(name)

  it('an RDL trains the glutes, not only the hamstrings', () => {
    expect(movers('DB RDL').primary).toEqual(['hamstrings'])
    expect(movers('DB RDL').secondary).toContain('glutes')
    expect(movers('Romanian Deadlift (DB)').secondary).toContain('glutes')
  })

  it('a hammer curl trains the forearms', () => {
    expect(movers('DB Hammer Curl').secondary).toContain('forearms')
  })

  it('leg press and hack squat train the glutes', () => {
    expect(movers('Leg Press').secondary).toContain('glutes')
    expect(movers('Hack Squat').secondary).toContain('glutes')
  })

  it('presses train the triceps and the front delts', () => {
    for (const n of ['Chest Press (Machine)', 'Incline DB Press']) {
      expect(movers(n).primary).toEqual(['chest'])
      expect(movers(n).secondary).toEqual(expect.arrayContaining(['triceps', 'front_delts']))
    }
  })

  it('pulls train the biceps, and rows also the rear delts', () => {
    expect(movers('Lat Pulldown').secondary).toContain('biceps')
    expect(movers('Seated Cable Row (Wide Grip)').secondary)
      .toEqual(expect.arrayContaining(['biceps', 'rear_delts']))
  })

  it('a FLY is not a triceps movement — the elbow never extends under load', () => {
    // Both this file and the DB column tagged pec deck `triceps`, which credited
    // an isolation movement to a muscle doing no work in it.
    expect(movers('Pec Deck').secondary).not.toContain('triceps')
    expect(movers('Single-Arm Cable Fly').secondary).not.toContain('triceps')
    // A straight-arm pulldown DOES pay the triceps: the long head crosses the
    // shoulder, which is the joint that moves.
    expect(movers('Straight-Arm Pulldown').secondary).toContain('triceps')
  })

  it('hip adduction resolves to Adductors under both of its names', () => {
    expect(movers('Hip Adduction').primary).toEqual(['adductors'])
    expect(movers('Hip Adduction (Machine)').primary).toEqual(['adductors'])
  })

  it('reads the words inside parentheses instead of deleting them', () => {
    // `(...)` used to be stripped WITH its contents, so `Shoulder Press (DB)`
    // matched no entry at all and fell back to a bare `shoulders` tag — the one
    // token that folds to SIDE delts.
    expect(movers('Shoulder Press (DB)')).toEqual(movers('DB Shoulder Press'))
    expect(movers('Shoulder Press (DB)').primary).toEqual(['front_delts'])
    expect(movers('Crunch (Machine)')).toEqual(movers('Crunch Machine'))
  })

  it('falls back to the stored column only for an unknown name', () => {
    expect(resolveMovers('Zercher Good Morning', ['hamstrings', 'glutes']))
      .toEqual({ primary: ['hamstrings'], secondary: ['glutes'] })
    // A known name IGNORES a stale column — that is the whole point of the fallback
    // being a fallback.
    expect(resolveMovers('Face Pull', ['shoulders', 'biceps']).primary).toEqual(['rear_delts'])
  })
})
