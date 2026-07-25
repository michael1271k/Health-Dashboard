import { describe, it, expect } from 'vitest'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
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
  it('side delts count only lateral raises; face pulls land on rear delts; press adds nothing', () => {
    // One working set of each of a week's APEX shoulder movements, resolved
    // through lookupMuscles primaries exactly as useWeeklyVolume does.
    const names = [
      'Cable Lateral Raise', 'Single Arm Lateral Raise (Cable)', // → side delts (2)
      'Face Pull',                                               // → rear delts (1)
      'DB Shoulder Press',                                       // → front delts → untracked
    ]
    const rows = names.map((n, i) => ({
      muscleTokens: lookupMuscles(n)?.primary ?? [], dedupeKey: `s${i}`,
    }))
    const out = weeklyVolumeByMuscle(rows, 'cut')
    expect(out.find((m) => m.muscle === 'Side delts')!.sets).toBe(2)
    expect(out.find((m) => m.muscle === 'Rear delts')!.sets).toBe(1)
  })
})
