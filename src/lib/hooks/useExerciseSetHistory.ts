'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, type Era } from '@/lib/programs'
import { getPreviousSource } from '@/lib/sessions/previousSource'

export interface ExerciseHistory {
  date: string                                    // most recent session date
  /** That session's full working-set list, ordered by set_number (1..n).
   *  `setType: 'failure'` is carried so seeding + the PREV chip reproduce the
   *  exact failure tags from last time. */
  sets: Array<{ weightKg: number; reps: number; setType?: 'failure' }>
}

/**
 * Previous-session memory for the Command Center deck: the most recent FULL
 * set list per exercise name — richer than useExerciseMemory's single top set,
 * so "Prev: 36 × 12/11/10 · Jul 12" renders beside today's inputs.
 * Era-aware: a HELIX draft never shows PPL-legacy numbers as its baseline.
 */
export function useExerciseSetHistory(names: string[], era?: Era, dayKey?: string) {
  const key = [...names].sort().join('|')
  // 'same_routine' scopes "Previous" to the SAME day_key; only meaningful when a
  // dayKey is known (a template/edit deck), otherwise it degrades to 'any'.
  const source = getPreviousSource()
  const scopeKey = source === 'same_routine' && dayKey ? dayKey : null
  return useQuery({
    queryKey: ['workout_sets', 'deck_history', key, era ?? 'all', scopeKey ?? 'any'],
    enabled: names.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ExerciseHistory>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, set_number, set_type, exercises!inner(name), workout_sessions!inner(started_at, day_key)')
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
        workout_sessions: { started_at: string; day_key: string | null }
      }>)
        // Warm-ups are not a working baseline — seeding from one under-loads
        // the whole deck.
        .filter((r) => r.set_type !== 'warmup')
        // 'same_routine': only pull from previous sessions of the SAME routine.
        .filter((r) => !scopeKey || r.workout_sessions.day_key === scopeKey)

      // Rows arrive newest-first (created_at desc) to pick each exercise's most
      // recent session. But WITHIN a session the working sets are batch-inserted
      // and share a created_at, so their relative order here is undefined — the
      // old code appended in that arbitrary order and then blindly `.reverse()`d,
      // which flipped an already-correct list into `11, 12, 12`. Sort by
      // set_number instead: deterministic 1..n regardless of insert timing.
      type Row = { weightKg: number; reps: number; setNumber: number; setType?: 'failure' }
      const acc = new Map<string, { date: string; rows: Row[] }>()
      for (const r of rows) {
        const date = r.workout_sessions.started_at.slice(0, 10)
        if (era && eraForDate(date) !== era) continue
        const name = r.exercises.name
        const row: Row = {
          weightKg: r.weight_kg, reps: r.reps, setNumber: r.set_number,
          ...(r.set_type === 'failure' ? { setType: 'failure' as const } : {}),
        }
        const existing = acc.get(name)
        if (!existing) acc.set(name, { date, rows: [row] })
        else if (existing.date === date) existing.rows.push(row)
        // a different (older) date for a known name is skipped
      }

      const out = new Map<string, ExerciseHistory>()
      for (const [name, { date, rows: setRows }] of acc) {
        const sets = [...setRows]
          .sort((a, b) => a.setNumber - b.setNumber)
          .map(({ weightKg, reps, setType }) => (setType ? { weightKg, reps, setType } : { weightKg, reps }))
        out.set(name, { date, sets })
      }
      return out
    },
  })
}
