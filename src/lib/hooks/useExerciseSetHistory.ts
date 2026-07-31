'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, type Era } from '@/lib/programs'

/** The set tags that round-trip through seeding. Mirrors `DraftSet['setType']`. */
export type HistorySetType = 'warmup' | 'failure' | 'dropset'

export interface ExerciseHistory {
  date: string                                    // most recent session date
  /** That session's FULL set list, ordered by set_number (1..n) — warm-ups
   *  included. The tag is carried so seeding reproduces last time exactly;
   *  callers that need a working-set baseline use `workingSets()`. */
  sets: Array<{ weightKg: number; reps: number; setType?: HistorySetType }>
}

/**
 * The working sets of a history entry — warm-ups removed.
 *
 * Seeding wants the WHOLE list (a warm-up you did last time is a warm-up you'll
 * do again, and its tag must survive the round-trip). Everything that reasons
 * about performance — the PREV chip, the ceiling check, progression — must not
 * see warm-ups, or a light first set drags the baseline down. One helper so the
 * three call sites can't drift apart.
 */
export function workingSets(h: ExerciseHistory | undefined): ExerciseHistory['sets'] {
  if (!h || !Array.isArray(h.sets)) return []
  return h.sets.filter((s) => s.setType !== 'warmup')
}

/**
 * Previous-session memory for the Command Center deck: the most recent FULL
 * set list per exercise name — richer than a single top set, so
 * "Prev: 36 × 12/11/10 · Jul 12" renders beside today's inputs.
 *
 * ROUTINE-SCOPED BY DEFAULT. When `dayKey` is known (any template or edit deck)
 * only prior sessions of that SAME routine count. Doing Seated Leg Curl on both
 * Legs A and Legs B used to blend the two into one "previous", so a 3-set day
 * seeded from a 2-set day and the coach paced you against the wrong session.
 * Unscoped lookup survives only for a free-form paste deck, which has no routine.
 */
export function useExerciseSetHistory(names: string[], era?: Era, dayKey?: string) {
  const key = [...names].sort().join('|')
  const scopeKey = dayKey ?? null
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
        // Only previous sessions of the SAME routine.
        .filter((r) => !scopeKey || r.workout_sessions.day_key === scopeKey)

      // Rows arrive newest-first (created_at desc) to pick each exercise's most
      // recent session. But WITHIN a session the working sets are batch-inserted
      // and share a created_at, so their relative order here is undefined — the
      // old code appended in that arbitrary order and then blindly `.reverse()`d,
      // which flipped an already-correct list into `11, 12, 12`. Sort by
      // set_number instead: deterministic 1..n regardless of insert timing.
      type Row = { weightKg: number; reps: number; setNumber: number; setType?: HistorySetType }
      const TAGS: readonly string[] = ['warmup', 'failure', 'dropset']
      const acc = new Map<string, { date: string; rows: Row[] }>()
      for (const r of rows) {
        const date = r.workout_sessions.started_at.slice(0, 10)
        if (era && eraForDate(date) !== era) continue
        const name = r.exercises.name
        const row: Row = {
          weightKg: r.weight_kg, reps: r.reps, setNumber: r.set_number,
          ...(r.set_type && TAGS.includes(r.set_type) ? { setType: r.set_type as HistorySetType } : {}),
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
