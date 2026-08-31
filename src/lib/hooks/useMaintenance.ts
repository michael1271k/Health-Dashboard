'use client'

import { useCallback } from 'react'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { activeLeverOf } from '@/lib/nutrition/levers'
import { isMaintenanceDate } from '@/lib/nutrition/maintenance'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Is a date inside a maintenance / deload week?
 *
 * ── WHY A HOOK, WHEN `isMaintenanceDate` IS ONE PURE CALL ────────────────────
 * Because the three arguments in front of it are not: the stored rung and its
 * end date live on `user_goals`, and every surface that wanted the answer either
 * re-derived that read or — far more often — did not ask at all. The body-
 * composition dead band is the clearest case: it keyed off a `maintenance`
 * PHASE, so a maintenance week pulled from the lever never reached it, and the
 * one week whose whole purpose is that the scale stops moving was graded as
 * though it should still be falling.
 *
 * The goal row is already cached by the dashboard, so this is a cache read.
 *
 * Defaults to today. Pass a date to ask about a finished week — a report or a
 * timeline node is a statement about the week it names, not about now.
 */
export function useIsMaintenanceDate(dateISO?: string | null): boolean {
  const answer = useMaintenancePredicate()
  return answer(dateISO)
}

/**
 * The same answer, for MANY dates — a chart cannot call a hook per point.
 *
 * ── WHY THE BANDS NEEDED THIS ────────────────────────────────────────────────
 * Surfaces that draw a run of days reached for `maintenanceSpanFor`, which is
 * the PHASE axis alone. That was a defensible shortcut while `PHASES` still
 * carried a one-week `Maintenance Week` row — and that row was deleted on
 * 2026-08-30, when the lever took the week over outright (see `maintenance.ts`).
 * Since then the phase axis has had nothing to say about the current
 * maintenance week, so every consumer of it silently answered "no".
 *
 * That is what put the caution verdict on a deload session: the Session Report
 * asked "is this a maintenance week", the phase axis said no, and the report
 * printed "37% less tonnage, and no load increase to explain it" about a week
 * whose entire instruction was to lift less. The union predicate is the one
 * that knows — lever first, phase as the fallback for the historical deloads
 * that predate levers.
 *
 * Referentially stable while the goal row is, so a `useMemo` keyed on it holds.
 */
export function useMaintenancePredicate(): (dateISO?: string | null) => boolean {
  const { data: row } = useUserGoals()
  const today = logicalTodayISO()
  const lever = activeLeverOf(row)
  const until = (row as { maintenance_until?: string | null } | null)?.maintenance_until ?? null
  return useCallback(
    (dateISO?: string | null) => isMaintenanceDate(dateISO || today, lever, until, today),
    [lever, until, today],
  )
}
