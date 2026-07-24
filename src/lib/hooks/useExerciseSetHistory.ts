'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, type Era } from '@/lib/programs'

export interface ExerciseHistory {
  date: string                                    // most recent session date
  sets: Array<{ weightKg: number; reps: number }> // that session's full set list, in order
}

/**
 * Previous-session memory for the Command Center deck: the most recent FULL
 * set list per exercise name — richer than useExerciseMemory's single top set,
 * so "Prev: 36 × 12/11/10 · Jul 12" renders beside today's inputs.
 * Era-aware: a HELIX draft never shows PPL-legacy numbers as its baseline.
 */
export function useExerciseSetHistory(names: string[], era?: Era) {
  const key = [...names].sort().join('|')
  return useQuery({
    queryKey: ['workout_sets', 'deck_history', key, era ?? 'all'],
    enabled: names.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ExerciseHistory>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, set_number, set_type, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercises.name', names)
        .order('created_at', { ascending: false })
        // 2000, not 600: this now SEEDS the logger, and a low cap silently
        // dropped rarely-trained lifts out of the window — they then fell back
        // to the program's cold-start numbers, which read as "arbitrary data".
        .limit(2000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        weight_kg: number; reps: number; set_number: number; set_type: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>)
        // Warm-ups are not a working baseline — seeding from one under-loads
        // the whole deck.
        .filter((r) => r.set_type !== 'warmup')

      const out = new Map<string, ExerciseHistory>()
      for (const r of rows) {
        const date = r.workout_sessions.started_at.slice(0, 10)
        if (era && eraForDate(date) !== era) continue
        const name = r.exercises.name
        const existing = out.get(name)
        if (!existing) {
          out.set(name, { date, sets: [{ weightKg: r.weight_kg, reps: r.reps }] })
        } else if (existing.date === date) {
          existing.sets.push({ weightKg: r.weight_kg, reps: r.reps })
        }
        // rows are newest-first, so a different (older) date for a known name is skipped
      }
      // set order within the session: rows arrived newest-first — restore 1..n
      for (const h of out.values()) h.sets.reverse()
      return out
    },
  })
}
