'use client'

import { useMemo } from 'react'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useDailyTargetRange } from '@/lib/hooks/useDailyTargets'
import { resolveNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { getActiveProgramId } from '@/lib/programs'
import { phaseGoalsFor, type NutritionMode } from '@/lib/types/workout'
import { activeLeverOf, goalsForDate, type LeverGoals } from '@/lib/nutrition/levers'
import { applyDailyTarget } from '@/lib/nutrition/dailyTargets'
import { logicalTodayISO } from '@/lib/utils/day'

/** What was asked for on one specific date. */
export type GoalsForDate = (dateISO: string) => LeverGoals

/**
 * The targets in force on EVERY day of a range — one resolver, many dates.
 *
 * ── WHY A HISTORY NEEDED ITS OWN HOOK ────────────────────────────────────────
 * `useNutritionGoals()` answers for today and `useNutritionGoalsFor(date)`
 * answers for one named day. Neither can serve a CHART, which needs the answer
 * for thirty days at once and cannot call a hook per row.
 *
 * So every surface that draws history did the only thing left to it: it took
 * today's number and graded the whole window against it. That is not a rounding
 * error, it is a rewrite of the past. On 30 Aug the maintenance rung came into
 * force and the carbohydrate target went from 206 g to 244 g — and the Macros
 * vs Goal chart immediately re-marked every previously green day of the block
 * yellow, because 206 g of carbohydrate is 100% of a 206 g target and 84% of a
 * 244 g one. Nothing about those days had changed. The same single number ran
 * the 7-day adherence read, which is how a week of hit targets became 14%.
 *
 * `leverForDate` has always known the real answer per day: the past belongs to
 * `LEVER_SCHEDULE`, today and after belong to your current selection. This hook
 * is that function plus the two layers around it — the plan/phase fallback
 * underneath, the `daily_targets` override on top — resolved once for a whole
 * window, so a chart can ask per bar.
 *
 * ── THE ORDER IS THE SAME ORDER, DELIBERATELY ────────────────────────────────
 * daily override → rung → plan/phase preset → stored row. Identical to
 * `resolveNutritionGoals`, and the base is literally computed BY it (with no
 * lever, so it yields the fallback an open `custom` stretch resolves to). A
 * second implementation of the ladder is a second thing to drift, and this
 * layer's whole purpose is that a finished day is graded by exactly the numbers
 * it was graded by at the time.
 *
 * ── AND WHY IT TAKES THE DATES RATHER THAN A RANGE ───────────────────────────
 * Callers hold a list of days (the rows of a chart, the days of a log), not a
 * span. Deriving the span here means the one query this makes is always exactly
 * as wide as the data on screen, and a caller cannot ask for the overrides of a
 * window it is not drawing.
 *
 * An empty list issues no query at all and still returns a working resolver —
 * the layers below `daily_targets` are pure and need no fetch.
 */
export function useHistoricalGoals(dates: readonly string[]): GoalsForDate {
  // The plan id lives in localStorage, which React cannot see change — the same
  // subscription `useNutritionGoalsFor` takes, and for the same reason.
  void useScheduleVersion()
  const { data: row } = useUserGoals()
  const { resolve } = usePlanPhaseGoals()

  const span = useMemo(() => {
    let min: string | null = null
    let max: string | null = null
    for (const d of dates) {
      if (!d) continue
      if (min == null || d < min) min = d
      if (max == null || d > max) max = d
    }
    return min && max ? { from: min, to: max } : null
  }, [dates])

  const { data: overrides } = useDailyTargetRange(
    span?.from ?? '1970-01-01',
    span?.to ?? '1970-01-01',
    span != null,
  )

  const planId = getActiveProgramId()
  const mode = (row?.goal_preset as NutritionMode | null) ?? null
  const preset = mode ? resolve(planId, mode) : phaseGoalsFor(planId, 'cut')
  const storedLever = activeLeverOf(row)
  const maintenanceUntil = (row as { maintenance_until?: string | null } | null)?.maintenance_until ?? null

  return useMemo(() => {
    // No lever: this is what a date resolves to when neither the schedule nor
    // your selection names a rung, which is exactly `goalsForDate`'s fallback.
    const base = resolveNutritionGoals(row ?? null, preset, mode, null, null)
    const fallback: LeverGoals = {
      calorie: base.calorie, protein: base.protein, carbs: base.carbs, fat: base.fat, steps: base.steps,
    }
    const today = logicalTodayISO()
    return (dateISO: string): LeverGoals => applyDailyTarget(
      goalsForDate(dateISO, storedLever, today, fallback, maintenanceUntil),
      overrides?.get(dateISO) ?? null,
    )
  }, [row, preset, mode, storedLever, maintenanceUntil, overrides])
}
