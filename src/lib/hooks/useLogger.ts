'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { SaveWorkoutPayload, SplitDay } from '@/lib/types/workout'
import type { Tables } from '@/lib/supabase/types'

export function useExercises(splitDay: SplitDay | null) {
  return useQuery({
    queryKey: ['exercises', splitDay],
    queryFn: async () => {
      if (!splitDay) return []
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('split_day', splitDay)
        .order('is_compound', { ascending: false })  // compounds first
        .order('name')
      if (error) throw error
      return (data ?? []) as Tables<'exercises'>[]
    },
    enabled: !!splitDay,
    staleTime: 5 * 60 * 1000,  // exercises don't change often
  })
}

export function useRecentSessions(limit = 5) {
  return useQuery({
    queryKey: ['workout_sessions', 'recent', limit],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const json = await res.json() as { sessions: Array<{
        id: string
        started_at: string
        split_day: string
        total_volume_kg: number | null
        notes: string | null
        notion_page_id: string | null
      }> }
      return json.sessions.slice(0, limit)
    },
    staleTime: 60_000,
  })
}

export interface SaveResult {
  sessionId: string
  notionPageId: string | null
  totalVolumeKg: number
  newPRs: Array<{ exerciseName: string; est1rm: number }>
}

export function useSaveSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SaveWorkoutPayload): Promise<SaveResult> => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Save failed')
      }
      return res.json() as Promise<SaveResult>
    },
    onSuccess: () => {
      // Invalidate relevant queries so dashboard + charts refresh
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
      qc.invalidateQueries({ queryKey: ['workout_sets', 'pr_history'] })
    },
  })
}
