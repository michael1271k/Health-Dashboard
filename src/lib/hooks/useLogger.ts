'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { SaveWorkoutPayload, SplitDay } from '@/lib/types/workout'
import type { Tables } from '@/lib/supabase/types'

// Map from exercise_id (UUID) → { weightKg, reps } from the most recent session
export type LastSetsMap = Map<string, { weightKg: number; reps: number }>

/**
 * Returns the most recent set per exercise for the given split.
 * "Legs" also includes the legacy "lower" split_day for backward compatibility.
 * Used to pre-fill sliders and show progressive-overload memory.
 */
export function useLastSets(splitDay: SplitDay | null) {
  return useQuery({
    queryKey: ['workout_sets', 'last', splitDay],
    queryFn: async (): Promise<LastSetsMap> => {
      if (!splitDay) return new Map()

      // For legs, also include legacy 'lower' sessions
      const splitDays = splitDay === 'legs' ? ['legs', 'lower'] : [splitDay]

      // 1. Get the most recent session for this split
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .in('split_day', splitDays)
        .order('started_at', { ascending: false })
        .limit(1)

      const session = (sessions ?? []) as Array<{ id: string }>
      if (!session.length) return new Map()

      const sessionId = session[0].id

      // 2. Get all sets from that session
      const { data: setsRaw } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps')
        .eq('session_id', sessionId)

      const sets = (setsRaw ?? []) as Array<{
        exercise_id: string
        weight_kg: number
        reps: number
      }>

      // 3. Dedupe by exercise_id (take first = highest set_number / any from that session)
      const map: LastSetsMap = new Map()
      for (const s of sets) {
        if (!map.has(s.exercise_id)) {
          map.set(s.exercise_id, { weightKg: s.weight_kg, reps: s.reps })
        }
      }
      return map
    },
    enabled: !!splitDay,
    staleTime: 60_000,
  })
}

// All exercises grouped by canonical logger split (lower → legs)
export type GroupedExercises = Record<'upper' | 'legs' | 'push' | 'pull', Tables<'exercises'>[]>

export function useAllExercises() {
  return useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: async (): Promise<GroupedExercises> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('is_compound', { ascending: false })
        .order('name')
      if (error) throw error
      const rows = (data ?? []) as Tables<'exercises'>[]
      const grouped: GroupedExercises = { upper: [], legs: [], push: [], pull: [] }
      for (const ex of rows) {
        const key = ex.split_day === 'lower' ? 'legs' : ex.split_day
        if (key in grouped) grouped[key as keyof GroupedExercises].push(ex)
      }
      return grouped
    },
    staleTime: 5 * 60 * 1000,
  })
}

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
      }> }
      return json.sessions.slice(0, limit)
    },
    staleTime: 60_000,
  })
}

export interface SaveResult {
  sessionId: string
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
