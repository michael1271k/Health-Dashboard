'use client'

import { useUserGoals } from '@/lib/hooks/useDashboard'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { getActiveProgramId } from '@/lib/programs'
import { phaseGoalsFor, type NutritionMode, type NutritionPreset } from '@/lib/types/workout'
import type { Tables } from '@/lib/supabase/types'
import { leverById, activeLeverOf, leverForDate, type LeverId } from '@/lib/nutrition/levers'
import { logicalTodayISO } from '@/lib/utils/day'
import {
  applyDailyTarget, hasDailyTarget, tracksCarbs, tracksFat, type DailyTarget,
} from '@/lib/nutrition/dailyTargets'
import { useDailyTarget } from '@/lib/hooks/useDailyTargets'

/**
 * The ONE answer to "what are today's nutrition goals?".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Three surfaces asked the question and got three different answers.
 *
 *  1. `/nutrition` seeded local state with a hard-coded `1955` — a number that
 *     appears nowhere else in the codebase and disagrees with the cut preset's
 *     own `1950`. Until `user_goals` resolved, every ring on the page was graded
 *     against a goal that had never been anyone's.
 *  2. On that same page, `MacroCards` and `NutritionLogList` read that healed
 *     local state while `MacroProgressChart` read the raw `user_goals` row. The
 *     two disagreed for as long as the heal took — and permanently, whenever the
 *     stored row had drifted from its preset.
 *  3. `/day/<date>` ignored goals entirely: its three macro rings were drawn
 *     against literal `200` / `60` / `180`.
 *
 * A goal the user set in Settings and a goal the app grades them against must be
 * the same number. That is the whole contract here.
 *
 * ── RESOLUTION ORDER ─────────────────────────────────────────────────────────
 * The active LEVER → `plan_phase_goals` override → `phaseGoalsFor(plan, phase)`
 * → the stored `user_goals` row. The first two are one step: `usePlanPhaseGoals().resolve`
 * already merges the user's per-(plan, phase) edits over the plan default, so
 * the numbers a user typed in Settings → Plan & Phase are what comes back.
 *
 * The preset outranks the stored row deliberately, and this is the same rule
 * `/nutrition`'s auto-heal already enforced by writing the preset BACK to the
 * row. Selecting a phase is how you set your goals; `user_goals` is a cache of
 * that decision, and a cache does not get to outvote its source.
 *
 * The row still answers when there is no phase at all (an account that never
 * picked one), which is the only case where it holds something the plan cannot
 * derive.
 */
export interface ActiveNutritionGoals {
  calorie: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiberMin: number | null
  fiberMax: number | null
  /**
   * The day's step target, resolved through the same chain as the food.
   *
   * It lives here because it is a LEVER field — a rung is one named combination
   * of eat-less and move-more, and the maintenance week moves both. The
   * dashboard and the widget were reading `user_goals.steps_goal` raw while the
   * scorer graded against the rung, so the tile said 10,000 and the score said
   * 7,500 about the same afternoon.
   */
  steps: number | null
  /** Null only when no phase has ever been chosen. */
  mode: NutritionMode | null
  /** Which source won — surfaced so the UI can explain a number if it has to. */
  source: 'daily' | 'lever' | 'plan-phase' | 'user-row' | 'default'
  /** The rung in force, when one is. Null means no lever was selected. */
  lever: LeverId | null
  /**
   * Did a per-day override contribute any of these figures?
   *
   * Separate from `source` on purpose: an override is partial by design (raise
   * the calories, leave protein alone), so "the day had an override" and "the
   * override supplied every number" are different claims and the UI needs the
   * first one to show its badge.
   */
  dayOverride: boolean
  /**
   * Which named profile the day was given — "home", "restaurant" — or null.
   *
   * A label the UI can show, never a rule: the figures above are the SNAPSHOT
   * taken when the profile was applied, so this cannot be used to re-derive
   * them. See `profiles.ts`.
   */
  profileKey: string | null
  /**
   * Is this macro graded today?
   *
   * `false` only on a day that explicitly untracked it — a restaurant day, where
   * the split is not knowable and grading it against an inherited figure would
   * invent a miss out of nothing. The corresponding target above is `null` on
   * such a day, which is what actually makes the scorer skip it; these two exist
   * so a SURFACE can tell "no target was set" from "no target should exist", and
   * print "not tracked" rather than an em-dash.
   */
  trackCarbs: boolean
  trackFat: boolean
}

type GoalsRow = Pick<Tables<'user_goals'>, 'calorie_goal' | 'protein_goal_g' | 'carbs_goal_g' | 'fat_goal_g' | 'goal_preset'> & {
  /**
   * OPTIONAL because the column is newer than the type: `active_lever` reads as
   * `undefined` on a database that has not had the one line of DDL applied, and
   * everything downstream then behaves exactly as it did before levers existed.
   */
  active_lever?: string | null
  /** Optional for the same reason a caller may hold a partial row: absent → the preset answers. */
  steps_goal?: number | null
}

/**
 * Pure resolver — the hook is a thin wrapper so this can be tested without a
 * QueryClient, a plan cache, or a browser.
 */
export function resolveNutritionGoals(
  row: GoalsRow | null | undefined,
  preset: NutritionPreset,
  mode: NutritionMode | null,
  /** The active phase lever, when one is selected. Outranks everything below. */
  leverId?: string | null,
  /**
   * This DAY's own override — the one layer above the rung, and the only one
   * allowed to speak for a finished day. See `dailyTargets.ts`.
   */
  dayTarget?: DailyTarget | null,
): ActiveNutritionGoals {
  const base = resolveBaseGoals(row, preset, mode, leverId)
  if (!hasDailyTarget(dayTarget)) {
    return { ...base, dayOverride: false, profileKey: null, trackCarbs: true, trackFat: true }
  }
  const merged = applyDailyTarget(
    { calorie: base.calorie, protein: base.protein, carbs: base.carbs, fat: base.fat, steps: base.steps },
    dayTarget,
  )
  return {
    ...base,
    calorie: merged.calorie,
    protein: merged.protein,
    carbs: merged.carbs,
    fat: merged.fat,
    steps: merged.steps,
    source: 'daily',
    dayOverride: true,
    profileKey: dayTarget?.profile_key ?? null,
    trackCarbs: tracksCarbs(dayTarget),
    trackFat: tracksFat(dayTarget),
  }
}

function resolveBaseGoals(
  row: GoalsRow | null | undefined,
  preset: NutritionPreset,
  mode: NutritionMode | null,
  leverId?: string | null,
// All four omitted fields are facts about the DAY's own override, not about
// the rung underneath it — a lever has no profile and grades every macro — so
// the base resolver never has an opinion on them.
): Omit<ActiveNutritionGoals, 'dayOverride' | 'profileKey' | 'trackCarbs' | 'trackFat'> {
  // ── THE LEVER IS THE TOP LAYER ─────────────────────────────────────────────
  // Not because it is the most authoritative source of nutrition science, but
  // because it is the only layer BOTH sides can resolve identically: the server
  // scorer reads `user_goals.active_lever` and has no access to your per-phase
  // overrides. See the note in `levers.ts` — a goal displayed and a goal graded
  // that disagree is worse than either ordering.
  const lever = leverById(leverId)
  if (lever) {
    return {
      calorie: lever.calorieGoal,
      protein: lever.proteinGoalG,
      carbs: lever.carbsGoalG,
      fat: lever.fatGoalG,
      fiberMin: preset.fiberMin ?? null,
      fiberMax: preset.fiberMax ?? null,
      steps: lever.stepsGoal,
      mode,
      source: 'lever',
      lever: lever.id,
    }
  }

  if (mode) {
    return {
      calorie: preset.calorieGoal,
      protein: preset.proteinGoalG,
      carbs: preset.carbsGoalG,
      fat: preset.fatGoalG,
      fiberMin: preset.fiberMin ?? null,
      fiberMax: preset.fiberMax ?? null,
      steps: preset.stepsGoal ?? row?.steps_goal ?? null,
      mode,
      source: 'plan-phase',
      lever: null,
    }
  }
  // No phase chosen. A stored row is a real decision someone made; honour it.
  // `> 0` and not `!= null`: a zero calorie goal is a broken row, not a fast.
  if (row && typeof row.calorie_goal === 'number' && row.calorie_goal > 0) {
    return {
      calorie: row.calorie_goal,
      protein: row.protein_goal_g ?? null,
      carbs: row.carbs_goal_g ?? null,
      fat: row.fat_goal_g ?? null,
      fiberMin: preset.fiberMin ?? null,
      fiberMax: preset.fiberMax ?? null,
      steps: row.steps_goal ?? preset.stepsGoal ?? null,
      mode: null,
      source: 'user-row',
      lever: null,
    }
  }
  // Nothing anywhere: the active plan's cut numbers, never a literal.
  return {
    calorie: preset.calorieGoal,
    protein: preset.proteinGoalG,
    carbs: preset.carbsGoalG,
    fat: preset.fatGoalG,
    fiberMin: preset.fiberMin ?? null,
    fiberMax: preset.fiberMax ?? null,
    steps: preset.stepsGoal ?? null,
    mode: null,
    source: 'default',
    lever: null,
  }
}

export function useNutritionGoals(): ActiveNutritionGoals {
  return useNutritionGoalsFor(logicalTodayISO())
}

/**
 * The same answer, for ANY date.
 *
 * ── WHY A DATE PARAMETER AND NOT A SECOND RESOLVER ───────────────────────────
 * `/day/[date]` is the app's retroactive surface: it is where a finished day's
 * nutrition context is tagged, and now where a finished day is given its shape.
 * It cannot use the today-only hook — a Tuesday opened on a Friday would show
 * Friday's rung and Friday's override, and applying "Restaurant" from it would
 * appear to do nothing.
 *
 * `leverForDate` already takes the date and today SEPARATELY for exactly this
 * reason: the rung a past day was eaten under comes from the schedule, never
 * from the selection sitting in `user_goals` now. This passes both, so a past
 * day resolves against what was actually in force.
 */
export function useNutritionGoalsFor(date: string): ActiveNutritionGoals {
  // The plan id lives in localStorage, which React cannot see change. Without
  // this subscription, switching plans in Settings leaves every macro ring in
  // the app grading against the OLD plan until a full reload.
  void useScheduleVersion()
  const { data: row } = useUserGoals()
  const { resolve } = usePlanPhaseGoals()

  const planId = getActiveProgramId()
  const mode = (row?.goal_preset as NutritionMode | null) ?? null
  // `phaseGoalsFor` is the floor when no phase is set, so the "no data anywhere"
  // branch still returns this plan's numbers rather than a magic constant.
  const preset = mode ? resolve(planId, mode) : phaseGoalsFor(planId, 'cut')

  // The rung in force TODAY — your stored selection when there is one, else the
  // one `LEVER_SCHEDULE` puts on today's date. The schedule fallback is what
  // makes a database that never ran the `active_lever` DDL still show 1,885
  // from 16 Aug, and it is the same resolution the server scorer performs, so
  // the goal displayed and the goal graded cannot diverge.
  const today = logicalTodayISO()
  const maintenanceUntil = (row as { maintenance_until?: string | null } | null)?.maintenance_until ?? null
  const { data: dayTarget } = useDailyTarget(date)
  return resolveNutritionGoals(
    row ?? null, preset, mode,
    leverForDate(date, activeLeverOf(row), today, maintenanceUntil),
    dayTarget ?? null,
  )
}
