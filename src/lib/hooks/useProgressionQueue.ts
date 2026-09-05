'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useExerciseMap } from '@/lib/hooks/useLogger'
import {
  progressionAlerts, type ProgressionAlert, type ProgressionSetRow, type ProgressionTarget,
} from '@/lib/training/progressionQueue'

// The pure core lives in `training/progressionQueue` (the Swift twin replays
// it); these re-exports keep the existing import paths working.
export {
  exerciseDayKey, bucketByExerciseDay, lastTwoSessions, progressionAlerts,
  type ProgressionAlert, type ProgressionSetRow,
} from '@/lib/training/progressionQueue'

/**
 * The forward-carrying Smart-Coach queue. For every exercise in the ACTIVE plan
 * it fetches the era-scoped history on the exercise's OWN routine day and hands
 * it to `progressionAlerts`, which grades the last two sessions with the same
 * strict engine the session view uses. See that module for the Leg Press
 * bug that made the history routine-scoped.
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
    const seen = new Map<string, ProgressionTarget>()
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

  const ids = [...new Set(targets.map((t) => t.id))]
  const dayKeys = [...new Set(targets.map((t) => t.dayKey))]
  const eraDate = logicalTodayISO()

  return useQuery({
    queryKey: ['progression_queue', eraDate, [...ids].sort().join(','), [...dayKeys].sort().join('|')],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ProgressionAlert[]> => {
      const era = eraForDate(eraDate)
      let q = supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, set_type, workout_sessions!inner(started_at, day_key)')
        .in('exercise_id', ids)
        .in('workout_sessions.day_key', dayKeys)
      q = era === 'axis'
        ? q.gte('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
        : q.lt('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
      const { data, error } = await q.limit(3000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as ProgressionSetRow[])
        .filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      return progressionAlerts(targets, rows)
    },
  })
}
