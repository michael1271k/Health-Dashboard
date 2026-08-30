/**
 * Per-day target overrides — the layer above every rung.
 *
 * ── WHY A DATE AXIS WAS THE MISSING PIECE ────────────────────────────────────
 * Before this, a target could be global (`user_goals`), phase-wide
 * (`plan_phase_goals`) or rung-wide (`LEVERS`), and the only thing resembling a
 * date axis was `LEVER_SCHEDULE` — a compiled constant. There was no way to say
 * "Tuesday is a restaurant day, 2,400" without retyping the numbers, grading
 * every other day against them, and then remembering to put them back.
 *
 * A maintenance week is exactly the week where that matters most: the whole
 * point of releasing the deficit is that individual days differ.
 *
 * ── IT OVERRIDES FIELD BY FIELD, NOT ALL OR NOTHING ──────────────────────────
 * A row that sets only `kcal` must not blank the macros. Every column is
 * nullable and null means "no opinion, ask the layer below" — so raising one
 * day's calories leaves protein sitting on the rung where you left it.
 *
 * ── AND IT REACHES BACKWARDS, WHICH NOTHING ELSE HERE DOES ───────────────────
 * `leverForDate` deliberately refuses to let today's selection re-mark a
 * finished day: the past belongs to the schedule, because a day was eaten
 * against whatever was in force at the time. That invariant is right for a rung
 * — one mutable selection silently regrading a month is the bug it exists to
 * prevent — and wrong for this. A per-day row IS a statement about one specific
 * day, made deliberately, and correcting last Tuesday's target is the only
 * reason you would ever write one for last Tuesday. So this layer applies to any
 * date, past or future, and it is the single place in the resolution chain where
 * that relaxation is allowed.
 *
 * Pure and server-safe: `computeForDate` resolves through here too, so a day is
 * graded against exactly the number the app displayed for it.
 */

import type { LeverGoals } from './levers'

/** One row of `daily_targets`. Every figure is optional — see the note above. */
export interface DailyTarget {
  date: string
  kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  steps_goal?: number | null
  note?: string | null
}

/** The columns the app reads. Kept here so the two query sites cannot drift. */
export const DAILY_TARGET_COLUMNS = 'date, kcal, protein_g, carbs_g, fat_g, steps_goal, note'

/** Is there anything in this row at all? An all-null row is not an override. */
export function hasDailyTarget(t: DailyTarget | null | undefined): boolean {
  if (!t) return false
  return [t.kcal, t.protein_g, t.carbs_g, t.fat_g, t.steps_goal]
    .some((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
}

/**
 * Lay a day's overrides over already-resolved goals.
 *
 * `> 0` rather than `!= null` throughout, matching `resolveNutritionGoals`: a
 * stored zero is a broken row, not a fast, and treating it as a target would
 * grade the day at 0/0 and call it perfect.
 */
export function applyDailyTarget(goals: LeverGoals, t: DailyTarget | null | undefined): LeverGoals {
  if (!hasDailyTarget(t)) return goals
  const pick = (v: number | null | undefined, fallback: number | null) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
  return {
    calorie: pick(t!.kcal, goals.calorie) ?? goals.calorie,
    protein: pick(t!.protein_g, goals.protein),
    carbs: pick(t!.carbs_g, goals.carbs),
    fat: pick(t!.fat_g, goals.fat),
    steps: pick(t!.steps_goal, goals.steps),
  }
}
