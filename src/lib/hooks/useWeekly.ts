'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface ReportRow {
  id: string
  period_start: string
  period_end: string
  content_md: string
  created_at: string
  notion_page_id: string | null
}

export function useReports() {
  return useQuery({
    queryKey: ['reports', 'list'],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, period_start, period_end, content_md, created_at, notion_page_id')
        .order('period_start', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as ReportRow[]
    },
    staleTime: 60_000,
  })
}

export interface MonthActivity {
  workoutDates: Set<string>
  dataDates: Set<string>
}

/** Dates (YYYY-MM-DD) in [from,to] that have a workout / any logged score. */
export function useMonthActivity(from: string, to: string) {
  return useQuery({
    queryKey: ['month_activity', from, to],
    queryFn: async (): Promise<MonthActivity> => {
      const [{ data: sessions }, { data: scores }] = await Promise.all([
        supabase.from('workout_sessions').select('started_at')
          .gte('started_at', `${from}T00:00:00Z`).lt('started_at', `${to}T23:59:59Z`),
        supabase.from('daily_scores').select('date').gte('date', from).lte('date', to),
      ])
      const workoutDates = new Set<string>(
        ((sessions ?? []) as Array<{ started_at: string }>).map((s) => s.started_at.slice(0, 10)),
      )
      const dataDates = new Set<string>(
        ((scores ?? []) as Array<{ date: string }>).map((s) => s.date),
      )
      return { workoutDates, dataDates }
    },
    staleTime: 60_000,
  })
}
