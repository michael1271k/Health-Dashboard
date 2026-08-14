'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { MUSCLE_MAP } from '@/lib/hooks/useMuscleAnalytics'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { toLandmarkMuscle, LANDMARK_MUSCLES, SECONDARY_SET_CREDIT, type LandmarkMuscle } from '@/lib/training/landmarks'
import type { PrAxis } from '@/lib/sessions/save'
import { sessionVolumeKg, type VolumeSet } from '@/lib/sessions/volume'

export interface DetailSet {
  setNumber: number
  weightKg: number
  reps: number
  rpe: number | null
  isPr: boolean
  est1rmKg: number | null
  setType: string // 'normal' | 'warmup' | 'failure'
  /** Unilateral: 'L'/'R' sub-sets sharing a pairId are ONE set. */
  side: string | null
  pairId: string | null
  /**
   * The PR axes THIS set earned, resolved from the ledger by matching load+reps.
   *
   * Trophies and axis labels belong on the row where the record happened. They
   * used to render on the exercise HEADER, which said "this exercise had a
   * record somewhere" and left you scanning three set rows to find which — while
   * also crowding the title until long names wrapped.
   */
  prAxes: PrAxis[]
}

export interface DetailExercise {
  exerciseId: string
  name: string
  order: number
  muscleGroups: string[]      // canonical display groups (deduped)
  isCompound: boolean
  sets: DetailSet[]
  workingSets: number         // excludes warmups
  topKg: number
  volumeKg: number
  bestEst1rm: number | null
  /** PR axes set on this exercise in THIS session (weight/reps/volume/e1rm). */
  prAxes: PrAxis[]
}

export interface SessionDetail {
  id: string
  date: string
  startedAt: string
  splitDay: string
  dayKey: string | null
  volumeKg: number
  setCount: number
  prCount: number
  durationMin: number | null
  avgBpm: number | null
  /** Both figures may be formula-derived when the session carried no watch data. */
  avgBpmEstimated: boolean
  caloriesEstimated: boolean
  calories: number | null
  /**
   * Session difficulty, 1–10, as logged on the commit bar.
   *
   * `workout_sessions.session_rpe` was written but never selected, so the one
   * number describing how the session FELT was absent from the report that
   * describes the session.
   */
  sessionRpe: number | null
  exercises: DetailExercise[]
  /**
   * DIRECT working sets per landmark muscle for THIS session, sorted desc.
   * Untrained muscles are absent, never zero-filled.
   *
   * Landmark muscles (Quads / Hamstrings / Side delts / …), NOT the six broad
   * display groups: the weekly accumulator speaks that language, and the two
   * taxonomies used to be crossed here — the Session Report fed 13-muscle rows
   * into a 6-group landmark table, where only "Chest" and "Back" happen to exist
   * in both. Everything actually trained fell through the lookup and vanished,
   * so a Legs & Core day rendered Chest + Back at zero sets.
   */
  muscleSets: Array<{ muscle: LandmarkMuscle; sets: number }>
  failureSets: number
  warmupSets: number
}

type RawSet = {
  exercise_id: string
  set_number: number
  weight_kg: number
  reps: number
  rpe: number | null
  is_pr: boolean
  est_1rm_kg: number | null
  exercise_order: number | null
  set_type: string | null
  side: string | null
  pair_id: string | null
  exercises: { name: string; muscle_groups: string[] | null; is_compound: boolean }
}

/**
 * Everything the Workout Analysis deep-dive needs for ONE session, keyed by id:
 * full per-exercise set list (weight × reps · RPE · warmup/failure · PR · est-1RM),
 * plus the session's working-set distribution across the six muscle groups.
 * Complements useSessionIntel (which supplies the vs-last-same-type comparison).
 */
export function useSessionDetail(sessionId: string | null) {
  return useQuery({
    queryKey: ['session_detail', sessionId],
    enabled: !!sessionId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionDetail | null> => {
      const { data: sRaw } = await supabase
        .from('workout_sessions')
        .select('id, started_at, split_day, day_key, total_volume_kg, set_count, pr_count, duration_min, avg_bpm, calories_burned, session_rpe, calories_estimated, avg_bpm_estimated')
        .eq('id', sessionId as string)
        .single()
      const s = sRaw as {
        id: string; started_at: string; split_day: string; day_key: string | null
        total_volume_kg: number | null; set_count: number | null; pr_count: number | null
        duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
        calories_estimated: boolean | null; avg_bpm_estimated: boolean | null
        session_rpe: number | null
      } | null
      if (!s) return null

      const { data: setsRaw } = await supabase
        .from('workout_sets')
        .select('exercise_id, set_number, weight_kg, reps, rpe, is_pr, est_1rm_kg, exercise_order, set_type, side, pair_id, exercises!inner(name, muscle_groups, is_compound)')
        .eq('session_id', sessionId as string)
        .order('exercise_order', { ascending: true })
        .order('set_number', { ascending: true })
      const rows = (setsRaw ?? []) as unknown as RawSet[]

      // Group sets by exercise, preserving exercise_order.
      const byEx = new Map<string, DetailExercise>()
      /** landmark muscle → dedupe key → set credit (L/R pairs count once). */
      const muscleAgg = new Map<LandmarkMuscle, Map<string, number>>()
      /** per-exercise working-set dedupe keys — a unilateral L/R pair is ONE set. */
      const workingSeen = new Map<string, Set<string>>()
      /** per-exercise working sets, kept whole so tonnage can use the ONE rule. */
      const workingVol = new Map<string, VolumeSet[]>()
      /** exercise → each landmark mover it trains, and what one set is worth to it. */
      const moversOf = new Map<string, Map<LandmarkMuscle, number>>()
      let failureSets = 0
      let warmupSets = 0

      for (const r of rows) {
        const setType = r.set_type ?? 'normal'
        const isWarmup = setType === 'warmup'
        if (isWarmup) warmupSets += 1
        if (setType === 'failure') failureSets += 1

        let ex = byEx.get(r.exercise_id)
        if (!ex) {
          // Resolve muscles from the exercise NAME first. `exercises.muscle_groups`
          // is a seeded column: rows imported before the dictionary existed, or
          // seeded by a parser, carry stale or generic tags — which is how a
          // Legs & Core session ended up presented as chest/back work.
          const entry = resolveMovers(r.exercises.name, r.exercises.muscle_groups)
          const tags = [...entry.primary, ...entry.secondary]
          const groups = [...new Set(tags.map((m) => MUSCLE_MAP[m.toLowerCase()]).filter(Boolean))]
          // A full set to the primary movers, SECONDARY_SET_CREDIT to the
          // assistants — the same rule as the weekly accumulator, so a session's
          // per-muscle counts always roll up into the week's.
          const movers = new Map<LandmarkMuscle, number>()
          const add = (tokens: readonly string[], weight: number) => {
            for (const m of new Set(tokens.map(toLandmarkMuscle))) {
              if (m === null) continue
              movers.set(m, Math.max(movers.get(m) ?? 0, weight))
            }
          }
          add(entry.secondary, SECONDARY_SET_CREDIT)
          add(entry.primary, 1)   // last, so an overlap keeps the FULL credit
          moversOf.set(r.exercise_id, movers)
          ex = {
            exerciseId: r.exercise_id,
            name: r.exercises.name,
            order: r.exercise_order ?? 999,
            muscleGroups: groups,
            isCompound: r.exercises.is_compound,
            sets: [], workingSets: 0, topKg: 0, volumeKg: 0, bestEst1rm: null, prAxes: [],
          }
          byEx.set(r.exercise_id, ex)
        }
        ex.sets.push({
          setNumber: r.set_number, weightKg: r.weight_kg, reps: r.reps,
          rpe: r.rpe, isPr: r.is_pr, est1rmKg: r.est_1rm_kg, setType,
          side: r.side ?? null, pairId: r.pair_id ?? null, prAxes: [],
        })
        if (!isWarmup) {
          // Collected, not summed. Tonnage now goes through `sessionVolumeKg`
          // once per exercise (below) so a unilateral pair collapses to its
          // weaker side here exactly as it does on the session total. Summing
          // per row credited the strong arm's extra reps to the weak one, and
          // the card disagreed with its own header.
          const bucket = workingVol.get(r.exercise_id) ?? []
          bucket.push({
            weightKg: r.weight_kg || 0, reps: r.reps || 0,
            // `RawSet.side` is a bare string from PostgREST; only the two real
            // limbs may collapse a pair, so anything else reads as no side.
            side: r.side === 'L' || r.side === 'R' ? r.side : null,
            pairId: r.pair_id ?? null,
          })
          workingVol.set(r.exercise_id, bucket)
          if (r.weight_kg > ex.topKg) ex.topKg = r.weight_kg
          if (r.est_1rm_kg != null && (ex.bestEst1rm == null || r.est_1rm_kg > ex.bestEst1rm)) ex.bestEst1rm = r.est_1rm_kg
          // One direct set per landmark mover. Unilateral L/R sub-sets share a
          // pair_id and must count ONCE, matching the weekly accumulator.
          const dedupeKey = r.pair_id ?? `${r.exercise_id}:${r.set_number}`
          // Working-set COUNT dedupes the same way (volume still summed per side).
          const wseen = workingSeen.get(r.exercise_id) ?? new Set<string>()
          if (!wseen.has(dedupeKey)) { wseen.add(dedupeKey); ex.workingSets += 1 }
          workingSeen.set(r.exercise_id, wseen)
          for (const [mu, weight] of moversOf.get(r.exercise_id) ?? []) {
            const seen = muscleAgg.get(mu) ?? new Map<string, number>()
            seen.set(dedupeKey, Math.max(seen.get(dedupeKey) ?? 0, weight))
            muscleAgg.set(mu, seen)
          }
        }
      }

      const exercises = [...byEx.values()].sort((a, b) => a.order - b.order)
      exercises.forEach((e) => {
        e.volumeKg = Math.round(sessionVolumeKg(workingVol.get(e.exerciseId) ?? []))
      })

      // PR axes achieved in THIS session, from the ledger (self-healing: a missing
      // personal_records table just yields no axis chips — is_pr trophies still show).
      const prByName = new Map<string, Array<{ axis: PrAxis; weightKg: number | null; reps: number | null }>>()
      const { data: prRows } = await supabase
        .from('personal_records')
        .select('exercise_key, axis, weight_kg, reps')
        .eq('session_id', s.id)
      for (const row of (prRows ?? []) as Array<{ exercise_key: string; axis: PrAxis; weight_kg: number | null; reps: number | null }>) {
        const list = prByName.get(row.exercise_key) ?? []
        list.push({ axis: row.axis, weightKg: row.weight_kg, reps: row.reps })
        prByName.set(row.exercise_key, list)
      }
      for (const e of exercises) {
        const records = prByName.get(e.name) ?? []
        e.prAxes = [...new Set(records.map((r) => r.axis))]
        // Attribute each ledger row to the SET that earned it. Every axis now
        // stores the winning set's load and reps, so the match is exact on all
        // four. The `flagged[last]` fallback below is for LEGACY rows only:
        // volume and e1RM were written with null load+reps until 2026-08-08
        // (they were exercise-level totals when the table was designed), and
        // those rows can still only be placed by guessing.
        const flagged = e.sets.filter((x) => x.isPr)
        for (const rec of records) {
          const target = rec.weightKg != null && rec.reps != null
            ? [...flagged].reverse().find((x) => x.weightKg === rec.weightKg && x.reps === rec.reps)
            : flagged[flagged.length - 1]
          const row = target ?? flagged[flagged.length - 1]
          if (row && !row.prAxes.includes(rec.axis)) row.prAxes.push(rec.axis)
        }
      }

      const muscleSets = LANDMARK_MUSCLES
        .map((muscle) => ({
          muscle,
          // Half sets are real here, so the total is rounded to 1dp rather than
          // to an integer — 4.5 is the honest count, 4 and 5 are both fiction.
          sets: Math.round([...(muscleAgg.get(muscle)?.values() ?? [])]
            .reduce((a, b) => a + b, 0) * 10) / 10,
        }))
        .filter((m) => m.sets > 0)   // untrained muscles are hidden, not zero-filled
        .sort((a, b) => b.sets - a.sets)

      const computedVolume = Math.round(exercises.reduce((n, e) => n + e.volumeKg, 0))
      const workingSetCount = exercises.reduce((n, e) => n + e.workingSets, 0)

      return {
        id: s.id,
        date: s.started_at.slice(0, 10),
        startedAt: s.started_at,
        splitDay: s.split_day,
        dayKey: s.day_key,
        volumeKg: s.total_volume_kg ?? computedVolume,
        setCount: s.set_count ?? workingSetCount,
        prCount: s.pr_count ?? exercises.reduce((n, e) => n + e.sets.filter((x) => x.isPr).length, 0),
        durationMin: s.duration_min,
        avgBpm: s.avg_bpm,
        avgBpmEstimated: s.avg_bpm_estimated ?? false,
        calories: s.calories_burned,
        caloriesEstimated: s.calories_estimated ?? false,
        sessionRpe: s.session_rpe,
        exercises,
        muscleSets,
        failureSets,
        warmupSets,
      }
    },
  })
}
