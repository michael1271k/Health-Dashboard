'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { MUSCLE_MAP, MUSCLE_GROUPS } from '@/lib/hooks/useMuscleAnalytics'

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
  calories: number | null
  exercises: DetailExercise[]
  /** Working-set distribution across the six groups (0-filled, sorted desc). */
  muscleSets: Array<{ group: string; sets: number }>
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
        .select('id, started_at, split_day, day_key, total_volume_kg, set_count, pr_count, duration_min, avg_bpm, calories_burned')
        .eq('id', sessionId as string)
        .single()
      const s = sRaw as {
        id: string; started_at: string; split_day: string; day_key: string | null
        total_volume_kg: number | null; set_count: number | null; pr_count: number | null
        duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
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
      const muscleAgg = new Map<string, number>()
      let failureSets = 0
      let warmupSets = 0

      for (const r of rows) {
        const setType = r.set_type ?? 'normal'
        const isWarmup = setType === 'warmup'
        if (isWarmup) warmupSets += 1
        if (setType === 'failure') failureSets += 1

        let ex = byEx.get(r.exercise_id)
        if (!ex) {
          const groups = [...new Set((r.exercises.muscle_groups ?? [])
            .map((m) => MUSCLE_MAP[m.toLowerCase()])
            .filter(Boolean))]
          ex = {
            exerciseId: r.exercise_id,
            name: r.exercises.name,
            order: r.exercise_order ?? 999,
            muscleGroups: groups,
            isCompound: r.exercises.is_compound,
            sets: [], workingSets: 0, topKg: 0, volumeKg: 0, bestEst1rm: null,
          }
          byEx.set(r.exercise_id, ex)
        }
        ex.sets.push({
          setNumber: r.set_number, weightKg: r.weight_kg, reps: r.reps,
          rpe: r.rpe, isPr: r.is_pr, est1rmKg: r.est_1rm_kg, setType,
          side: r.side ?? null, pairId: r.pair_id ?? null,
        })
        if (!isWarmup) {
          ex.workingSets += 1
          ex.volumeKg += (r.weight_kg || 0) * (r.reps || 0)
          if (r.weight_kg > ex.topKg) ex.topKg = r.weight_kg
          if (r.est_1rm_kg != null && (ex.bestEst1rm == null || r.est_1rm_kg > ex.bestEst1rm)) ex.bestEst1rm = r.est_1rm_kg
          // Distribute one working set to each of the exercise's canonical groups.
          for (const g of ex.muscleGroups) muscleAgg.set(g, (muscleAgg.get(g) ?? 0) + 1)
        }
      }

      const exercises = [...byEx.values()].sort((a, b) => a.order - b.order)
      exercises.forEach((e) => { e.volumeKg = Math.round(e.volumeKg) })

      const muscleSets = MUSCLE_GROUPS
        .map((g) => ({ group: g as string, sets: muscleAgg.get(g) ?? 0 }))
        .filter((m) => m.sets > 0)
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
        calories: s.calories_burned,
        exercises,
        muscleSets,
        failureSets,
        warmupSets,
      }
    },
  })
}
