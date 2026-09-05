'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO, logicalTodayISO } from '@/lib/utils/day'

import { computeSleepDebt, SLEEP_DEBT_WINDOW_DAYS, SLEEP_DEBT_WEEKLY_DECAY, type SleepDebt } from '@/lib/sleep/debt'
export { computeSleepDebt, SLEEP_DEBT_WINDOW_DAYS, SLEEP_DEBT_WEEKLY_DECAY, type SleepDebt }

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
