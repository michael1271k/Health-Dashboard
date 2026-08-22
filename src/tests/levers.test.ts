import { describe, it, expect } from 'vitest'
import { LEVERS, applyLever, leverById, isLeverId, atwaterKcal, activeLeverOf } from '@/lib/nutrition/levers'
import { resolveNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { phaseGoalsFor } from '@/lib/types/workout'
import { DEFAULT_PROGRAM_ID } from '@/lib/programs'

describe('the rungs themselves', () => {
  it('every macro triple sums to its own calorie figure', () => {
    // The class of bug that produced `1950`: a calorie literal written beside
    // macros that added to something else, and nothing that ever checked.
    for (const l of LEVERS) {
      expect(atwaterKcal(l.proteinGoalG, l.carbsGoalG, l.fatGoalG), l.label).toBe(l.calorieGoal)
    }
  })

  it('is ordered — each rung is at least as hard as the one above it', () => {
    for (let i = 1; i < LEVERS.length; i++) {
      const prev = LEVERS[i - 1], cur = LEVERS[i]
      expect(cur.calorieGoal, cur.label).toBeLessThanOrEqual(prev.calorieGoal)
      expect(cur.stepsGoal, cur.label).toBeGreaterThanOrEqual(prev.stepsGoal)
    }
  })

  it('keeps protein flat across the whole ladder', () => {
    // Deepening a deficit by cutting protein is the one move the ladder must
    // never make; a hand-edit that did would pass every other test here.
    const protein = new Set(LEVERS.map((l) => l.proteinGoalG))
    expect(protein.size).toBe(1)
  })

  it('baseline is the plan as written', () => {
    // 10k, not 8k — corrected 2026-08-22 to agree with NUTRITION_PRESETS.cut
    // and the live user_goals row, which had both said 10,000 all along.
    expect(LEVERS[0]).toMatchObject({ id: 'baseline', calorieGoal: 1955, stepsGoal: 10000 })
  })
})

describe('applyLever', () => {
  const goals = { calorie: 2500, protein: 100, carbs: 300, fat: 80, steps: 6000 }

  it('replaces every field it owns', () => {
    expect(applyLever(goals, 'lever-1')).toEqual({
      calorie: 1885, protein: 170, carbs: 182, fat: 53, steps: 10000,
    })
  })

  it('leaves the goals alone for custom, unknown and absent', () => {
    expect(applyLever(goals, 'custom')).toBe(goals)
    expect(applyLever(goals, 'lever-9')).toBe(goals)
    expect(applyLever(goals, null)).toBe(goals)
    expect(applyLever(goals, undefined)).toBe(goals)
  })
})

describe('activeLeverOf — tolerant of a database without the column', () => {
  it('reads the rung when the column exists', () => {
    expect(activeLeverOf({ active_lever: 'lever-2' })).toBe('lever-2')
  })

  it('reads null pre-migration, rather than throwing or guessing', () => {
    expect(activeLeverOf({ calorie_goal: 1955 })).toBeNull()
    expect(activeLeverOf(null)).toBeNull()
    expect(activeLeverOf({ active_lever: '' })).toBeNull()
  })

  it('knows which ids are real', () => {
    expect(isLeverId('lever-2')).toBe(true)
    expect(isLeverId('custom')).toBe(true)
    expect(isLeverId('lever-9')).toBe(false)
    // Deleted 2026-08-22 when its step ceiling was folded into Lever 2's band.
    // A stored 'lever-3' must now read as unknown rather than resolving to a
    // rung that no longer exists.
    expect(isLeverId('lever-3')).toBe(false)
    expect(leverById('custom')).toBeNull()
  })
})

describe('resolveNutritionGoals with a lever', () => {
  const preset = phaseGoalsFor(DEFAULT_PROGRAM_ID, 'cut')
  const row = {
    calorie_goal: 2500, protein_goal_g: 100, carbs_goal_g: 300, fat_goal_g: 80,
    goal_preset: 'cut' as const,
  }

  it('outranks the phase preset', () => {
    const g = resolveNutritionGoals(row, preset, 'cut', 'lever-1')
    expect(g.calorie).toBe(1885)
    expect(g.source).toBe('lever')
    expect(g.lever).toBe('lever-1')
    // The phase is still reported — a lever is a rung OF a phase, not a phase.
    expect(g.mode).toBe('cut')
  })

  it('keeps the phase fiber range, which no lever describes', () => {
    const g = resolveNutritionGoals(row, preset, 'cut', 'lever-1')
    expect(g.fiberMin).toBe(preset.fiberMin ?? null)
  })

  it('changes nothing when no rung is selected', () => {
    const withLever = resolveNutritionGoals(row, preset, 'cut', null)
    const without = resolveNutritionGoals(row, preset, 'cut')
    expect(withLever).toEqual(without)
    expect(without.source).toBe('plan-phase')
  })

  it('treats custom as a real selection of "my own numbers"', () => {
    const g = resolveNutritionGoals(row, preset, 'cut', 'custom')
    expect(g.source).toBe('plan-phase')
    expect(g.calorie).toBe(preset.calorieGoal)
  })
})
