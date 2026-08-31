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
  /**
   * Which named profile this day was given — "home", "restaurant" — or null.
   *
   * A LABEL, not a foreign key. The figures beside it are a SNAPSHOT taken when
   * the profile was applied, so editing that profile later cannot re-grade a day
   * that is already finished. See `profiles.ts`. Absent (undefined) on a
   * database whose paste-SQL has not run.
   */
  profile_key?: string | null
  /**
   * ── THE THIRD STATE ────────────────────────────────────────────────────────
   * A macro used to have two: a number ("this is the target") and null ("no
   * opinion, ask the rung below"). A restaurant day needs a third — "there is no
   * target for this, do not grade it" — because at a table the carbohydrate and
   * fat split is not knowable, and grading it against a figure inherited from
   * the rung invents a miss out of nothing.
   *
   * A sentinel zero cannot say it: a stored zero is a broken row here on
   * purpose, and a 0 g fat goal would grade the day 0/0 and call it perfect. So
   * tracking is its own boolean, `false` means untracked, and `undefined`/`true`
   * both mean tracked — which is what every row written before this existed
   * meant, and what an un-migrated database keeps meaning.
   *
   * Calories and protein have no such flag on purpose. They are what a night out
   * is actually judged on, and a day that grades neither is not a target.
   */
  track_carbs?: boolean | null
  track_fat?: boolean | null
}

/** The columns the app reads. Kept here so the two query sites cannot drift. */
export const DAILY_TARGET_COLUMNS =
  'date, kcal, protein_g, carbs_g, fat_g, steps_goal, note, profile_key, track_carbs, track_fat'

/**
 * The columns this layer had BEFORE profiles, for the retry when the three new
 * ones are not there yet.
 *
 * Every other newest-column read in this codebase is isolated in its own query
 * so an un-migrated column costs only itself. That trick does not work here:
 * these three belong to the same row as the figures they qualify, and fetching
 * them separately would let a day resolve its targets from one read and its
 * tracking flags from another that failed — a restaurant day silently graded on
 * carbohydrate. So the read asks for everything and falls back to exactly this
 * list, which is the shape the table is known to have had.
 */
export const DAILY_TARGET_COLUMNS_LEGACY = 'date, kcal, protein_g, carbs_g, fat_g, steps_goal, note'

/** Is this macro graded on this day? Absent flag and `true` both mean yes. */
export function tracksCarbs(t: DailyTarget | null | undefined): boolean {
  return t?.track_carbs !== false
}
export function tracksFat(t: DailyTarget | null | undefined): boolean {
  return t?.track_fat !== false
}

/**
 * Is there anything in this row at all? An all-null row is not an override.
 *
 * Untracking counts. "Restaurant, 2,400, protein only" carries a calorie figure
 * so it would pass on the numbers alone — but a row that ONLY says "stop grading
 * fat" is still a deliberate statement about the day, and returning false for it
 * would drop the flag on the floor and grade the fat anyway.
 */
export function hasDailyTarget(t: DailyTarget | null | undefined): boolean {
  if (!t) return false
  if (t.track_carbs === false || t.track_fat === false) return true
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
    /* ── UNTRACKED RESOLVES TO NULL, AND THAT IS THE WHOLE MECHANISM ─────────
       Not to zero, and emphatically not to the rung's figure. `null` is what
       every consumer already treats as "this day sets no target here": the bars
       draw empty rather than red, the day line prints the intake with no
       denominator, and `computeNutritionScore` skips the macro entirely because it
       only grades a goal that is `> 0`. So "sits out of the aggregate" needed no
       change in the scorer at all — it needed this line. */
    carbs: tracksCarbs(t) ? pick(t!.carbs_g, goals.carbs) : null,
    fat: tracksFat(t) ? pick(t!.fat_g, goals.fat) : null,
    steps: pick(t!.steps_goal, goals.steps),
  }
}
