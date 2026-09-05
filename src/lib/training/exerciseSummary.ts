import { collapsePairs, type TrendSetRow } from '@/lib/charts/series'
import { isWorkingSet } from '@/lib/training/setTags'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { epley1RM } from '@/lib/utils/epley'

/**
 * The three numbers at the top of an exercise's page.
 *
 * ── WHY THIS EXISTS RATHER THAN THE RPC ──────────────────────────────────────
 * `exercise_history` computed them server-side and the phone derived them from
 * the ledger, and the two disagreed on every unilateral lift and every session
 * with a warm-up in it. The RPC counts each side of a pair as its own set and
 * cannot collapse them — it has no `pair_id` to collapse ON — and its
 * `best_1rm` is a plain `max(est_1rm_kg)` with no Epley fallback, so a
 * bodyweight movement reported `0`. The page's answer was a footnote,
 * "Unilateral lifts count each side separately", under a number that therefore
 * was not the number the phone showed.
 *
 * Phase 2.5 decision 4 makes the native definitions the truth: pairs collapse,
 * warm-ups are excluded, and the estimate falls back to Epley. This file is the
 * twin of `OnyxCore/Training/ExerciseSummary.swift`, vector `exercise-summary`.
 */
export interface ExerciseSummarySet extends TrendSetRow {
  /** Which session the set belongs to — the grouping the volume record uses. */
  sessionId: string
  setType?: string | null
}

export interface ExerciseSummary {
  /** The heaviest load ever carried on a working set. Null for unloaded work. */
  heaviestKg: number | null
  /** Best estimated 1RM — stored where there is one, Epley where there is not. */
  bestE1rmKg: number | null
  /** The most tonnage this movement has carried in ONE session. */
  bestSessionVolumeKg: number | null
  /** The best rep count of any working set — the headline for unloaded work. */
  bestReps: number | null
  /** The reps of the heaviest set, for the caveat line. */
  heaviestSetReps: number | null
  /** Reps across every working set, pairs counted ONCE. */
  totalReps: number
  /** Working sets, pairs counted ONCE. */
  workingSets: number
  /** No working set has ever carried load. */
  unloaded: boolean
}

export const EMPTY_EXERCISE_SUMMARY: ExerciseSummary = {
  heaviestKg: null,
  bestE1rmKg: null,
  bestSessionVolumeKg: null,
  bestReps: null,
  heaviestSetReps: null,
  totalReps: 0,
  workingSets: 0,
  unloaded: true,
}

/** A stored estimate wins; a stored 0 is MISSING and falls through to Epley. */
function oneRepMax(set: TrendSetRow): number | null {
  if (set.est != null && set.est > 0 && Number.isFinite(set.est)) return set.est
  return epley1RM(set.weightKg, set.reps)
}

const max = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null)

/**
 * Summarise one exercise's whole ledger.
 *
 * `timed` marks a movement scored in seconds rather than reps (a plank), which
 * has no meaningful 1RM either.
 */
export function exerciseSummary(
  sets: readonly ExerciseSummarySet[],
  timed = false,
): ExerciseSummary {
  const working = sets.filter((s) => isWorkingSet(s.setType))
  if (!working.length) return EMPTY_EXERCISE_SUMMARY

  // `collapsePairs` keeps the RIGHT side of an L/R pair (or the higher-rep
  // side), which is what makes "42 reps in 3 working sets" true of a lift
  // performed one arm at a time.
  const collapsed = collapsePairs(working)
  const unloaded = !timed && working.every((s) => !(s.weightKg > 0))

  const heaviestCandidate = max(collapsed.map((s) => s.weightKg))
  const heaviestKg = heaviestCandidate != null && heaviestCandidate > 0 ? heaviestCandidate : null

  // The heaviest SET, not the heaviest load: at equal load the set that says
  // the most is the one with the most reps.
  const heaviestSetReps = heaviestKg == null
    ? null
    : max(collapsed.filter((s) => s.weightKg === heaviestKg).map((s) => s.reps))

  const bestE1rmKg = timed || unloaded
    ? null
    : max(collapsed.map(oneRepMax).filter((v): v is number => v != null))

  const bySession = new Map<string, ExerciseSummarySet[]>()
  for (const set of working) {
    const group = bySession.get(set.sessionId) ?? []
    group.push(set)
    bySession.set(set.sessionId, group)
  }
  const bestVolume = max([...bySession.values()].map((group) =>
    sessionVolumeKg(group.map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
      side: s.side === 'L' || s.side === 'R' ? s.side : null,
      pairId: s.pairId ?? null,
      setType: s.setType ?? null,
    }))),
  ))

  return {
    heaviestKg,
    bestE1rmKg,
    bestSessionVolumeKg: bestVolume != null && bestVolume > 0 ? Math.round(bestVolume) : null,
    bestReps: max(collapsed.map((s) => s.reps)),
    heaviestSetReps,
    totalReps: collapsed.reduce((n, s) => n + s.reps, 0),
    workingSets: collapsed.length,
    unloaded,
  }
}
