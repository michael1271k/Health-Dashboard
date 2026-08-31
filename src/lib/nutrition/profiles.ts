/**
 * Target profiles — a named day, reusable, applied with one tap.
 *
 * ── WHAT A PROFILE IS, AND WHY IT IS NOT A LEVER ─────────────────────────────
 * A LEVER is a rung of a phase: it is in force from a date until the next rung,
 * it applies to every day inside that stretch, and pulling one is a decision
 * about a WEEK. `LEVER_SCHEDULE` records when each was pulled precisely so a
 * finished day can never be re-graded by a later selection.
 *
 * A PROFILE is a shape a single day can take. "Home" and "Restaurant" are not
 * steps on a ladder, they are not ordered, neither is harder than the other, and
 * both can happen inside the same week under the same rung. Maintenance is where
 * it shows up most — the whole point of releasing a deficit is that individual
 * days differ — but a restaurant day is a restaurant day in a cut, in a bulk and
 * at maintenance alike, so a profile is deliberately NOT gated on the phase or
 * on which lever is pulled.
 *
 * ── AND WHY APPLYING ONE SNAPSHOTS ITS NUMBERS ───────────────────────────────
 * Applying a profile writes its figures into `daily_targets` and stamps
 * `profile_key` beside them. The key is a LABEL, not a foreign key that gets
 * resolved at read time.
 *
 * That is the difference between a template and a rule. Edit "Restaurant" to
 * 2,500 next month and every restaurant day you have ever eaten would silently
 * be re-graded against a number that was not in force when you ate it — the
 * exact failure `leverForDate` exists to prevent one layer down. The snapshot
 * means the past keeps what it was actually asked for, and the key is only there
 * so a day can say which shape it took.
 *
 * ── THE THIRD STATE: UNTRACKED ───────────────────────────────────────────────
 * `daily_targets` already had two states per macro: a number (this is the
 * target) and null (no opinion, ask the rung below). A restaurant day needs a
 * third — "there is no target for this, do not grade it" — because on a night
 * out the carbohydrate and fat split is not knowable and grading against an
 * inherited figure invents a miss out of nothing.
 *
 * A sentinel zero cannot express it: `applyDailyTarget` treats a stored zero as
 * a broken row on purpose, and a 0 g fat target would grade the day at 0/0 and
 * call it perfect. So tracking is its own boolean per macro, and an untracked
 * macro resolves to `null` — which the scorer already skips, because
 * `computeNutritionScore` only grades a macro whose goal is `> 0`. Calories and
 * protein stay tracked in every profile: they are what a night out is judged on.
 *
 * Pure and server-safe — no React, no Supabase. `computeForDate` resolves
 * through the same `applyDailyTarget` this feeds, so a day is graded against
 * exactly the number the app displayed for it.
 */

import type { DailyTarget } from './dailyTargets'

/** One named shape a day can take. Mirrors a row of `target_profiles`. */
export interface TargetProfile {
  /** Stable identifier, stamped onto the day. Never renamed once used. */
  key: string
  /** What it is called on screen. Editable; the key is not. */
  label: string
  /** One line for the moment of choosing — not a description of a diet. */
  summary: string
  /** Ordering in the picker. Lower first. */
  sort: number
  kcal: number
  proteinG: number
  /** Null when the macro is UNTRACKED — see the note above. Never zero. */
  carbsG: number | null
  fatG: number | null
  /** Steps, when the profile has an opinion. Usually it does not. */
  stepsGoal: number | null
}

/**
 * The profiles the app ships with, and the answer whenever `target_profiles`
 * cannot be read.
 *
 * These are a FALLBACK, not the source of record: the table is, and the Settings
 * screen edits it. They exist for the same reason every other read in this
 * codebase degrades quietly — an app running against a database that has not had
 * the DDL applied must still work, and "still works" here means the two profiles
 * you actually use are still one tap away with the numbers they had.
 *
 * `home` is Atwater-consistent to within a kilocalorie (170·4 + 244·4 + 55·9 =
 * 2,151 against a stated 2,150) and is NOT asserted exact: the levers' Atwater
 * invariant exists because a rung's calorie figure is derived from its macros,
 * where a profile's calorie figure is the number you decided to eat and the
 * macros are how you intend to spend it.
 */
export const BUILTIN_PROFILES: readonly TargetProfile[] = [
  {
    key: 'home',
    label: 'Home',
    summary: 'Cooked and weighed — every macro is a real target.',
    sort: 0,
    kcal: 2150,
    proteinG: 170,
    carbsG: 244,
    fatG: 55,
    stepsGoal: null,
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    summary: 'Eating out — hit the protein, let the split go.',
    sort: 1,
    kcal: 2400,
    proteinG: 170,
    // Untracked, not zero. The split is not knowable at a table, and grading it
    // against an inherited figure invents a miss out of nothing.
    carbsG: null,
    fatG: null,
    stepsGoal: null,
  },
] as const

/**
 * The profile a day is stamped with, or null.
 *
 * `profiles` is whatever the app managed to read — the table when it is there,
 * `BUILTIN_PROFILES` when it is not. A key that names nothing resolves to null
 * rather than to the first profile: a day stamped with a profile that has since
 * been deleted kept its own snapshotted numbers, and inventing a different
 * profile's label for it would be a lie about what was eaten against.
 */
export function profileByKey(
  profiles: readonly TargetProfile[],
  key: string | null | undefined,
): TargetProfile | null {
  if (!key) return null
  return profiles.find((p) => p.key === key) ?? null
}

/**
 * The `daily_targets` row that applying this profile to `date` produces.
 *
 * Every field is stated, including the two tracking booleans, because this row
 * REPLACES whatever the day held: applying "Restaurant" over a day someone had
 * hand-edited must not leave that day's old carbohydrate target sitting
 * underneath, silently graded.
 *
 * `steps_goal` is the one exception and stays null unless the profile names one
 * — a profile is a statement about food, and a day that also happened to have a
 * step override should not lose it because dinner moved.
 */
export function profileToDailyTarget(profile: TargetProfile, date: string): DailyTarget {
  return {
    date,
    kcal: profile.kcal,
    protein_g: profile.proteinG,
    carbs_g: profile.carbsG,
    fat_g: profile.fatG,
    steps_goal: profile.stepsGoal,
    profile_key: profile.key,
    track_carbs: profile.carbsG != null,
    track_fat: profile.fatG != null,
    note: null,
  }
}

/**
 * Which profile a day's stored row corresponds to, WITHOUT trusting the stamp.
 *
 * The stamp says which profile was applied; this says whether the numbers still
 * match it. They come apart the moment a figure is hand-edited afterwards, and
 * a picker that kept "Restaurant" highlighted over 2,400 → 2,650 would be
 * showing a selection that is no longer true.
 *
 * Compared on the four food figures and both tracking flags. Steps are excluded
 * deliberately — see `profileToDailyTarget`, which does not claim them.
 */
export function matchesProfile(t: DailyTarget | null | undefined, profile: TargetProfile): boolean {
  if (!t) return false
  const trackCarbs = t.track_carbs !== false
  const trackFat = t.track_fat !== false
  return t.kcal === profile.kcal
    && t.protein_g === profile.proteinG
    && trackCarbs === (profile.carbsG != null)
    && trackFat === (profile.fatG != null)
    && (profile.carbsG == null || t.carbs_g === profile.carbsG)
    && (profile.fatG == null || t.fat_g === profile.fatG)
}
