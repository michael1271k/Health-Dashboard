'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useExerciseMap } from '@/lib/hooks/useLogger'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { activeLeverOf } from '@/lib/nutrition/levers'
import { maintenanceLeverOn } from '@/lib/nutrition/maintenance'
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

  // ── AND A MAINTENANCE WEEK IS NOT EVIDENCE ABOUT A CEILING ─────────────────
  // Decision 6, and the phone has enforced it since P3 E4: the deck seed skips
  // sessions logged under the maintenance lever
  // (`SessionSeedBuilder.sessionsForSeed`), and `AppDatabase.progressionQueue`
  // reads the SAME list so the verdict and the number it pre-fills can never be
  // about different sessions. Without the same filter here, two cleared
  // sessions inside a release week still produce a `ready` chip on the web
  // while the deck it points at would never seed from them — a chip on a load
  // nothing proposed.
  //
  // Derived from the date, not stored: nothing on `workout_sessions` records
  // which kind of week it was. Same resolution `useExerciseSetHistory`,
  // the scorer, the widget and the export already run.
  const { data: goalsRow } = useUserGoals()
  const storedLeverId = activeLeverOf(goalsRow)
  const releaseEndsOn = (goalsRow as { maintenance_until?: string | null } | null)?.maintenance_until ?? null

  return useQuery({
    queryKey: [
      'progression_queue', eraDate, [...ids].sort().join(','), [...dayKeys].sort().join('|'),
      storedLeverId ?? 'none', releaseEndsOn ?? 'none',
    ],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ProgressionAlert[]> => {
      const era = eraForDate(eraDate)
      let q = supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, set_type, rpe, workout_sessions!inner(started_at, day_key)')
        .in('exercise_id', ids)
        .in('workout_sessions.day_key', dayKeys)
      q = era === 'axis'
        ? q.gte('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
        : q.lt('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
      const { data, error } = await q.limit(3000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as ProgressionSetRow[])
        .filter((r) => {
          const date = r.workout_sessions.started_at.slice(0, 10)
          if (eraForDate(date) !== era) return false
          return !maintenanceLeverOn(date, storedLeverId, releaseEndsOn, eraDate)
        })

      return progressionAlerts(targets, rows)
    },
  })
}
