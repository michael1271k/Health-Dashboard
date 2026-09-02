'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { MUSCLE_MAP } from '@/lib/hooks/useMuscleAnalytics'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { toLandmarkMuscle, LANDMARK_MUSCLES, SECONDARY_SET_CREDIT, type LandmarkMuscle } from '@/lib/training/landmarks'
import type { PrAxis } from '@/lib/sessions/save'
import { sessionVolumeKg, type VolumeSet } from '@/lib/sessions/volume'
import { isWorkingSet } from '@/lib/training/setTags'

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
  /*
   * `restSec` USED to be here, and it is worth saying why it is not.
   *
   * It held MEASURED rest, written by the deck's stopwatch on commit. The
   * stopwatch was removed on 2026-08-19 when rest became a PRESCRIPTION rather
   * than a measurement — a target the plan states and you read, not a clock that
   * grades you. Nothing has written the column since, and nothing ever wrote it
   * before either: across the whole database, 0 of 523 sets carry a value.
   *
   * So the report's "Actual" strip has shown an em dash on every session that
   * has ever existed, sitting next to a "Rest" target chip that DOES have a
   * number. Two fields both called rest, one permanently blank, is one number
   * nobody trusts. The column is dropped; `restTargetFor` is the answer.
   */
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

/**
 * One `cardio_logs` row belonging to this session — a treadmill warm-up, a bike
 * finisher.
 *
 * ── WHY THE REPORT HAD TO GO AND FETCH THIS SEPARATELY ───────────────────────
 * A cardio block is deliberately NOT a `workout_sets` row: `save.ts` writes it
 * to `cardio_logs` so a treadmill walk cannot enter the tonnage, the set count,
 * the muscle credit or the record book. That is right, and it had one
 * consequence nobody chose — this report reads `workout_sets`, so the treadmill
 * you logged simply was not in the session you were reading about. The block was
 * in the deck while you walked it and gone from the record of the session
 * forever after.
 *
 * It is carried here as its OWN list rather than folded in as a `DetailExercise`
 * on purpose: every consumer of `exercises` counts sets, sums volume or resolves
 * movers from it, and a zero-set, zero-load entry in that array would have to be
 * excluded again at each one. A separate field cannot be counted by accident.
 */
export interface DetailCardio {
  id: string
  /** `treadmill` for a block logged in the deck; walk/run for the daily ledger. */
  kind: string
  distanceM: number | null
  durationMin: number | null
  inclinePct: number | null
  kcal: number | null
  avgBpm: number | null
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
  /**
   * PHYSICAL working sets — warm-ups excluded, a unilateral pair counted once.
   *
   * Distinct from `muscleSets`, whose figures are WEIGHTED (a set credits 1.0 to
   * each muscle it directly trains and 0.5 to each it assists), and therefore
   * larger. Both numbers are correct and they answer different questions; they
   * are carried side by side so the Focus block can say which is which instead
   * of printing one of them under a word that could mean either.
   */
  workingSets: number
  failureSets: number
  warmupSets: number
  /** Sets logged but deliberately uncounted — see `isWorkingSet`. */
  ghostSets: number
  /** Sets logged as a drop set — the third of the three tags a set can carry. */
  dropsetSets: number
  /**
   * Cardio blocks committed with this session. Empty on almost every session,
   * and NEVER counted as sets — see `DetailCardio`.
   */
  cardio: DetailCardio[]
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
  /** Absent on a database without the column, and on every historic row. */
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

      // ONE query. There used to be a second, identical but for `rest_sec`,
      // retried whenever the first returned nothing — a guard against databases
      // that had not taken that column yet. The column is gone, and with it the
      // ambiguity that made the guard necessary: an empty result now means an
      // empty session, which is a fact rather than a schema question.
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
      let dropsetSets = 0
      let ghostSets = 0

      for (const r of rows) {
        const setType = r.set_type ?? 'normal'
        /**
         * ── `uncounted`, NOT `isWarmup` ────────────────────────────────────
         * This flag gates the session's tonnage, its top load, its best e1RM
         * and its working-set count. It asked whether the row was a warm-up,
         * which was the whole question until `ghost` existed — a tag whose
         * entire meaning is that it does not count. A ghost reaching these four
         * figures would be the tag failing at the one job it has, on the very
         * screen that reports what the session was.
         *
         * The COMPOSITION counters below stay per-tag: `2W · 1G` is a true
         * statement about what happened, and collapsing the two would lose it.
         */
        const uncounted = !isWorkingSet(setType)
        const isWarmup = uncounted
        if (setType === 'warmup') warmupSets += 1
        if (setType === 'ghost') ghostSets += 1
        if (setType === 'failure') failureSets += 1
        if (setType === 'dropset') dropsetSets += 1

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
        // One set per landmark mover, deduped across a unilateral pair. Declared
        // out here because both the working-set count and the muscle credit
        // below use it, and only one of the two is inside the warm-up guard.
        const workingKey = r.pair_id ?? `${r.exercise_id}:${r.set_number}`

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
          // Working-set COUNT dedupes the same way (volume still summed per side).
          const wseen = workingSeen.get(r.exercise_id) ?? new Set<string>()
          if (!wseen.has(workingKey)) { wseen.add(workingKey); ex.workingSets += 1 }
          workingSeen.set(r.exercise_id, wseen)
        }

        // ── THE MUSCLE CREDIT IS OUTSIDE THE WARM-UP GUARD ────────────────────
        // Deliberately, and it is the only counter in this file that is. Every
        // other number here answers "what did you achieve" — records, tonnage,
        // whether a rep ceiling was cleared — and a warm-up achieves none of
        // them. This one answers "where did this session land", and two warm-up
        // sets of leg press are two sets of leg press as far as the quads are
        // concerned. It is also the figure compared against Hevy's breakdown,
        // and Hevy counts them: reconciled set by set against a real session,
        // one excluded warm-up was a third of the disagreement.
        //
        // Unilateral L/R sub-sets share a pair_id and must count ONCE.
        for (const [mu, weight] of moversOf.get(r.exercise_id) ?? []) {
          const seen = muscleAgg.get(mu) ?? new Map<string, number>()
          seen.set(workingKey, Math.max(seen.get(workingKey) ?? 0, weight))
          muscleAgg.set(mu, seen)
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

      /**
       * The session's cardio, from its own table.
       *
       * `incline_pct` is newer than the rest of the row and `save.ts` already
       * carries a strip-and-retry for writing it, so the read takes the same
       * shape: name it, and fall back to the columns that have always existed
       * rather than letting one unknown column fail the whole select and lose
       * the distance and duration with it. A missing TABLE resolves to no cardio
       * at all, which is the honest answer for a database that never had one.
       */
      const cardioSel = (cols: string) => supabase.from('cardio_logs').select(cols)
        .eq('session_id', sessionId as string)
        .order('created_at', { ascending: true })
      let cardioRes = await cardioSel('id, kind, distance_m, duration_min, incline_pct, kcal, avg_hr')
      if (cardioRes.error) cardioRes = await cardioSel('id, kind, distance_m, duration_min, kcal')
      const cardio: DetailCardio[] = cardioRes.error
        ? []
        : ((cardioRes.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          kind: String(r.kind ?? 'cardio'),
          distanceM: (r.distance_m as number | null) ?? null,
          durationMin: (r.duration_min as number | null) ?? null,
          inclinePct: (r.incline_pct as number | null) ?? null,
          kcal: (r.kcal as number | null) ?? null,
          avgBpm: (r.avg_hr as number | null) ?? null,
        }))

      return {
        id: s.id,
        date: s.started_at.slice(0, 10),
        startedAt: s.started_at,
        splitDay: s.split_day,
        dayKey: s.day_key,
        volumeKg: s.total_volume_kg ?? computedVolume,
        setCount: s.set_count ?? workingSetCount,
        workingSets: workingSetCount,
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
        ghostSets,
        dropsetSets,
        cardio,
      }
    },
  })
}
