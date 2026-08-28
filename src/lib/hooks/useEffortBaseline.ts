'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { deriveSessionRpe } from '@/lib/training/rpeMemory'

/** How many recent sessions of the same day type form the baseline. */
const WINDOW = 6

/**
 * What this day type usually costs you, as a list of per-set means.
 *
 * ── WHY NOT JUST READ `session_rpe` ──────────────────────────────────────────
 * Because the number being compared against it is a MEAN OF PER-SET RATINGS,
 * and `session_rpe` is a whole-session answer. Those are two different scales —
 * the athlete's per-set mean is 8.86 while his session answers average 7.16 —
 * and comparing one to the other is precisely the category error that made the
 * old suggestion propose 8.9 against an answer of 7.2. The baseline has to be
 * the same quantity as the thing it is a baseline for.
 *
 * So this recomputes each past session's mean through `deriveSessionRpe`, the
 * identical function the live suggestion uses. Same input shape, same warm-up
 * and ghost exclusions, same volume weighting.
 *
 * ── AND WHY BY DAY KEY ───────────────────────────────────────────────────────
 * A leg day and an arms day do not cost the same, and grading one against the
 * other would make every Legs & Core session read "Brutal" and every Delts &
 * Arms one "Solid" forever. Comparing like with like is what leaves the words
 * free to mean something.
 *
 * Sessions with nothing rated drop out rather than counting as zero.
 */
export function useEffortBaseline(dayKey: string | null | undefined) {
  return useQuery({
    queryKey: ['effort_baseline', dayKey],
    enabled: !!dayKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number[]> => {
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('day_key', dayKey!)
        .order('started_at', { ascending: false })
        .limit(WINDOW)
      const ids = ((sessions ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (!ids.length) return []

      const { data: sets } = await supabase
        .from('workout_sets')
        .select('session_id, weight_kg, reps, rpe, set_type')
        .in('session_id', ids)
      const rows = (sets ?? []) as Array<{
        session_id: string; weight_kg: number; reps: number
        rpe: number | string | null; set_type: string | null
      }>

      const bySession = new Map<string, Array<{ weightKg: number; reps: number; rpe: number | null; setType: string | null }>>()
      for (const r of rows) {
        const bucket = bySession.get(r.session_id) ?? []
        bucket.push({
          weightKg: r.weight_kg,
          reps: r.reps,
          // numeric(3,1) can arrive as a string on some PostgREST paths — the
          // same caveat `useWeeklyLoop`'s RawSet documents.
          rpe: r.rpe == null ? null : Number(r.rpe),
          setType: r.set_type,
        })
        bySession.set(r.session_id, bucket)
      }

      return [...bySession.values()]
        .map((s) => deriveSessionRpe(s))
        .filter((v): v is number => v != null)
    },
  })
}
