'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO } from '@/lib/utils/day'
import { validWeight } from '@/lib/utils/units'

export interface BioDay {
  date: string
  sleepMin: number | null
  steps: number | null
  weightKg: number | null
}

/** Last 7 logical days of daily_logs (ascending) — powers the strip sparklines. */
export function useBioSeries() {
  return useQuery({
    queryKey: ['daily_logs', 'bio_series'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BioDay[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, sleep_minutes, steps, weight_kg')
        .gte('date', logicalDaysAgoISO(7))
        .order('date', { ascending: true })
      if (error) throw error
      return ((data ?? []) as Array<{ date: string; sleep_minutes: number | null; steps: number | null; weight_kg: number | null }>)
        .map((r) => ({ date: r.date, sleepMin: r.sleep_minutes, steps: r.steps, weightKg: validWeight(r.weight_kg) }))
    },
  })
}
