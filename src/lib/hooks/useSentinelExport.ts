'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { activeProgram, activePhase, getActiveProgramId, isTrainingDay } from '@/lib/programs'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type ProgramPhase } from '@/lib/training/landmarks'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { activeKcalOf } from '@/lib/cardio/metrics'
import { weekLabelOf } from '@/lib/reports/weekNumber'
import {
  buildSentinelExport, SENTINEL_TYPE,
  type SentinelDay, type SentinelBodyComp, type SentinelSession, type SentinelExercise,
  type SentinelCardio, type SentinelVolume, type SentinelSet,
} from '@/lib/reports/sentinel'
import type { WeighIn } from '@/lib/reports/t4wm'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * The Sentinel-7 payload for a week.
 *
 * Extends the weekly export's fetch with what §1–§6 need and it lacks:
 * `daily_scores`, weigh-ins reaching BACK four weeks (T4WM is meaningless with
 * fewer than four points), the plan+phase targets, `session_rpe`, and the full
 * cardio field set. Every added query degrades to empty on error rather than
 * taking the report down.
 */
export function useSentinelExport(weekStart: string) {
  const { resolve, resolveVolume } = usePlanPhaseGoals()
  const planId = getActiveProgramId()
  const phase = activePhase() as ProgramPhase

  return useQuery({
    queryKey: ['sentinel_export', weekStart, planId, phase],
    enabled: !!weekStart,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const weekEnd = isoAddDays(weekStart, 6)
      const startInstant = new Date(`${weekStart}T00:00:00`).toISOString()
      const endInstant = new Date(`${isoAddDays(weekEnd, 1)}T00:00:00`).toISOString()
      // Four weigh-ins minimum for T4WM — reach back five weeks so a sparse
      // weigher still has four points.
      const historyStart = isoAddDays(weekStart, -35)

      const [logs, nutrition, scores, sessionRows, setRows, cardioRows, bodyRows, weighRows] =
        await Promise.all([
          supabase.from('daily_logs')
            .select('date, steps, sleep_minutes, water_ml, avg_rest_heart_rate, hrv_ms')
            .gte('date', weekStart).lte('date', weekEnd),
          supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g')
            .eq('meal_type', 'daily').gte('date', weekStart).lte('date', weekEnd),
          supabase.from('daily_scores').select('date, score').gte('date', weekStart).lte('date', weekEnd),
          // session_rpe is a newer column: fetching it inline would make a
          // pre-migration DB return NO sessions at all, not just no ratings.
          (async () => {
            const cols = 'id, started_at, split_day, day_key, total_volume_kg, set_count, duration_min, avg_bpm, calories_burned'
            const q = (c: string) => supabase.from('workout_sessions').select(c)
              .gte('started_at', startInstant).lt('started_at', endInstant)
              .order('started_at', { ascending: true })
            const full = await q(`${cols}, session_rpe`)
            return full.error ? q(cols) : full
          })(),
          supabase.from('workout_sets')
            .select('id, pair_id, side, weight_kg, reps, set_type, is_pr, session_id, exercise_order, set_number, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
            .gte('workout_sessions.started_at', startInstant).lt('workout_sessions.started_at', endInstant)
            .limit(3000),
          supabase.from('cardio_logs')
            .select('date, kind, distance_m, duration_min, kcal, active_kcal, total_kcal, avg_hr, effort')
            .gte('date', weekStart).lte('date', weekEnd).order('date', { ascending: true }),
          supabase.from('daily_logs')
            .select('date, weight_kg, bmi, body_fat_pct, fat_mass_kg, muscle_percent, muscle_mass_kg, fat_free_mass_kg, water_percent, visceral_fat, bmr')
            .gte('date', weekStart).lte('date', weekEnd).order('date', { ascending: true }),
          // T4WM history — deliberately outside the week.
          supabase.from('daily_logs').select('date, weight_kg')
            .gte('date', historyStart).lte('date', weekEnd)
            .not('weight_kg', 'is', null).order('date', { ascending: true }),
        ])

      type Rec = Record<string, number | string | null>
      const byDate = (rows: Rec[] | null) => new Map((rows ?? []).map((r) => [r.date as string, r]))
      const logMap = byDate(logs.data as Rec[] | null)
      const nutMap = byDate(nutrition.data as Rec[] | null)
      const scoreMap = byDate(scores.error ? [] : (scores.data as Rec[] | null))

      // ── Days ──
      const days: SentinelDay[] = Array.from({ length: 7 }, (_, i) => {
        const date = isoAddDays(weekStart, i)
        const l = logMap.get(date) as Record<string, number | null> | undefined
        const n = nutMap.get(date) as Record<string, number | null> | undefined
        return {
          date, weekdayLabel: WD[new Date(`${date}T12:00:00Z`).getUTCDay()],
          isTrainingDay: isTrainingDay(date),
          intakeKcal: n?.calories ?? null, proteinG: n?.protein_g ?? null,
          carbsG: n?.carbs_g ?? null, fatG: n?.fat_g ?? null,
          steps: l?.steps ?? null, sleepMin: l?.sleep_minutes ?? null, waterMl: l?.water_ml ?? null,
          restingHr: l?.avg_rest_heart_rate ?? null, hrvMs: l?.hrv_ms ?? null,
          score: (scoreMap.get(date) as Record<string, number | null> | undefined)?.score ?? null,
        }
      })

      // ── Body composition ──
      const bodyComp: SentinelBodyComp[] = bodyRows.error ? []
        : ((bodyRows.data ?? []) as unknown as Array<Record<string, number | string | null>>)
          .map((b) => ({
            date: b.date as string,
            weightKg: b.weight_kg as number | null, bmi: b.bmi as number | null,
            bodyFatPct: b.body_fat_pct as number | null, fatMassKg: b.fat_mass_kg as number | null,
            musclePercent: b.muscle_percent as number | null, muscleMassKg: b.muscle_mass_kg as number | null,
            fatFreeMassKg: b.fat_free_mass_kg as number | null, waterPercent: b.water_percent as number | null,
            visceralFat: b.visceral_fat as number | null, bmr: b.bmr as number | null,
          }))
          .filter((b) => [b.weightKg, b.bmi, b.bodyFatPct, b.musclePercent, b.bmr].some((v) => v != null))

      const weighInHistory: WeighIn[] = weighRows.error ? []
        : ((weighRows.data ?? []) as unknown as Array<{ date: string; weight_kg: number | null }>)
          .filter((r): r is { date: string; weight_kg: number } => r.weight_kg != null)
          .map((r) => ({ date: r.date, weightKg: r.weight_kg }))

      // ── Sessions ──
      type RawSet = {
        id: string; pair_id: string | null; side: string | null; weight_kg: number; reps: number
        set_type: string | null; is_pr: boolean | null; session_id: string
        exercise_order: number | null; set_number: number | null
        exercises: { name: string; muscle_groups: string[] | null }
      }
      const sets = (setRows.data ?? []) as unknown as RawSet[]
      const rpeOf = (r: Record<string, unknown>) =>
        typeof r.session_rpe === 'number' ? r.session_rpe : null

      const program = activeProgram()
      const sessions: SentinelSession[] = ((sessionRows.data ?? []) as unknown as Array<Record<string, unknown>>)
        .map((s) => {
          const id = s.id as string
          const dayKey = (s.day_key as string | null) ?? null
          const mine = sets.filter((r) => r.session_id === id)
            .sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0) || (a.set_number ?? 0) - (b.set_number ?? 0))

          const byName = new Map<string, SentinelExercise>()
          for (const r of mine) {
            const name = r.exercises.name
            const ex = byName.get(name) ?? {
              name, sets: [], targetRx: null, baseline: null, prAxes: [],
            }
            const set: SentinelSet = {
              weightKg: r.weight_kg, reps: r.reps, setType: r.set_type,
              isPr: !!r.is_pr,
              side: r.side === 'L' || r.side === 'R' ? r.side : null,
              pairId: r.pair_id,
            }
            ex.sets.push(set)
            if (r.is_pr && !ex.prAxes.includes('PR')) ex.prAxes.push('PR')
            if (!ex.targetRx) {
              const prog = program.days.find((d) => d.key === dayKey)?.exercises.find((e) => e.name === name)
              // The program's own prescription string ('8–12', '55s') — no reformatting.
              ex.targetRx = prog ? `${prog.sets} × ${prog.reps}` : null
            }
            byName.set(name, ex)
          }

          return {
            date: (s.started_at as string).slice(0, 10),
            label: (dayKey && program.days.find((d) => d.key === dayKey)?.label) ?? (s.split_day as string),
            volumeKg: mine.length
              ? sessionVolumeKg(mine.map((r) => ({
                weightKg: r.weight_kg, reps: r.reps,
                side: r.side === 'L' || r.side === 'R' ? r.side : null, pairId: r.pair_id,
              })))
              : (s.total_volume_kg as number | null),
            setCount: s.set_count as number | null,
            durationMin: s.duration_min as number | null,
            avgBpm: s.avg_bpm as number | null,
            caloriesBurned: s.calories_burned as number | null,
            sessionRpe: rpeOf(s),
            exercises: [...byName.values()],
          }
        })

      // ── Cardio ──
      const cardio: SentinelCardio[] = cardioRows.error ? []
        : ((cardioRows.data ?? []) as unknown as Array<Record<string, number | string | null>>).map((c) => ({
          date: c.date as string, kind: c.kind as string,
          distanceM: c.distance_m as number | null, durationMin: c.duration_min as number | null,
          activeKcal: activeKcalOf({ active_kcal: c.active_kcal as number | null, kcal: c.kcal as number | null }),
          totalKcal: c.total_kcal as number | null, avgHr: c.avg_hr as number | null,
          effort: c.effort as number | null,
        }))

      // ── Volume + failure policy ──
      const working = sets.filter((r) => r.set_type !== 'warmup')
      const graded = weeklyVolumeByMuscle(
        working.map((r) => ({
          muscleTokens: lookupMuscles(r.exercises.name)?.primary ?? (r.exercises.muscle_groups ?? []).slice(0, 1),
          dedupeKey: r.pair_id ?? r.id,
        })),
        phase,
        resolveVolume(planId, phase),
      )
      const failureByMuscle = new Map<string, Set<string>>()
      for (const r of working) {
        if (r.set_type !== 'failure') continue
        const tokens = lookupMuscles(r.exercises.name)?.primary ?? (r.exercises.muscle_groups ?? []).slice(0, 1)
        for (const m of graded) {
          if (!tokens.some((t) => t.toLowerCase().includes(m.muscle.split('/')[0].toLowerCase().slice(0, 4)))) continue
          failureByMuscle.set(m.muscle, (failureByMuscle.get(m.muscle) ?? new Set()).add(r.exercises.name))
        }
      }
      const volume: SentinelVolume[] = graded.map((g) => ({
        muscle: g.muscle, sets: g.sets, target: g.target,
        failureExercises: [...(failureByMuscle.get(g.muscle) ?? [])],
      }))

      const preset = resolve(planId, phase)

      return buildSentinelExport({
        weekStart, weekEnd,
        weekLabel: weekLabelOf(weekStart),
        planLabel: program.label,
        phase,
        days, bodyComp, weighInHistory, sessions, cardio, volume,
        targets: {
          calorieGoal: preset.calorieGoal, proteinGoalG: preset.proteinGoalG,
          carbsGoalG: preset.carbsGoalG, fatGoalG: preset.fatGoalG,
          stepsGoal: preset.stepsGoal, sleepGoalHours: 8, waterGoalMl: 3000,
          targetWeightKg: preset.targetWeightKg, targetBodyFatPct: preset.targetBodyFatPct ?? null,
          rateMinKgWk: preset.rateMinKgWk ?? null, rateMaxKgWk: preset.rateMaxKgWk ?? null,
        },
        // Populated from the previous Sentinel report once one exists.
        priorFindings: [],
        priorStalledWeeks: 0,
      })
    },
  })
}

export interface SentinelReport { id: string; weekStart: string; content: string; createdAt: string }

/** Stored Sentinel reports, newest first. */
export function useSentinelReports(limit = 24) {
  return useQuery({
    queryKey: ['reports', SENTINEL_TYPE, limit],
    staleTime: 60_000,
    queryFn: async (): Promise<SentinelReport[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, period_start, content_md, created_at')
        .eq('type', SENTINEL_TYPE)
        .order('period_start', { ascending: false })
        .limit(limit)
      if (error) return []
      return ((data ?? []) as unknown as Array<{ id: string; period_start: string; content_md: string | null; created_at: string }>)
        .filter((r) => r.content_md)
        .map((r) => ({ id: r.id, weekStart: r.period_start, content: r.content_md as string, createdAt: r.created_at }))
    },
  })
}

/** Save a pasted Sentinel report for a week. */
export function useSaveSentinelReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekStart, contentMd }: { weekStart: string; contentMd: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const { error } = await supabase.from('reports').upsert(
        {
          user_id: session.user.id, type: SENTINEL_TYPE,
          period_start: weekStartOf(weekStart), period_end: isoAddDays(weekStartOf(weekStart), 6),
          content_md: contentMd,
        } as unknown as never,
        { onConflict: 'user_id,type,period_start' },
      )
      if (error) {
        // 42P10 = no unique constraint matching the ON CONFLICT target.
        if (error.code === '42P10') throw new Error('Run the reports unique-index paste-SQL first.')
        throw error
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['reports'] }) },
  })
}
