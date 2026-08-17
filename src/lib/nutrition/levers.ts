/**
 * Phase levers — the rungs of the cut, in code, with one selection in the DB.
 *
 * ── WHAT A LEVER IS ──────────────────────────────────────────────────────────
 * A deficit has two dials: eat less, or move more. A lever is one named
 * combination of both, so "tighten it a notch" is a single decision with a
 * single name rather than four numbers retyped in Settings and then half
 * remembered a week later. The rungs are ordered: each is a strictly harder
 * week than the one above it.
 *
 * ── EVERY MACRO TRIPLE IS ATWATER-EXACT ──────────────────────────────────────
 * 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat. The baseline is
 * 170·4 + 195·4 + 55·9 = 1955, which is where the app's old `1950` literal came
 * from and what it was five kcal wrong about. `levers.test.ts` asserts the sum
 * for every rung, so a hand-edited macro here cannot drift from its own calorie
 * figure the way that literal did.
 *
 * ── PRECEDENCE, AND WHY IT IS NOT WHAT THE PLAN SAID ─────────────────────────
 * The plan put the lever BELOW a `plan_phase_goals` override. That ordering
 * cannot be honoured identically on both sides: the client knows which fields
 * you typed by hand for this (plan, phase); the server scorer reads the
 * `user_goals` row and has no such knowledge, so it would grade against the
 * lever on days the client displayed the override. A goal shown and a goal
 * graded that differ is the exact bug class `serverScheduleContext` exists to
 * prevent.
 *
 * So a lever is the TOP layer on both sides, and typing your own numbers selects
 * the `custom` rung — which is a real selection, not an absence. One rule, one
 * answer, whichever side asks.
 */

export type LeverId = 'baseline' | 'lever-1' | 'lever-2' | 'lever-3' | 'custom'

export interface NutritionLever {
  id: LeverId
  label: string
  /** One line, written for the moment of choosing — not a description of a diet. */
  summary: string
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  stepsGoal: number
}

/**
 * The rungs, easiest first. `custom` is deliberately NOT here: it names the
 * absence of a rung and carries no numbers of its own.
 */
export const LEVERS: NutritionLever[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    summary: 'The plan as written — full carbs, 8k steps.',
    calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    stepsGoal: 8000,
  },
  {
    id: 'lever-1',
    label: 'Lever 1',
    summary: '−70 kcal off carbs and fat, steps to 10k.',
    calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53,
    stepsGoal: 10000,
  },
  {
    // From here the FOOD stops moving. Protein is already at the floor a cut can
    // hold and cutting carbs further costs training quality, so the next two
    // rungs deepen the deficit with movement instead — which is also the half
    // you can abandon on a bad week without eating into recovery.
    id: 'lever-2',
    label: 'Lever 2',
    summary: 'Same food as Lever 1, steps to 12k.',
    calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53,
    stepsGoal: 12000,
  },
  {
    id: 'lever-3',
    label: 'Lever 3',
    summary: 'Same food as Lever 1, steps to 15k. The last rung.',
    calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53,
    stepsGoal: 15000,
  },
]

export const DEFAULT_LEVER: LeverId = 'baseline'

/** The rung a stored value names, or null for `custom`/unknown/absent. */
export function leverById(id: string | null | undefined): NutritionLever | null {
  if (!id) return null
  return LEVERS.find((l) => l.id === id) ?? null
}

/** Is this a value the lever column may hold at all? */
export function isLeverId(id: string | null | undefined): id is LeverId {
  return id === 'custom' || LEVERS.some((l) => l.id === id)
}

/** Atwater energy of a macro triple, for the invariant every rung must satisfy. */
export function atwaterKcal(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9
}

/** The goal fields a lever replaces. Everything else it leaves alone. */
export interface LeverGoals {
  calorie: number
  protein: number | null
  carbs: number | null
  fat: number | null
  steps: number | null
}

/**
 * Apply a lever over resolved goals.
 *
 * Returns the input untouched for `custom`, for an unknown id, and for no
 * selection at all — the three cases where the user has not asked for a rung.
 */
export function applyLever(goals: LeverGoals, leverId: string | null | undefined): LeverGoals {
  const lever = leverById(leverId)
  if (!lever) return goals
  return {
    calorie: lever.calorieGoal,
    protein: lever.proteinGoalG,
    carbs: lever.carbsGoalG,
    fat: lever.fatGoalG,
    steps: lever.stepsGoal,
  }
}

/**
 * The lever a `user_goals` row names, tolerant of the column not existing yet.
 *
 * `select('*')` omits an absent column rather than failing, so this reads null
 * on a database without the migration and everything behaves as it did before
 * levers existed. Lives HERE, in a module with no `'use client'` directive,
 * because the server scorer calls it — importing it from the hooks module made
 * it a client reference on the server, which is a proxy, not a function.
 */
export function activeLeverOf(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const v = (row as { active_lever?: unknown }).active_lever
  return typeof v === 'string' && v ? v : null
}
