import { describe, it, expect } from 'vitest'
import { sessionVerdict } from '@/lib/training/sessionVerdict'
import { exerciseStats, formatRest } from '@/components/session-detail/ExerciseBreakdown'
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'

const set = (o: Partial<DetailSet> & Pick<DetailSet, 'setNumber' | 'weightKg' | 'reps'>): DetailSet => ({
  rpe: null, isPr: false, est1rmKg: null, setType: 'normal', side: null, pairId: null,
  prAxes: [], restSec: null, ...o,
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

  it('takes the MEDIAN rest, so one interrupted set does not describe the exercise', () => {
    const stats = exerciseStats(ex([
      set({ setNumber: 1, weightKg: 60, reps: 10, restSec: 90 }),
      set({ setNumber: 2, weightKg: 60, reps: 9, restSec: 95 }),
      set({ setNumber: 3, weightKg: 60, reps: 8, restSec: 900 }),
    ]))
    expect(stats.medianRestSec).toBe(95)
  })

  it('reports rest as ABSENT, never zero, when nothing was measured', () => {
    const stats = exerciseStats(ex([set({ setNumber: 1, weightKg: 60, reps: 10 })]))
    expect(stats.medianRestSec).toBeNull()
    expect(formatRest(null)).toBeNull()
    expect(formatRest(0)).toBeNull()
  })

  it('formats rest the way a clock does', () => {
    expect(formatRest(45)).toBe('45s')
    expect(formatRest(90)).toBe('1:30')
    expect(formatRest(605)).toBe('10:05')
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
