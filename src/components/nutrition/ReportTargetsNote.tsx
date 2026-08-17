'use client'

import { useReportTargets } from '@/lib/hooks/useReportTargets'
import { useWeekActuals } from '@/lib/hooks/useWeekActuals'
import { targetRows, type WeekActuals } from '@/lib/reports/targetVerdict'
import { TargetsVsActual } from '@/components/dashboard/TargetsVsActual'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf } from '@/lib/utils/week'

/**
 * The nutrition half of the last report's prescription, on the nutrition page.
 *
 * The dashboard shows all of it; this shows the three rows this surface can
 * actually change — hydration, intake, protein — because a step target on the
 * nutrition page is a row you cannot act on from here.
 *
 * Renders nothing when no report was pasted, or when the one that was said
 * nothing about food.
 */
const NUTRITION_KEYS = new Set(['water', 'calories', 'protein'])

const EMPTY: WeekActuals = { waterL: null, steps: null, kcal: null, proteinG: null }

export function ReportTargetsNote() {
  const today = logicalTodayISO()
  const { targets, weekStart } = useReportTargets()
  const { data: actuals } = useWeekActuals(weekStartOf(today, 0), today)

  const rows = targetRows(targets, actuals ?? EMPTY, today).filter((r) => NUTRITION_KEYS.has(r.key))
  if (!rows.length) return null

  return <TargetsVsActual rows={rows} weekStart={weekStart} />
}
