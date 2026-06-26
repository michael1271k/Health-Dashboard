'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export function useWeightTrend(days = 30) {
  return useQuery({
    queryKey: ['body_composition', 'trend', days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('body_composition')
        .select('date, weight_kg, body_fat_pct')
        .gte('date', daysAgo(days))
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Pick<Tables<'body_composition'>, 'date' | 'weight_kg' | 'body_fat_pct'>[]
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

export function usePRHistory(exerciseId?: string, days = 60) {
  return useQuery({
    queryKey: ['workout_sets', 'pr_history', exerciseId, days],
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
        .gte('workout_sessions.started_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('workout_sessions.started_at', { ascending: true })

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
      } else {
        // Default: compound lifts only
        query = query.eq('exercises.is_compound', true)
      }

      const { data, error } = await query
      if (error) throw error

      return ((data ?? []) as unknown as Array<{
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
        date: row.workout_sessions.started_at.slice(0, 10),
        est_1rm_kg: row.est_1rm_kg ?? epley1RM(row.weight_kg, row.reps),
        weight_kg: row.weight_kg,
        reps: row.reps,
      })) satisfies PRRow[]
    },
    enabled: true,
  })
}

// Epley formula: 1RM estimate
export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
