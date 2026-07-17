'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

// Map from exercise_id (UUID) → { weightKg, reps } from the most recent session
export type LastSetsMap = Map<string, { weightKg: number; reps: number }>

/** exercise NAME → id, so program templates (programs.ts) can resolve DB exercise rows. */
export function useExerciseMap() {
  return useQuery({
    queryKey: ['exercises', 'byName'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('exercises').select('id, name')
      if (error) throw error
      const m = new Map<string, string>()
      for (const e of (data ?? []) as Array<{ id: string; name: string }>) m.set(e.name, e.id)
      return m
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Most recent set per exercise across all sessions — powers the "Previous: Xkg × Y" memory. */
export function useExerciseMemory() {
  return useQuery({
    queryKey: ['workout_sets', 'memory'],
    queryFn: async (): Promise<LastSetsMap> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, created_at')
        .order('created_at', { ascending: false })
        .limit(800)
      if (error) throw error
      const rows = (data ?? []) as Array<{ exercise_id: string; weight_kg: number; reps: number }>
      const map: LastSetsMap = new Map()
      for (const r of rows) {
        if (!map.has(r.exercise_id)) map.set(r.exercise_id, { weightKg: r.weight_kg, reps: r.reps })
      }
      return map
    },
    staleTime: 60_000,
  })
}

/** The most recent session's coach flag — the hero's "next session" action item. */
export function useLatestSessionFlag() {
  return useQuery({
    queryKey: ['workout_sessions', 'latest_flag'],
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('next_session_flag')
        .order('started_at', { ascending: false })
        .limit(5)
      if (error) return null
      const rows = (data ?? []) as Array<{ next_session_flag: string | null }>
      return rows.map((r) => r.next_session_flag).find((f) => !!f) ?? null
    },
  })
}
