'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'

export interface CardioLog {
  id: string
  kind: string          // walk | run
  distance_m: number | null
  duration_min: number | null
  kcal: number | null
  from_healthkit: boolean
}

export interface NewCardio {
  kind: 'walk' | 'run'
  distance_m: number | null
  duration_min: number | null
  kcal: number | null
}

/** Manual cardio (walk/run) logged for a day. A SEPARATE ledger from Active
 *  Energy — deliberately never summed into it, so nothing double-counts. */
export function useCardioLogs(date: string) {
  return useQuery({
    queryKey: ['cardio_logs', date],
    enabled: !!date,
    queryFn: async (): Promise<CardioLog[]> => {
      const { data, error } = await supabase
        .from('cardio_logs')
        .select('id, kind, distance_m, duration_min, kcal, from_healthkit')
        .eq('date', date)
        .order('created_at', { ascending: true })
      if (error) return [] // table not migrated yet
      return (data ?? []) as CardioLog[]
    },
    staleTime: 30_000,
  })
}

export function useAddCardio(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NewCardio) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const { error } = await supabase.from('cardio_logs').insert({
        user_id: session.user.id, date, kind: c.kind,
        distance_m: c.distance_m, duration_min: c.duration_min, kcal: c.kcal,
        from_healthkit: false,
      } as unknown as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cardio_logs', date] }),
  })
}

export function useDeleteCardio(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cardio_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cardio_logs', date] }),
  })
}

/** Zone-2 target = 2 steady cardio sessions per week (the plan's rest-day work). */
export const ZONE2_WEEKLY_TARGET = 2
/** A session counts as Zone-2 when it's a steady ≥ 20 min effort (excludes the
 *  5-min treadmill warm-up); anything shorter isn't a Zone-2 block. */
const ZONE2_MIN_MINUTES = 20

/** How many Zone-2 sessions have been logged in the week containing `date`. */
export function useZone2Week(date: string) {
  return useQuery({
    queryKey: ['cardio_logs', 'zone2_week', weekStartOf(date)],
    enabled: !!date,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const from = weekStartOf(date)
      const to = isoAddDays(from, 7)
      const { data, error } = await supabase
        .from('cardio_logs')
        .select('duration_min')
        .gte('date', from).lt('date', to)
      if (error) return 0 // table not migrated yet
      return (data ?? []).filter((r) => ((r as { duration_min: number | null }).duration_min ?? 0) >= ZONE2_MIN_MINUTES).length
    },
  })
}
