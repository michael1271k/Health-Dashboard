'use client'

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
  const { data: row } = useUserGoals()
  const today = logicalTodayISO()
  return isMaintenanceDate(
    dateISO || today,
    activeLeverOf(row),
    (row as { maintenance_until?: string | null } | null)?.maintenance_until ?? null,
    today,
  )
}
