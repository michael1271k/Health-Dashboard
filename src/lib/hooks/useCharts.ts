'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'
import { epley1RM } from '@/lib/utils/epley'
import { validWeight } from '@/lib/utils/units'
import { eraForDate } from '@/lib/programs'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export function useWeightTrend(days = 90) {
  return useQuery({
    queryKey: ['body_composition', 'trend', days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('body_composition')
        .select('date, weight_kg, body_fat_pct, muscle_mass_kg')
        .gte('date', daysAgo(days))
        .order('date', { ascending: true })
      if (error) throw error
      // Global rule: sub-50kg readings are artifacts — drop the row entirely.
      return ((data ?? []) as Pick<Tables<'body_composition'>, 'date' | 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg'>[])
        .filter((r) => validWeight(r.weight_kg) != null)
    },
  })
}

export type VolumePoint = { date: string; volume: number; split: string }

export function useVolumeTrend(days = 90) {
  return useQuery({
    queryKey: ['workout_sessions', 'volume_trend', days],
    queryFn: async (): Promise<VolumePoint[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('started_at, total_volume_kg, split_day, notes')
        .gte('started_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('started_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as Array<{ started_at: string; total_volume_kg: number | null; split_day: string; notes: string | null }>)
        .filter((r) => r.total_volume_kg != null && !r.notes?.startsWith('__seed_'))
        .map((r) => ({ date: r.started_at.slice(0, 10), volume: Math.round(r.total_volume_kg as number), split: r.split_day }))
    },
  })
}

export function useMacroHistory(days = 14) {
  return useQuery({
    queryKey: ['nutrition_entries', 'history', days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_entries')
        .select('date, calories, protein_g, carbs_g, fat_g')
        .eq('meal_type', 'daily')
        .gte('date', daysAgo(days))
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Pick<Tables<'nutrition_entries'>, 'date' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]
    },
  })
}

export type PRRow = {
  exercise_id: string
  exercise_name: string
  date: string
  est_1rm_kg: number
  weight_kg: number
  reps: number
}

export type PRRawRow = PRRow & { startedAt: string }

/**
 * Collapse per-set rows to ONE point per (exercise, session): the TOP set's
 * est-1RM. Plotting every set made a single session's top set then its back-off
 * sets read as a strength DROP (the "76→59kg" ghost). Result is sorted by date.
 */
export function collapseToSessionBest(rows: PRRawRow[]): PRRow[] {
  const best = new Map<string, PRRow>()
  for (const r of rows) {
    const key = `${r.exercise_id}|${r.startedAt}`
    const cur = best.get(key)
    if (!cur || r.est_1rm_kg > cur.est_1rm_kg) {
      best.set(key, {
        exercise_id: r.exercise_id, exercise_name: r.exercise_name,
        date: r.date, est_1rm_kg: r.est_1rm_kg, weight_kg: r.weight_kg, reps: r.reps,
      })
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function usePRHistory(exerciseId?: string, days = 180, era: 'all' | 'ppl' | 'axis' = 'all') {
  return useQuery({
    queryKey: ['workout_sets', 'pr_history', exerciseId, days, era],
    queryFn: async () => {
      let query = supabase
        .from('workout_sets')
        .select(`
          exercise_id,
          weight_kg,
          reps,
          est_1rm_kg,
          is_pr,
          exercises!inner(name),
          workout_sessions!inner(started_at)
        `)
        // NOTE: no server-side order — PostgREST rejects ordering the parent
        // rows by an embedded column ("failed to parse order"), which made
        // this whole query 400 and left PR history silently empty. Rows are
        // sorted client-side by date below.
        .gte('workout_sessions.started_at', new Date(Date.now() - days * 86400000).toISOString())

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
      } else {
        // Default: compound lifts only
        query = query.eq('exercises.is_compound', true)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string
        weight_kg: number
        reps: number
        est_1rm_kg: number | null
        is_pr: boolean
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>).map((row) => ({
        exercise_id: row.exercise_id,
        exercise_name: row.exercises.name,
        startedAt: row.workout_sessions.started_at,
        date: row.workout_sessions.started_at.slice(0, 10),
        est_1rm_kg: row.est_1rm_kg ?? epley1RM(row.weight_kg, row.reps),
        weight_kg: row.weight_kg,
        reps: row.reps,
      }))
        .filter((row) => era === 'all' || eraForDate(row.date) === era)

      // GHOST-DATA FIX: one point per (exercise, session) — the TOP set's est-1RM.
      return collapseToSessionBest(rows) satisfies PRRow[]
    },
    enabled: true,
  })
}

// Epley formula: re-exported from server-safe utility module
export { epley1RM } from '@/lib/utils/epley'
