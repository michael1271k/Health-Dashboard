'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO, logicalTodayISO } from '@/lib/utils/day'

export interface SleepDebt {
  debtHours: number          // cumulative decayed shortfall vs goal (≥ 0)
  nights: number             // nights with data in the window
  worstNightMin: number | null
  goalHours: number
}

export const SLEEP_DEBT_WINDOW_DAYS = 14
export const SLEEP_DEBT_WEEKLY_DECAY = 0.75  // last week's debt keeps 75% weight

/**
 * Pure sleep-debt math (exported for tests): decayed cumulative shortfall vs
 * the goal over a 14-night window. Surplus nights repay debt but never bank
 * "credit" below zero. Older week decays by SLEEP_DEBT_WEEKLY_DECAY.
 */
export function computeSleepDebt(
  nights: Array<{ date: string; sleepMinutes: number | null }>,
  goalHours: number,
): SleepDebt {
  const withData = nights.filter((n) => n.sleepMinutes != null && n.sleepMinutes > 0)
  // Oldest → newest so decay applies chronologically.
  const asc = [...withData].sort((a, b) => a.date.localeCompare(b.date))
  const weekAgo = logicalDaysAgoISO(7)
  let debt = 0
  let worst: number | null = null
  for (const n of asc) {
    const mins = n.sleepMinutes as number
    if (worst == null || mins < worst) worst = mins
    const deltaH = goalHours - mins / 60          // + = shortfall, − = surplus
    const weight = n.date < weekAgo ? SLEEP_DEBT_WEEKLY_DECAY : 1
    debt = Math.max(0, debt + deltaH * weight)    // surplus repays, never banks credit
  }
  return { debtHours: Math.round(debt * 10) / 10, nights: withData.length, worstNightMin: worst, goalHours }
}

/** Rolling 14-night Sleep Debt Bank from daily_logs + user goal. */
export function useSleepDebt() {
  return useQuery({
    queryKey: ['sleep_debt'],
    queryFn: async (): Promise<SleepDebt> => {
      const [logsRes, goalsRes] = await Promise.all([
        supabase.from('daily_logs').select('date, sleep_minutes')
          .gte('date', logicalDaysAgoISO(SLEEP_DEBT_WINDOW_DAYS)).lte('date', logicalTodayISO()),
        supabase.from('user_goals').select('sleep_goal_hours').maybeSingle(),
      ])
      const goalHours = ((goalsRes.data as { sleep_goal_hours: number | null } | null)?.sleep_goal_hours) ?? 8
      const nights = ((logsRes.data ?? []) as Array<{ date: string; sleep_minutes: number | null }>)
        .map((r) => ({ date: r.date, sleepMinutes: r.sleep_minutes }))
      return computeSleepDebt(nights, goalHours)
    },
    staleTime: 5 * 60_000,
  })
}
