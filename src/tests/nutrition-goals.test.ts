import { describe, it, expect } from 'vitest'
import { resolveNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { phaseGoalsFor, NUTRITION_PRESETS } from '@/lib/types/workout'

/**
 * One goal, four consumers.
 *
 * Before this resolver: `/nutrition` seeded a literal, `MacroProgressChart` on
 * the SAME page read the raw `user_goals` row, and `/day/<date>` graded its three
 * rings against literal 200 / 60 / 180. Three surfaces, three answers, same day.
 *
 * ── 1950 vs 1955 ─────────────────────────────────────────────────────────────
 * This file used to assert 1950 and describe 1955 as "the literal that matched
 * no preset". That had it backwards: 1955 IS the preset's own macros — 170·4 +
 * 195·4 + 55·9 — and 1950 was the number that matched nothing. The stray was
 * fixed at its source instead of being enforced here. See `cut-baseline.test.ts`.
 */

const CUT = phaseGoalsFor('apex51', 'cut')

const row = (over: Partial<{ calorie_goal: number; protein_goal_g: number | null; carbs_goal_g: number | null; fat_goal_g: number | null; goal_preset: string | null }> = {}) => ({
  calorie_goal: 2300,
  protein_goal_g: 150,
  carbs_goal_g: 220,
  fat_goal_g: 70,
  goal_preset: null,
  ...over,
}) as never

describe('resolveNutritionGoals', () => {
  it('lets the plan+phase preset outrank a drifted stored row', () => {
    // Choosing a phase IS how you set your goals; user_goals caches that
    // decision, and a cache does not get to outvote its source.
    const out = resolveNutritionGoals(row({ goal_preset: 'cut' }), CUT, 'cut')
    expect(out.calorie).toBe(CUT.calorieGoal)
    expect(out.calorie).not.toBe(2300)
    expect(out.source).toBe('plan-phase')
  })

  it('returns the preset itself when there is no row, never a literal', () => {
    expect(resolveNutritionGoals(null, CUT, 'cut').calorie).toBe(CUT.calorieGoal)
    expect(resolveNutritionGoals(null, CUT, 'cut').calorie).toBe(1955)
  })

  it('carries all three macros, not calories alone', () => {
    const out = resolveNutritionGoals(null, CUT, 'cut')
    expect(out.protein).toBe(CUT.proteinGoalG)
    expect(out.carbs).toBe(CUT.carbsGoalG)
    expect(out.fat).toBe(CUT.fatGoalG)
  })

  it('honours a stored row when no phase was ever chosen', () => {
    const out = resolveNutritionGoals(row(), CUT, null)
    expect(out.calorie).toBe(2300)
    expect(out.protein).toBe(150)
    expect(out.mode).toBeNull()
    expect(out.source).toBe('user-row')
  })

  it('treats a zero calorie goal as a broken row, not a fast', () => {
    const out = resolveNutritionGoals(row({ calorie_goal: 0 }), CUT, null)
    expect(out.calorie).toBe(CUT.calorieGoal)
    expect(out.source).toBe('default')
  })

  it('falls back to the PLAN’s numbers with nothing stored at all', () => {
    const ppl = phaseGoalsFor('ppl', 'cut')
    const out = resolveNutritionGoals(null, ppl, null)
    expect(out.calorie).toBe(ppl.calorieGoal)
    expect(out.calorie).not.toBe(NUTRITION_PRESETS.cut.calorieGoal)   // PPL ran leaner
    expect(out.source).toBe('default')
  })

  it('passes a per-(plan, phase) override straight through', () => {
    // usePlanPhaseGoals.resolve has already merged the user's Settings edit into
    // the preset by the time it reaches here — the resolver must not re-derive.
    const edited = { ...CUT, calorieGoal: 2050, proteinGoalG: 185 }
    const out = resolveNutritionGoals(row({ goal_preset: 'cut' }), edited, 'cut')
    expect(out.calorie).toBe(2050)
    expect(out.protein).toBe(185)
  })

  it('reports the mode so the page can name the phase', () => {
    expect(resolveNutritionGoals(null, phaseGoalsFor('apex51', 'bulk'), 'bulk').mode).toBe('bulk')
  })

  it('carries the fiber window, which only the micros page reads', () => {
    const out = resolveNutritionGoals(null, CUT, 'cut')
    expect(out.fiberMin).toBe(CUT.fiberMin ?? null)
    expect(out.fiberMax).toBe(CUT.fiberMax ?? null)
  })
})
