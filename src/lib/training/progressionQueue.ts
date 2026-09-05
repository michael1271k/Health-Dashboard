/**
 * The Smart-Coach queue, pure — the golden source for
 * `HelixCore/Training/ProgressionQueue.swift` (Phase 2 §6.5).
 *
 * For every (exercise, routine day) target it grades the last two sessions
 * with the SAME strict engine the session view uses (`progressionVerdict` —
 * all working sets at the programmed ceiling, one load, two consecutive
 * sessions) and returns those that earned a load bump, or are one session
 * away from one. Derived purely from the last two sessions, so the moment a
 * heavier load is logged the old-load chain breaks and the alert clears
 * itself — no strike counter to persist or reset.
 *
 * ── HISTORY IS SCOPED TO THE ROUTINE DAY, NOT THE EXERCISE ───────────────────
 * The rep ceiling comes from the day: Leg Press is 8–12 on Legs A and 12–15 on
 * Legs B. Set history fetched by `exercise_id` ALONE was shared between both
 * targets, so the Legs A target (ceiling 12) was graded against Legs B sets
 * and the coach said "add load" on a lift that had not touched its own
 * window. Rows are bucketed by (exercise, day, session); a session with no
 * `day_key` cannot be attributed to a routine and is dropped, not pooled.
 */

import { isTimedExercise } from '@/lib/exercises/timed'
import {
  repWindowFor, holdTargetFor, progressionVerdict, timedProgressionVerdict, type WorkingSet,
} from '@/lib/training/ceilings'
import { isWorkingSet } from '@/lib/training/setTags'

/** One lift that has cleared its ceiling — ready for a load bump NEXT time it
 *  appears (even on a different day this week). */
export interface ProgressionAlert {
  exerciseId: string
  name: string
  dayKey: string | null
  dayLabel: string | null
  dayColor: string | null
  /** Recommended new load (null for a timed hold — "extend the hold" instead). */
  suggestKg: number | null
  /** The TOP load of the latest session — the load the verdict is about. */
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

/** An exercise as the active plan programs it on one day. */
export interface ProgressionTarget {
  id: string
  name: string
  dayKey: string
  dayLabel: string
  color: string
}

/** The bucket key a routine-scoped history is stored under. */
export const exerciseDayKey = (dayKey: string, exerciseId: string) => `${dayKey}|${exerciseId}`

/**
 * Fold set rows into `(routine day, exercise) → session instant → working sets`.
 * Warm-ups are dropped — a light opener is not evidence about a ceiling.
 */
export function bucketByExerciseDay(rows: readonly ProgressionSetRow[]): Map<string, Map<string, WorkingSet[]>> {
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
 * The queue, in PLAN ORDER — `targets` is walked as given, which for the
 * caller that builds it from `activeProgram().days[].exercises[]` is day by
 * day and, within a day, the order the session is performed in. Sorting by
 * label afterwards undid exactly that.
 *
 * `programId` defaults to the active program, as `repWindowFor` does.
 */
export function progressionAlerts(
  targets: readonly ProgressionTarget[],
  rows: readonly ProgressionSetRow[],
  programId?: string,
): ProgressionAlert[] {
  const byExDay = bucketByExerciseDay(rows)
  const alerts: ProgressionAlert[] = []
  for (const t of targets) {
    const sessions = lastTwoSessions(byExDay, t.dayKey, t.id)
    const latest = sessions[sessions.length - 1]
    if (!latest) continue

    const timed = isTimedExercise(t.name)
    const ceiling = timed
      ? holdTargetFor(t.name, t.dayKey, programId)
      : (repWindowFor(t.name, t.dayKey, programId)?.ceiling ?? null)
    const verdict = (timed ? timedProgressionVerdict : progressionVerdict)(sessions, ceiling)
    // 'one-more' is surfaced too: seeing the trigger approach is more use
    // than silence followed by a sudden instruction.
    if (verdict.state !== 'ready' && verdict.state !== 'one-more') continue
    const working = latest.filter((s) => s.weightKg > 0)
    alerts.push({
      exerciseId: t.id, name: t.name, dayKey: t.dayKey, dayLabel: t.dayLabel, dayColor: t.color,
      suggestKg: verdict.suggestKg,
      currentKg: working.length ? Math.max(...working.map((s) => s.weightKg)) : null,
      timed, ceiling, state: verdict.state,
    })
  }
  return alerts
}
