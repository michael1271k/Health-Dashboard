'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

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
