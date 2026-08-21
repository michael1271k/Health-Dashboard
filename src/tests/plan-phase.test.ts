import { describe, it, expect } from 'vitest'
import { phaseGoalsFor, NUTRITION_PRESETS, PLAN_PHASES } from '@/lib/types/workout'
import {
  PROGRAM_TARGETS, programTargets, weeklyVolumeByMuscle, LANDMARK_MUSCLES,
} from '@/lib/training/landmarks'

/**
 * Phases live INSIDE plans. Before this, four different things called themselves
 * "the phase": the date calendar (phases.ts), the active phase
 * (localStorage/user_goals), a display tag reverse-engineered from calorie_goal,
 * and — worst — the MEV target set, which was keyed by `calorie_goal >= 2450`.
 */
describe('phaseGoalsFor — plan-specific numbers layer over the phase preset', () => {
  it('falls back to the shared preset for a plan with no overrides', () => {
    expect(phaseGoalsFor('apex51', 'cut')).toEqual(NUTRITION_PRESETS.cut)
  })

  it('applies the plan-specific override where one exists', () => {
    // PPL's cut is leaner than Helix's — the seam that already existed.
    const ppl = phaseGoalsFor('ppl', 'cut')
    expect(ppl.calorieGoal).toBe(PLAN_PHASES.ppl!.cut!.calorieGoal)
    expect(ppl.calorieGoal).not.toBe(NUTRITION_PRESETS.cut.calorieGoal)
    // Un-overridden fields still come from the preset.
    expect(ppl.stepsGoal).toBe(NUTRITION_PRESETS.cut.stepsGoal)
  })

  it('covers all three phases for every plan', () => {
    for (const planId of ['apex51', 'axis4', 'ppl']) {
      for (const phase of ['cut', 'maintenance', 'bulk'] as const) {
        expect(phaseGoalsFor(planId, phase).calorieGoal).toBeGreaterThan(0)
      }
    }
  })
})

describe('set-volume targets are phase-keyed, and maintenance finally exists', () => {
  it('has a distinct target table for all THREE phases', () => {
    expect(Object.keys(PROGRAM_TARGETS).sort()).toEqual(['bulk', 'cut', 'maintenance'])
  })

  it('no longer collapses maintenance into cut', () => {
    // The old programFromGoal() returned 'bulk' only at >= 2450 kcal, so a
    // maintenance block silently trained to CUT volume.
    expect(PROGRAM_TARGETS.maintenance).not.toEqual(PROGRAM_TARGETS.cut)
    expect(PROGRAM_TARGETS.maintenance).not.toEqual(PROGRAM_TARGETS.bulk)
  })

  it('sits maintenance between MEV+ and MAV for every muscle', () => {
    for (const m of LANDMARK_MUSCLES) {
      expect(PROGRAM_TARGETS.maintenance[m]).toBeGreaterThanOrEqual(PROGRAM_TARGETS.cut[m])
      expect(PROGRAM_TARGETS.maintenance[m]).toBeLessThanOrEqual(PROGRAM_TARGETS.bulk[m])
    }
  })

  it('falls back to the cut floor for an unknown phase rather than crashing', () => {
    expect(programTargets('nonsense' as never)).toEqual(PROGRAM_TARGETS.cut)
  })
})

describe('weeklyVolumeByMuscle honours per-plan+phase overrides', () => {
  const rows = [
    { primary: ['chest'], secondary: [], dedupeKey: 'a' },
    { primary: ['chest'], secondary: [], dedupeKey: 'b' },
  ]

  it('grades against the phase default when no override exists', () => {
    const chest = weeklyVolumeByMuscle(rows, 'cut').find((m) => m.muscle === 'Chest')!
    expect(chest.sets).toBe(2)
    expect(chest.target).toBe(PROGRAM_TARGETS.cut.Chest)
  })

  it('lets a user override replace the target for one muscle only', () => {
    const graded = weeklyVolumeByMuscle(rows, 'cut', { Chest: 2 })
    expect(graded.find((m) => m.muscle === 'Chest')!.target).toBe(2)
    expect(graded.find((m) => m.muscle === 'Lats')!.target).toBe(PROGRAM_TARGETS.cut.Lats)
  })

  it('reads the phase, so the same sets grade differently on cut vs bulk', () => {
    const onCut = weeklyVolumeByMuscle(rows, 'cut').find((m) => m.muscle === 'Chest')!
    const onBulk = weeklyVolumeByMuscle(rows, 'bulk').find((m) => m.muscle === 'Chest')!
    expect(onCut.target).not.toBe(onBulk.target)
    expect(onCut.sets).toBe(onBulk.sets)
  })

  it('still de-duplicates unilateral L/R sub-sets sharing a key', () => {
    const paired = [
      { primary: ['chest'], secondary: [], dedupeKey: 'pair1' },
      { primary: ['chest'], secondary: [], dedupeKey: 'pair1' },
    ]
    expect(weeklyVolumeByMuscle(paired, 'cut').find((m) => m.muscle === 'Chest')!.sets).toBe(1)
  })
})
