'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

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

export interface RoutineMemoryEntry { weightKg: number; reps: number }

/**
 * Top working set per (routine, exercise) — powers the "Previous: Xkg × Y" chip
 * in the week plan.
 *
 * ROUTINE-SCOPED. This replaced `useExerciseMemory`, which keyed on exercise_id
 * ALONE: Seated Leg Curl on Legs A and Legs B collapsed into one memory, so the
 * chip showed whichever day you happened to train last and the two routines
 * appeared to contaminate each other. Warm-ups are excluded — a light opener is
 * not a baseline.
 *
 * Returns TUPLES, not a Map. JSON has no Map: it dehydrates to `{}` and
 * rehydrates without `.get()`, which is the crash family documented in
 * QueryProvider. Callers rebuild the Map in a `useMemo` (see `routineMemoryMap`).
 */
export function useRoutineMemory(dayKeys: string[]) {
  const keys = [...dayKeys].sort()
  return useQuery({
    queryKey: ['workout_sets', 'routine_memory', keys.join('|')],
    enabled: keys.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Array<[string, RoutineMemoryEntry]>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, set_type, workout_sessions!inner(day_key)')
        .in('workout_sessions.day_key', keys)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const rows = (data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number; set_type: string | null
        workout_sessions: { day_key: string | null }
      }>
      // Newest-first, so the first hit per key IS the most recent.
      const seen = new Map<string, RoutineMemoryEntry>()
      for (const r of rows) {
        if (r.set_type === 'warmup') continue
        const dk = r.workout_sessions.day_key
        if (!dk) continue
        const k = `${dk}|${r.exercise_id}`
        if (!seen.has(k)) seen.set(k, { weightKg: r.weight_kg, reps: r.reps })
      }
      return [...seen]
    },
  })
}

/** Lookup map for `useRoutineMemory`, keyed `${dayKey}|${exerciseId}`. */
export function routineMemoryMap(
  rows: Array<[string, RoutineMemoryEntry]> | undefined,
): Map<string, RoutineMemoryEntry> {
  return new Map(Array.isArray(rows) ? rows : [])
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
