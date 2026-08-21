import { describe, it, expect } from 'vitest'
import { sessionVerdict } from '@/lib/training/sessionVerdict'
import { exerciseStats } from '@/components/session-detail/ExerciseBreakdown'
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'

const set = (o: Partial<DetailSet> & Pick<DetailSet, 'setNumber' | 'weightKg' | 'reps'>): DetailSet => ({
  rpe: null, isPr: false, est1rmKg: null, setType: 'normal', side: null, pairId: null,
  prAxes: [], ...o,
})

describe('sessionVerdict', () => {
  const chest = { name: 'Chest Press', topKg: 62.5, prevKg: 60 }

  it('leads with the LOAD when tonnage fell and a lift went up', () => {
    // The case the whole thing exists for: cleared the ceiling, added load,
    // reps reset to the floor, tonnage drops. That is the program working.
    const v = sessionVerdict(-7, [chest])!
    expect(v.tone).toBe('praise')
    expect(v.headline).toMatch(/^Heavier on Chest Press/)
    expect(v.headline).toMatch(/7%/)
    expect(v.loadGains).toEqual([{ name: 'Chest Press', fromKg: 60, toKg: 62.5 }])
  })

  it('ranks the load gains by size, biggest first', () => {
    const v = sessionVerdict(-4, [chest, { name: 'Leg Press', topKg: 140, prevKg: 120 }])!
    expect(v.loadGains[0].name).toBe('Leg Press')
    expect(v.headline).toMatch(/2 movements/)
  })

  it('does NOT forgive a drop with no load increase anywhere', () => {
    const v = sessionVerdict(-12, [{ name: 'Chest Press', topKg: 60, prevKg: 60 }])!
    expect(v.tone).toBe('caution')
    expect(v.headline).toMatch(/no load increase/)
  })

  it('says so plainly when both went up', () => {
    expect(sessionVerdict(6, [chest])!.headline).toMatch(/Up on both/)
  })

  it('ignores unloaded movements, whose load cannot go up', () => {
    // A Hanging Knee Raise at 0 kg has no load axis; counting it as "held" or
    // "gained" would be a statement about a number that does not exist.
    const v = sessionVerdict(-5, [{ name: 'Hanging Knee Raise', topKg: 0, prevKg: 0, unloaded: true }])!
    expect(v.loadGains).toEqual([])
    expect(v.tone).toBe('caution')
  })

  it('has nothing to say about a first session of its type', () => {
    expect(sessionVerdict(null, [chest])).toBeNull()
  })

  it('calls a matched session matched', () => {
    expect(sessionVerdict(0, [chest])!.tone).toBe('neutral')
  })
})

describe('exerciseStats', () => {
  const ex = (sets: DetailSet[]): DetailExercise => ({
    exerciseId: 'x', name: 'Chest Press', order: 0, muscleGroups: ['Chest'], isCompound: true,
    sets, workingSets: sets.filter((s) => s.setType !== 'warmup').length,
    topKg: 0, volumeKg: 0, bestEst1rm: null, prAxes: [],
  })

  it('sums reps over working sets only', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 20, reps: 15, setType: 'warmup' }),
      set({ setNumber: 2, weightKg: 60, reps: 10 }),
      set({ setNumber: 3, weightKg: 60, reps: 8 }),
    ]))
    expect(stats.totalReps).toBe(18)
    expect(stats.topKg).toBe(60)
  })

  it('counts a unilateral pair once, like tonnage does', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 10, reps: 12, side: 'L', pairId: 'p1' }),
      set({ setNumber: 1, weightKg: 10, reps: 11, side: 'R', pairId: 'p1' }),
    ]))
    expect(stats.totalReps).toBe(12)
  })

  /*
   * Three rest cases used to live here — a median, an absence, and a clock
   * format. All three are gone with `restSec`, which was measured by a stopwatch
   * removed on 2026-08-19 and stored in a column that held a value on 0 of 523
   * sets. Rest is `restTargetFor` now, and it is a prescription with its own
   * tests.
   */

  /**
   * ── TOP IS WHICHEVER AXIS THE MOVEMENT HAS ─────────────────────────────────
   * `topKg` is 0 on every bodyweight and timed lift, so a report that only knew
   * about load printed "Top —" on Hanging Knee Raise, Side Plank and Reverse
   * Crunch. `topReps` is the fallback, and it is the best SINGLE set rather than
   * a sum: "top" means the best one.
   */
  it('reports the best set by reps when the movement carries no load', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 0, reps: 15 }),
      set({ setNumber: 2, weightKg: 0, reps: 17 }),
      set({ setNumber: 3, weightKg: 0, reps: 12 }),
    ]))
    expect(stats.topKg).toBe(0)
    expect(stats.topReps).toBe(17)
    // The sum is a DIFFERENT number and stays available — 44 reps of work is
    // not a 44-rep set.
    expect(stats.totalReps).toBe(44)
  })

  it('still reports the heaviest set when there IS load', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 60, reps: 10 }),
      set({ setNumber: 2, weightKg: 62.5, reps: 8 }),
    ]))
    expect(stats.topKg).toBe(62.5)
    // Both axes are computed either way; the renderer picks by whether there is
    // a load. A `topReps` that only existed on unloaded work would be a second
    // code path to keep in step.
    expect(stats.topReps).toBe(10)
  })

  it('never returns a null Top — a warm-up-only exercise still has a best set', () => {
    // Warm-ups are excluded from every working figure, so this is the degenerate
    // case: the fallback must be 0, not null, or the cell renders "Top null".
    const stats = exerciseStats(ex([set({ setNumber: 1, weightKg: 0, reps: 10, setType: 'warmup' })]))
    expect(stats.topReps).toBe(0)
  })

  it('averages effort over working sets', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 20, reps: 15, setType: 'warmup', rpe: 5 }),
      set({ setNumber: 2, weightKg: 60, reps: 10, rpe: 8 }),
      set({ setNumber: 3, weightKg: 60, reps: 8, rpe: 9 }),
    ]))
    expect(stats.avgRpe).toBe(8.5)
  })
})
