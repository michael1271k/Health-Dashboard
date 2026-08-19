'use client'

import { useUserGoals } from '@/lib/hooks/useDashboard'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { getActiveProgramId } from '@/lib/programs'
import { phaseGoalsFor, type NutritionMode, type NutritionPreset } from '@/lib/types/workout'
import type { Tables } from '@/lib/supabase/types'
import { leverById, activeLeverOf, leverForDate, type LeverId } from '@/lib/nutrition/levers'
import { logicalTodayISO } from '@/lib/utils/day'

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
  /** Null only when no phase has ever been chosen. */
  mode: NutritionMode | null
  /** Which source won — surfaced so the UI can explain a number if it has to. */
  source: 'lever' | 'plan-phase' | 'user-row' | 'default'
  /** The rung in force, when one is. Null means no lever was selected. */
  lever: LeverId | null
}

type GoalsRow = Pick<Tables<'user_goals'>, 'calorie_goal' | 'protein_goal_g' | 'carbs_goal_g' | 'fat_goal_g' | 'goal_preset'> & {
  /**
   * OPTIONAL because the column is newer than the type: `active_lever` reads as
   * `undefined` on a database that has not had the one line of DDL applied, and
   * everything downstream then behaves exactly as it did before levers existed.
   */
  active_lever?: string | null
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
): ActiveNutritionGoals {
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
    mode: null,
    source: 'default',
    lever: null,
  }
}

export function useNutritionGoals(): ActiveNutritionGoals {
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
  return resolveNutritionGoals(row ?? null, preset, mode, leverForDate(today, activeLeverOf(row), today))
}
