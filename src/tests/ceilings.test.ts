import { describe, it, expect } from 'vitest'
import {
  parseRepWindow, repWindowFor, clearedCeiling, ladderVerdict, loadLadder,
  progressionVerdict, LOAD_STEP_KG, holdTargetFor, timedProgressionVerdict,
  levelUpCue,
  topLoadCleared,
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
    // Calf Press runs 10–15 on both leg days in the current plan; the dayKey path
    // still resolves to that exact day's window.
    expect(repWindowFor('Calf Press', 'legs_a', 'apex51')).toEqual({ floor: 10, ceiling: 15 })
    expect(repWindowFor('Calf Press', 'legs_b', 'apex51')).toEqual({ floor: 10, ceiling: 15 })
  })
  it('falls back to the STRICTEST window when the day is unknown', () => {
    // Ambiguity must under-trigger, never over-trigger, the badge.
    expect(repWindowFor('Calf Press', null, 'apex51')?.ceiling).toBe(15)
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

/**
 * The load ladder. Superseded `ceilingHitOnDroppedWeight`, which only answered
 * "was this a false clear?" — it could not say WHICH load was blocking, and it
 * refused every mixed-load session including the ones that had legitimately
 * outgrown the lighter weight.
 */
describe('ladderVerdict — the binding rung is the lowest load', () => {
  const ceiling = 12

  it('is ORDER-INDEPENDENT: heavy-to-light and light-to-heavy agree', () => {
    const heavyFirst = [{ weightKg: 20, reps: 12 }, { weightKg: 18, reps: 10 }]
    const lightFirst = [{ weightKg: 18, reps: 10 }, { weightKg: 20, reps: 12 }]
    expect(ladderVerdict(heavyFirst, ceiling)).toEqual(ladderVerdict(lightFirst, ceiling))
  })

  it('BLOCKS while the lighter load is short, naming it and the reps still owed', () => {
    // Scenario A: 20kg × 12, then dropped to 18kg × 10.
    const v = ladderVerdict([{ weightKg: 20, reps: 12 }, { weightKg: 18, reps: 10 }], ceiling)
    expect(v.state).toBe('blocked')
    expect(v.bindingLoadKg).toBe(18)
    expect(v.topLoadKg).toBe(20)
    expect(v.repsOwed).toBe(2)
  })

  it('collapses upward once the binding load clears — the lower weight retires', () => {
    // Scenario B: started at 18kg and cleared it, then moved to 20kg.
    const v = ladderVerdict([{ weightKg: 18, reps: 12 }, { weightKg: 20, reps: 8 }], ceiling)
    expect(v.state).toBe('collapse-ready')
    expect(v.bindingLoadKg).toBe(18)
    expect(v.topLoadKg).toBe(20)
    expect(v.repsOwed).toBe(0)
  })

  it('never says "cleared" on a mixed-load session, however good the reps look', () => {
    // The premature-clear bug: ceiling reps at BOTH loads is still not one load.
    const v = ladderVerdict([{ weightKg: 20, reps: 12 }, { weightKg: 18, reps: 12 }], ceiling)
    expect(v.state).toBe('collapse-ready')
    expect(v.state).not.toBe('cleared')
  })

  it('clears only a single-load session where every set reached the ceiling', () => {
    expect(ladderVerdict([{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }], ceiling).state).toBe('cleared')
    expect(ladderVerdict([{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 11 }], ceiling).state).toBe('incomplete')
  })

  it('binds on the LOWEST rung of a three-load ladder', () => {
    const v = ladderVerdict([
      { weightKg: 22.5, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 18, reps: 9 },
    ], ceiling)
    expect(v.state).toBe('blocked')
    expect(v.bindingLoadKg).toBe(18)
    expect(v.topLoadKg).toBe(22.5)
    expect(v.repsOwed).toBe(3)
  })

  it('ignores bodyweight (0 kg) sets — they can never collapse a ladder', () => {
    const v = ladderVerdict([{ weightKg: 0, reps: 20 }], ceiling)
    expect(v.state).toBe('incomplete')
    expect(v.bindingLoadKg).toBeNull()
  })

  it('takes the WORST set at the binding load, not the best', () => {
    const v = ladderVerdict([
      { weightKg: 18, reps: 12 }, { weightKg: 18, reps: 8 }, { weightKg: 20, reps: 12 },
    ], ceiling)
    expect(v.state).toBe('blocked')
    expect(v.repsOwed).toBe(4)
  })
})

describe('loadLadder', () => {
  it('groups by load, lightest first, marking which rungs cleared', () => {
    const rungs = loadLadder([
      { weightKg: 20, reps: 12 }, { weightKg: 18, reps: 12 }, { weightKg: 20, reps: 10 },
    ], 12)
    expect(rungs.map((r) => r.weightKg)).toEqual([18, 20])
    expect(rungs[0].cleared).toBe(true)
    expect(rungs[1].cleared).toBe(false)   // the 20×10 set drags the rung down
    expect(rungs[1].sets).toHaveLength(2)
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
  // The Smart-Coach queue relies on this for its "reset on load increase": once a
  // ready lift is bumped, the heavier session usually falls short of the ceiling,
  // so the very next grade drops out of `ready` — the alert clears itself with no
  // stored strike counter.
  it('resets after a load bump the athlete has not yet outgrown', () => {
    const bumped = [{ weightKg: 67.5, reps: 12 }, { weightKg: 67.5, reps: 11 }] // under ceiling 15
    expect(progressionVerdict([clean, bumped], 15).state).toBe('no')
  })
})

/**
 * Timed holds (Side Plank '55s') are scored on TIME. `reps` carries seconds,
 * weight is 0, so the progression is "hold longer" — never a load bump.
 */
describe('holdTargetFor', () => {
  it('reads the programmed hold in seconds', () => {
    expect(holdTargetFor('Side Plank', 'legs_b', 'apex51')).toBe(55)
  })
  it('is null for a loaded lift', () => {
    expect(holdTargetFor('Calf Press', 'legs_b', 'apex51')).toBeNull()
  })
})

describe('timedProgressionVerdict', () => {
  // reps == seconds; two sessions each holding past the 55s target.
  const cleared = [{ weightKg: 0, reps: 60 }, { weightKg: 0, reps: 58 }]
  const short = [{ weightKg: 0, reps: 40 }, { weightKg: 0, reps: 55 }]

  it('never suggests load — a ready hold earns a longer hold', () => {
    const v = timedProgressionVerdict([cleared, cleared], 55)
    expect(v.state).toBe('ready')
    expect(v.suggestKg).toBeNull()
    expect(v.ceiling).toBe(55)
  })
  it('one cleared session says "one more"', () => {
    expect(timedProgressionVerdict([short, cleared], 55).state).toBe('one-more')
  })
  it('a set under the target stays silent', () => {
    expect(timedProgressionVerdict([short, short], 55).state).toBe('no')
  })
})

describe('progressionVerdict — the gate is the TOP load, not any load', () => {
  const ceiling = 12
  const cleanAt = (kg: number) => [{ weightKg: kg, reps: 12 }, { weightKg: kg, reps: 12 }]

  // REVERSED DELIBERATELY. A ladder collapse used to count as "cleared", so any
  // session that touched a lighter load could satisfy the gate — the source of
  // "Ready to progress" appearing on lifts nowhere near ready (SA Cable
  // Crossover, Hack Squat). Clearing a light rung says nothing about the load
  // being chased.
  it('refuses when the TOP load was not cleared, however clean the light rung', () => {
    // Week 2: 18kg cleared, then one set at 20kg for 9 — three reps short.
    const v = progressionVerdict([cleanAt(18), [{ weightKg: 18, reps: 12 }, { weightKg: 20, reps: 9 }]], ceiling)
    expect(v.state).toBe('no')
    expect(v.suggestKg).toBeNull()
  })

  it('suggests the step up from the TOP load once that load is genuinely cleared', () => {
    const v = progressionVerdict([cleanAt(20), cleanAt(20)], ceiling)
    expect(v.suggestKg).toBe(20 + LOAD_STEP_KG)
  })

  it('needs TWO sets at the ceiling on the top load — one is a fluke', () => {
    const oneGoodSet = [{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 9 }]
    expect(progressionVerdict([oneGoodSet, oneGoodSet], ceiling).state).toBe('no')
  })

  it('does NOT require every set — a trailing fatigue set must not block forever', () => {
    const twoPlusFade = [{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 20, reps: 8 }]
    expect(progressionVerdict([twoPlusFade, twoPlusFade], ceiling).state).toBe('ready')
  })

  it('still refuses when the binding rung was short', () => {
    const v = progressionVerdict([cleanAt(20), [{ weightKg: 20, reps: 12 }, { weightKg: 18, reps: 10 }]], ceiling)
    expect(v.state).toBe('no')
  })

  it('leaves the clean single-load path exactly as it was', () => {
    expect(progressionVerdict([cleanAt(20), cleanAt(20)], ceiling)).toEqual({
      state: 'ready', ceiling, suggestKg: 20 + LOAD_STEP_KG,
    })
    expect(progressionVerdict([cleanAt(20)], ceiling).state).toBe('one-more')
  })
})

describe('levelUpCue — mixed loads never mean "add weight"', () => {
  const window = { floor: 8, ceiling: 12 }

  it('says raise the LIGHT load to the heavy one, at the window floor', () => {
    // Two sets at 20 hit the ceiling; a third at 18 did too. The next move is
    // to bring the 18 up to 20, not to put 22.5 on the machine.
    const cue = levelUpCue(
      [{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 18, reps: 12 }],
      window,
    )
    expect(cue).toEqual({ fromKg: 18, toKg: 20, atReps: 8 })
  })

  it('is order-independent — light-first gives the identical cue', () => {
    const cue = levelUpCue(
      [{ weightKg: 18, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }],
      window,
    )
    expect(cue).toEqual({ fromKg: 18, toKg: 20, atReps: 8 })
  })

  it('stays silent on a single load — there is nothing to level up', () => {
    expect(levelUpCue([{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }], window)).toBeNull()
  })

  it('stays silent while the top load is still being earned', () => {
    // 20kg only managed 9 — telling the 18 to move up would be premature.
    expect(levelUpCue([{ weightKg: 18, reps: 12 }, { weightKg: 20, reps: 9 }], window)).toBeNull()
  })
})

describe('topLoadCleared', () => {
  it('ignores bodyweight-only sets', () => {
    expect(topLoadCleared([{ weightKg: 0, reps: 30 }, { weightKg: 0, reps: 30 }], 12)).toBe(false)
  })

  it('counts only sets AT the top load', () => {
    // Three sets at ceiling, but only one of them on the heaviest load.
    expect(topLoadCleared(
      [{ weightKg: 18, reps: 12 }, { weightKg: 18, reps: 12 }, { weightKg: 20, reps: 12 }], 12,
    )).toBe(false)
  })
})
