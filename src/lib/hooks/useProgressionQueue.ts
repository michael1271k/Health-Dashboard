'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { isTimedExercise } from '@/lib/exercises/timed'
import {
  repWindowFor, holdTargetFor, progressionVerdict, timedProgressionVerdict, type WorkingSet,
} from '@/lib/training/ceilings'
import { useExerciseMap } from '@/lib/hooks/useLogger'

/** One lift that has cleared its ceiling twice — ready for a load bump NEXT time
 *  it appears (even on a different day this week). */
export interface ProgressionAlert {
  exerciseId: string
  name: string
  dayKey: string | null
  dayLabel: string | null
  dayColor: string | null
  /** Recommended new load (null for a timed hold — "extend the hold" instead). */
  suggestKg: number | null
  /** The load the lift cleared the ceiling at. */
  currentKg: number | null
  timed: boolean
  ceiling: number | null
  /** 'ready' = earned the bump. 'one-more' = cleared once, needs a repeat. */
  state: 'ready' | 'one-more'
}

/**
 * The forward-carrying Smart-Coach queue. For every exercise in the ACTIVE plan,
 * it grades the last two era-scoped sessions with the SAME strict engine the
 * session view uses (`progressionVerdict` — all working sets at the programmed
 * ceiling, one load, two consecutive sessions) and returns those that earned a
 * load bump. The verdict is derived purely from the last two sessions, so the
 * moment a heavier load is logged the old-load chain breaks and the alert clears
 * itself — no strike counter to persist or reset.
 */
export function useProgressionQueue() {
  const { data: exMap } = useExerciseMap()

  // Active-plan exercises resolved to DB ids, each tagged with a day it appears on
  // (for the "log this day" deep-link). Deduped by exercise id.
  const targets = useMemo(() => {
    const prog = activeProgram()
    // Keyed by (exercise, DAY). Deduping by exercise alone kept whichever day
    // came first, so Calf Press — which appears on Legs A and Legs B with
    // different rep windows — was graded against the wrong day's ceiling.
    const seen = new Map<string, { id: string; name: string; dayKey: string; dayLabel: string; color: string }>()
    for (const d of prog.days) {
      // prog is phase-resolved — cut-dropped lifts are already absent.
      for (const e of d.exercises) {
        const id = exMap?.get(e.name)
        if (!id) continue
        const k = `${id}|${d.key}`
        if (seen.has(k)) continue
        seen.set(k, { id, name: e.name, dayKey: d.key, dayLabel: d.label, color: d.color })
      }
    }
    return [...seen.values()]
  }, [exMap])

  const ids = targets.map((t) => t.id)
  const eraDate = logicalTodayISO()

  return useQuery({
    queryKey: ['progression_queue', eraDate, [...ids].sort().join(',')],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ProgressionAlert[]> => {
      const era = eraForDate(eraDate)
      let q = supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, set_type, workout_sessions!inner(started_at)')
        .in('exercise_id', ids)
      q = era === 'axis'
        ? q.gte('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
        : q.lt('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
      const { data, error } = await q.limit(3000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number; set_type: string | null
        workout_sessions: { started_at: string }
      }>).filter((r) => r.set_type !== 'warmup' && eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      // exercise → session instant → working sets
      const byEx = new Map<string, Map<string, WorkingSet[]>>()
      for (const r of rows) {
        const at = r.workout_sessions.started_at
        const perEx = byEx.get(r.exercise_id) ?? new Map<string, WorkingSet[]>()
        const bucket = perEx.get(at) ?? []
        bucket.push({ weightKg: r.weight_kg, reps: r.reps })
        perEx.set(at, bucket)
        byEx.set(r.exercise_id, perEx)
      }

      const alerts: ProgressionAlert[] = []
      for (const t of targets) {
        const perEx = byEx.get(t.id)
        if (!perEx) continue
        const ordered = [...perEx.entries()].sort(([a], [b]) => a.localeCompare(b))
        const latest = ordered[ordered.length - 1]?.[1]
        if (!latest) continue
        const previous = ordered.length >= 2 ? ordered[ordered.length - 2][1] : null

        const timed = isTimedExercise(t.name)
        const ceiling = timed ? holdTargetFor(t.name, t.dayKey) : (repWindowFor(t.name, t.dayKey)?.ceiling ?? null)
        const verdict = (timed ? timedProgressionVerdict : progressionVerdict)(
          previous ? [previous, latest] : [latest], ceiling,
        )
        // 'one-more' is surfaced too: seeing the trigger approach is more use
        // than silence followed by a sudden instruction.
        if (verdict.state !== 'ready' && verdict.state !== 'one-more') continue
        const working = latest.filter((s2) => s2.weightKg > 0)
        alerts.push({
          exerciseId: t.id, name: t.name, dayKey: t.dayKey, dayLabel: t.dayLabel, dayColor: t.color,
          suggestKg: verdict.suggestKg,
          // The TOP load, not the first set logged — that is the load the
          // verdict is actually about.
          currentKg: working.length ? Math.max(...working.map((s2) => s2.weightKg)) : null,
          timed, ceiling, state: verdict.state,
        })
      }
      return alerts.sort((a, b) => (a.dayLabel ?? '').localeCompare(b.dayLabel ?? '') || a.name.localeCompare(b.name))
    },
  })
}
