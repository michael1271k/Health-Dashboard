'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { eraForDate, activePhase, getActiveProgramId } from '@/lib/programs'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type MuscleVolume, type ProgramPhase } from '@/lib/training/landmarks'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'

export interface WeeklyVolume {
  weekStart: string
  /** The ACTIVE phase, read from the plan — not inferred from calories. */
  program: ProgramPhase
  muscles: MuscleVolume[]
}

/**
 * Committed sets per landmark muscle across a WHOLE week (Sunday 00:00 local →
 * the following Sunday), graded against the active program's MEV/MAV targets.
 * Unilateral L/R sub-sets (shared pair_id) count once, and WARM-UPS COUNT — see
 * the note on the query below.
 *
 * `weekStart` defaults to the current week, so the card resets every Sunday.
 * Pass a Sunday to accumulate a past week — the Session Report needs the week
 * that contains the session, not today's.
 *
 * `upTo` (inclusive date) clamps the upper bound to the END of that day. The
 * Session Report uses it so a session shows the week accumulated UP TO the day
 * it happened, not totals that include work done after it.
 */
export function useWeeklyVolume(
  weekStart: string = weekStartOf(logicalTodayISO()),
  upTo?: string,
) {
  // The phase comes from the ACTIVE PLAN. It used to be sniffed from
  // calorie_goal (>= 2450 meant bulk), which had no way to express maintenance —
  // a maintenance block silently trained to cut volume.
  const { resolveVolume } = usePlanPhaseGoals()
  const phase = activePhase() as ProgramPhase
  const planId = getActiveProgramId()
  const volumeTargets = resolveVolume(planId, phase)

  return useQuery({
    queryKey: ['weekly_volume', weekStart, upTo ?? null, planId, phase],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyVolume> => {
      // STRICT Sunday-00:00 LOCAL bounds. `${weekStart}T00:00:00Z` is UTC
      // midnight, which in any non-UTC timezone clips or leaks the first hours
      // of the week; this converts the user's local Sunday midnight to the
      // correct absolute instant. The upper bound matters for past weeks —
      // without it a historical week accumulated everything logged since.
      const weekStartInstant = new Date(`${weekStart}T00:00:00`).toISOString()
      const endExclusiveDate = upTo && upTo < isoAddDays(weekStart, 6)
        ? isoAddDays(upTo, 1)
        : isoAddDays(weekStart, 7)
      const weekEndInstant = new Date(`${endExclusiveDate}T00:00:00`).toISOString()
      const [{ data: setsData, error }] = await Promise.all([
        supabase
          .from('workout_sets')
          .select('id, pair_id, set_type, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
          .gte('workout_sessions.started_at', weekStartInstant)
          .lt('workout_sessions.started_at', weekEndInstant)
          // ── WARM-UPS ARE SETS HERE ────────────────────────────────────────
          // This used to filter them out on the argument that a warm-up is not
          // training volume. The argument is not wrong, but it made this the
          // ONLY per-muscle counter in the app that applied it: the logger's
          // own distribution sheet counts warm-ups (see `draftMuscleSets`), the
          // weekly tonnage counts them, and Hevy — the thing these numbers get
          // compared against, line by line, by a human — counts them.
          //
          // One app, two answers for the same question is worse than either
          // answer. Reconciling the week of 2026-08-16, two Leg Press warm-ups
          // were the entire Quads −2 / Hamstrings −1 / Glutes −1 gap, to the
          // decimal. PROGRAM_TARGETS were written on working sets and have NOT
          // been retuned, so a grade now runs marginally generous; that is a
          // deliberate trade against a number that could not be checked at all.
          //
          // ── A GHOST IS NOT A SET, THOUGH ──────────────────────────────────
          // The column was not even SELECTED here, so a set marked as
          // deliberately not performed was credited to its muscles in full —
          // the one counter where the warm-up argument does not transfer. A
          // warm-up is work you did; a ghost is work you did not.
          .limit(2000),
      ])
      if (error) throw error

      const rows = ((setsData ?? []) as unknown as Array<{
        id: string
        pair_id: string | null
        set_type: string | null
        exercises: { name: string; muscle_groups: string[] | null }
        workout_sessions: { started_at: string }
      }>)
        // A ghost is a set the plan asked for and you deliberately did not do.
        // Warm-ups stay (see the note on the select); this is the one exclusion.
        .filter((r) => r.set_type !== 'ghost')
        // Stay within the week's own era (a week is one era, but the boundary
        // week would otherwise mix PPL-legacy sets into a HELIX total).
        .filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === eraForDate(weekStart))
        .map((r) => ({
          // Primary AND secondary movers, kept apart so the accumulator can pay
          // them differently — a full set to the muscle the movement trains, a
          // half set to the ones that assist. Counting the flat `muscle_groups`
          // array put Biceps at 22 against a target of 8; counting only the
          // primary hid every glute the RDLs trained. See SECONDARY_SET_CREDIT.
          ...resolveMovers(r.exercises.name, r.exercises.muscle_groups),
          dedupeKey: r.pair_id ?? r.id, // L/R sub-sets (shared pair_id) count once
        }))

      return { weekStart, program: phase, muscles: weeklyVolumeByMuscle(rows, phase, volumeTargets) }
    },
  })
}
