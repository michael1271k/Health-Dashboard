'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface ReportPayload {
  volumeKg: number
  sets: number
  prs: number
  calories: number
  durationMin: number
  sessions: number
  weightDelta: number | null
  fatDelta: number | null
  days: Array<{ date: string; label: string; volumeKg: number | null; prs: number | null }>
  verdict?: string
}
export interface ReportRow {
  id: string
  kind: string
  week_start: string
  week_number: number
  payload: ReportPayload
  created_at: string
}

/** Saved reports, newest first. Degrades to [] before the `reports` table exists. */
export function useReports() {
  return useQuery({
    queryKey: ['reports', 'list'],
    staleTime: 60_000,
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase.from('reports')
        .select('id, kind, week_start, week_number, payload, created_at')
        .order('week_start', { ascending: false })
      if (error) return []
      return (data ?? []) as ReportRow[]
    },
  })
}

export function useSaveReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { kind: string; week_start: string; week_number: number; payload: ReportPayload }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      // Upsert on (user, kind, week_start) so re-generating a week overwrites.
      const { error } = await supabase.from('reports')
        .upsert({ user_id: user.id, ...row } as unknown as never, { onConflict: 'user_id,kind,week_start' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}

export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}
