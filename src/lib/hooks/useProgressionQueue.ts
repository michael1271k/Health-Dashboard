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
import { isWorkingSet } from '@/lib/training/setTags'

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

/** A `workout_sets` row joined to the session that owns it. */
export interface ProgressionSetRow {
  exercise_id: string
  weight_kg: number
  reps: number
  set_type: string | null
  workout_sessions: { started_at: string; day_key: string | null }
}

/** The bucket key a routine-scoped history is stored under. */
export const exerciseDayKey = (dayKey: string, exerciseId: string) => `${dayKey}|${exerciseId}`

/**
 * Fold set rows into `(routine day, exercise) → session instant → working sets`.
 *
 * Warm-ups are dropped — a light opener is not evidence about a ceiling. Rows
 * whose session carries no `day_key` are dropped too: they cannot be attributed
 * to a routine, and a routine's ceiling is the only thing this history is graded
 * against. Pooling them under the exercise is precisely the bug this shape
 * exists to prevent.
 *
 * Pure, so the Leg Press case can be asserted without a database.
 */
export function bucketByExerciseDay(rows: ProgressionSetRow[]): Map<string, Map<string, WorkingSet[]>> {
  const out = new Map<string, Map<string, WorkingSet[]>>()
  for (const r of rows) {
    if (!isWorkingSet(r.set_type)) continue
    const dk = r.workout_sessions.day_key
    if (!dk) continue
    const at = r.workout_sessions.started_at
    const key = exerciseDayKey(dk, r.exercise_id)
    const perEx = out.get(key) ?? new Map<string, WorkingSet[]>()
    perEx.set(at, [...(perEx.get(at) ?? []), { weightKg: r.weight_kg, reps: r.reps }])
    out.set(key, perEx)
  }
  return out
}

/**
 * The last two sessions for one bucket, oldest first — the shape
 * `progressionVerdict` grades. Empty when the lift has never been logged on
 * that routine day.
 */
export function lastTwoSessions(
  byExDay: Map<string, Map<string, WorkingSet[]>>,
  dayKey: string,
  exerciseId: string,
): WorkingSet[][] {
  const perEx = byExDay.get(exerciseDayKey(dayKey, exerciseId))
  if (!perEx) return []
  return [...perEx.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-2)
    .map(([, sets]) => sets)
}

/**
 * The forward-carrying Smart-Coach queue. For every exercise in the ACTIVE plan,
 * it grades the last two era-scoped sessions with the SAME strict engine the
 * session view uses (`progressionVerdict` — all working sets at the programmed
 * ceiling, one load, two consecutive sessions) and returns those that earned a
 * load bump. The verdict is derived purely from the last two sessions, so the
 * moment a heavier load is logged the old-load chain breaks and the alert clears
 * itself — no strike counter to persist or reset.
 *
 * ── HISTORY IS SCOPED TO THE ROUTINE DAY, NOT THE EXERCISE ───────────────────
 * `targets` is keyed by (exercise, DAY) because the rep ceiling comes from the
 * day: Leg Press is 8–12 on Legs A and 12–15 on Legs B ("horizontal sled").
 * The set history used to be fetched by `exercise_id` ALONE and shared between
 * both targets, so the Legs A target — ceiling 12 — was graded against Legs B
 * sets. Two Legs B sessions of 13×2 at one load cleared a ceiling of 12 twice
 * and the coach said "add load" on a lift that had not touched its own window.
 *
 * So the fetch joins `workout_sessions.day_key` and buckets by
 * (exercise, day, session) — the same join `useRoutineMemory` already makes for
 * the "Previous: Xkg × Y" chip, and for the same reason.
 *
 * A session with no `day_key` cannot be attributed to a routine, so it cannot be
 * graded against a routine's ceiling: those rows are dropped rather than pooled.
 * The cost is that a lift stays silent until it has been logged on its own day,
 * which is the correct silence — the alternative is the false positive above.
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

      const byExDay = bucketByExerciseDay(rows)

      const alerts: ProgressionAlert[] = []
      for (const t of targets) {
        const sessions = lastTwoSessions(byExDay, t.dayKey, t.id)
        const latest = sessions[sessions.length - 1]
        if (!latest) continue

        const timed = isTimedExercise(t.name)
        const ceiling = timed ? holdTargetFor(t.name, t.dayKey) : (repWindowFor(t.name, t.dayKey)?.ceiling ?? null)
        const verdict = (timed ? timedProgressionVerdict : progressionVerdict)(sessions, ceiling)
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
      // PLAN ORDER, not alphabetical. `targets` is built by walking
      // `activeProgram().days[].exercises[]`, so pushing in that order already
      // yields Settings/Plan order — day by day, and within a day the sequence
      // the session is actually performed in. Sorting by `dayLabel` afterwards
      // undid exactly that: "Delts & Arms" landed before "Legs & Core A", and
      // inside a day the lifts came out alphabetically rather than in the order
      // you meet them on the floor.
      return alerts
    },
  })
}
