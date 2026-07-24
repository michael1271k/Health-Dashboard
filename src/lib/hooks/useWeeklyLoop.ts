'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import {
  buildWeeklyExport, weekTotals,
  type ExportDay, type ExportSession, type ExportExercise, type ExportDoms,
} from '@/lib/reports/weeklyExport'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, eraForDate, isTrainingDay } from '@/lib/programs'
import { repWindowFor } from '@/lib/training/ceilings'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type Program } from '@/lib/training/landmarks'
import { normalizeSpO2 } from '@/lib/utils/units'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The AI weekly-summary report type stored in `reports`. */
export const WEEKLY_AI_TYPE = 'weekly_ai'

interface RawSet {
  id: string; pair_id: string | null; side: string | null; weight_kg: number; reps: number
  est_1rm_kg: number | null; set_type: string | null; is_pr: boolean | null
  session_id: string
  exercises: { name: string; muscle_groups: string[] | null }
}
interface RawSession {
  id: string; started_at: string; split_day: string; day_key: string | null
  total_volume_kg: number | null; set_count: number | null
  duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
}

/** Pull every table a week's export needs, for an arbitrary [start, end] range. */
async function fetchRange(weekStart: string, weekEnd: string) {
  const startInstant = new Date(`${weekStart}T00:00:00`).toISOString()
  const endInstant = new Date(`${isoAddDays(weekEnd, 1)}T00:00:00`).toISOString()

  const [logs, scores, nutrition, sessions, sets, water, supps, doms] = await Promise.all([
    supabase.from('daily_logs')
      .select('date, weight_kg, steps, distance_m, active_energy, training_minutes, sleep_minutes, water_ml, avg_rest_heart_rate, hrv_ms, blood_oxygen')
      .gte('date', weekStart).lte('date', weekEnd),
    supabase.from('daily_scores').select('date, score, battery_pct').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g')
      .eq('meal_type', 'daily').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('workout_sessions')
      .select('id, started_at, split_day, day_key, total_volume_kg, set_count, duration_min, avg_bpm, calories_burned')
      .gte('started_at', startInstant).lt('started_at', endInstant).order('started_at', { ascending: true }),
    // Sets are scoped by their PARENT SESSION's started_at, not their own
    // created_at — a session logged days later (back-dated) has created_at
    // outside the week and used to vanish from its own export.
    supabase.from('workout_sets')
      .select('id, pair_id, side, weight_kg, reps, est_1rm_kg, set_type, is_pr, session_id, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
      .gte('workout_sessions.started_at', startInstant).lt('workout_sessions.started_at', endInstant)
      .limit(3000),
    supabase.from('water_intake').select('date, amount_ml').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('supplement_log').select('date, item_key').eq('taken', true).gte('date', weekStart).lte('date', weekEnd),
    supabase.from('doms_logs').select('date, muscle_group, severity').gte('date', weekStart).lte('date', weekEnd),
  ])

  return {
    logs: (logs.data ?? []) as Array<Record<string, number | string | null>>,
    scores: (scores.data ?? []) as Array<Record<string, number | string | null>>,
    nutrition: (nutrition.data ?? []) as Array<Record<string, number | string | null>>,
    sessions: (sessions.data ?? []) as unknown as RawSession[],
    sets: (sets.data ?? []) as unknown as RawSet[],
    water: (water.data ?? []) as Array<{ date: string; amount_ml: number }>,
    supps: (supps.data ?? []) as Array<{ date: string; item_key: string }>,
    // doms_logs may not be migrated yet — an error just means no soreness rows.
    doms: (doms.error ? [] : (doms.data ?? [])) as Array<{ date: string; muscle_group: string; severity: number }>,
  }
}

type RangeData = Awaited<ReturnType<typeof fetchRange>>

/** Shape a fetched range into the export's day rows. */
function toDays(weekStart: string, d: RangeData): ExportDay[] {
  const byDate = <T extends { date?: unknown }>(rows: T[]) =>
    new Map(rows.map((r) => [r.date as string, r]))
  const logs = byDate(d.logs), scores = byDate(d.scores), nutri = byDate(d.nutrition)

  const waterByDate = new Map<string, number>()
  for (const w of d.water) waterByDate.set(w.date, (waterByDate.get(w.date) ?? 0) + w.amount_ml)
  const suppsByDate = new Map<string, number>()
  for (const s of d.supps) suppsByDate.set(s.date, (suppsByDate.get(s.date) ?? 0) + 1)

  return Array.from({ length: 7 }, (_, i) => {
    const date = isoAddDays(weekStart, i)
    const l = logs.get(date) as Record<string, number | null> | undefined
    const nt = nutri.get(date) as Record<string, number | null> | undefined
    const sc = scores.get(date) as Record<string, number | null> | undefined
    return {
      date, weekdayLabel: WD[i], isTrainingDay: isTrainingDay(date),
      weightKg: l?.weight_kg ?? null,
      calories: nt?.calories ?? null,
      proteinG: nt?.protein_g ?? null,
      carbsG: nt?.carbs_g ?? null,
      fatG: nt?.fat_g ?? null,
      steps: l?.steps ?? null,
      distanceM: l?.distance_m ?? null,
      activeKcal: l?.active_energy ?? null,
      trainingMin: l?.training_minutes ?? null,
      sleepMin: l?.sleep_minutes ?? null,
      deepMin: null,   // stage split lives in sleep_sessions; totals suffice here
      remMin: null,
      restingHr: l?.avg_rest_heart_rate ?? null,
      hrvMs: l?.hrv_ms ?? null,
      waterMl: waterByDate.get(date) ?? l?.water_ml ?? null,
      supplementsTaken: suppsByDate.get(date) ?? null,
      score: sc?.score ?? null,
      batteryPct: sc?.battery_pct ?? null,
    }
  })
}

/** Shape a fetched range into the export's session rows (with every set). */
function toSessions(d: RangeData): ExportSession[] {
  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  return d.sessions.map((s) => {
    const mine = d.sets.filter((r) => r.session_id === s.id && r.set_type !== 'warmup')
    const byName = new Map<string, ExportExercise>()
    for (const r of mine) {
      const e = byName.get(r.exercises.name) ?? {
        name: r.exercises.name, sets: [], topKg: null,
        repWindow: (() => {
          const w = repWindowFor(r.exercises.name, s.day_key)
          return w ? `${w.floor}–${w.ceiling}` : null
        })(),
      }
      e.sets.push({
        weightKg: r.weight_kg, reps: r.reps,
        side: r.side === 'L' || r.side === 'R' ? r.side : null,
        failure: r.set_type === 'failure',
        pairId: r.pair_id,
      })
      e.topKg = Math.max(e.topKg ?? 0, r.weight_kg) || null
      byName.set(r.exercises.name, e)
    }
    // A unilateral pair (shared pair_id) is ONE set to failure, not two.
    const failurePairs = new Set(mine.filter((r) => r.set_type === 'failure').map((r) => r.pair_id ?? r.id))
    return {
      date: s.started_at.slice(0, 10),
      label: (s.day_key && program.days.find((x) => x.key === s.day_key)?.label) ?? s.split_day,
      volumeKg: s.total_volume_kg, setCount: s.set_count,
      failureSets: failurePairs.size,
      durationMin: s.duration_min, avgBpm: s.avg_bpm, caloriesBurned: s.calories_burned,
      exercises: [...byName.values()],
      // Named PRs, not a bare count. No est-1RM — the raw lift only.
      prs: mine.filter((r) => r.is_pr).map((r) => ({
        name: r.exercises.name, weightKg: r.weight_kg, reps: r.reps,
      })),
    }
  })
}

/**
 * Assemble the full week payload (days · sessions with every set · direct-set
 * volume · soreness · the previous week for comparison) and render it as the AI
 * prompt string. One hook powers every "Export Week" button.
 */
export function useWeeklyExport(weekStart = weekStartOf(logicalTodayISO())) {
  const weekEnd = isoAddDays(weekStart, 6)
  const prevStart = isoAddDays(weekStart, -7)
  return useQuery({
    queryKey: ['weekly_export', weekStart],
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const [cur, prev, goalsRes] = await Promise.all([
        fetchRange(weekStart, weekEnd),
        fetchRange(prevStart, isoAddDays(prevStart, 6)),
        supabase.from('user_goals').select('calorie_goal, protein_goal_g, steps_goal, sleep_goal_hours').maybeSingle(),
      ])
      const goals = goalsRes.data as {
        calorie_goal?: number; protein_goal_g?: number; steps_goal?: number; sleep_goal_hours?: number
      } | null

      const days = toDays(weekStart, cur)
      const sessions = toSessions(cur)

      // DIRECT-set weekly volume, same rule as the Weekly Volume card.
      const prog: Program = (goals?.calorie_goal ?? 0) >= 2450 ? 'bulk' : 'cut'
      const volumeByMuscle = weeklyVolumeByMuscle(
        cur.sets.filter((r) => r.set_type !== 'warmup').map((r) => ({
          muscleTokens: lookupMuscles(r.exercises.name)?.primary ?? (r.exercises.muscle_groups ?? []).slice(0, 1),
          dedupeKey: r.pair_id ?? r.id,
        })),
        prog,
      ).map((m) => ({ muscle: m.muscle, sets: m.sets, target: m.target }))

      const doms: ExportDoms[] = cur.doms
        .map((r) => ({ date: r.date, muscle: r.muscle_group, severity: r.severity }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.muscle.localeCompare(b.muscle))

      return buildWeeklyExport({
        weekStart, weekEnd,
        programLabel: eraForDate(weekStart) === 'axis' ? `Helix ${prog === 'cut' ? 'Cut' : 'Bulk'}` : 'PPL (legacy)',
        calorieGoal: goals?.calorie_goal ?? null,
        proteinGoalG: goals?.protein_goal_g ?? null,
        stepsGoal: goals?.steps_goal ?? null,
        sleepGoalHours: goals?.sleep_goal_hours ?? null,
        days, sessions, volumeByMuscle, doms,
        previous: weekTotals(toDays(prevStart, prev), toSessions(prev)),
      })
    },
  })
}

export interface WeeklyAiSummary {
  id: string
  weekStart: string
  content: string
  createdAt: string
}

/** The stored AI weekly summaries (newest first). */
export function useWeeklyAiSummaries(limit = 12) {
  return useQuery({
    queryKey: ['reports', WEEKLY_AI_TYPE, limit],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyAiSummary[]> => {
      const { data, error } = await supabase.from('reports')
        .select('id, period_start, content_md, created_at')
        .eq('type', WEEKLY_AI_TYPE).order('period_start', { ascending: false }).limit(limit)
      if (error) return []
      return ((data ?? []) as unknown as Array<{ id: string; period_start: string; content_md: string | null; created_at: string }>)
        .map((r) => ({ id: r.id, weekStart: r.period_start, content: r.content_md ?? '', createdAt: r.created_at }))
    },
  })
}

/** Save a pasted AI weekly summary against its week (upsert — re-paste replaces). */
export function useSaveWeeklyAiSummary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekStart, content }: { weekStart: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('reports').upsert({
        user_id: user.id,
        type: WEEKLY_AI_TYPE,
        period_start: weekStart,
        period_end: isoAddDays(weekStart, 6),
        content_md: content.trim(),
      } as never, { onConflict: 'user_id,type,period_start' })
      // The upsert needs a unique index on (user_id, type, period_start); without
      // it Postgres raises 42P10. Surface that as an actionable message rather
      // than a raw code, since the fix is a one-line migration.
      if (error) {
        throw new Error(/42P10|no unique|exclusion constraint/i.test(error.message)
          ? 'Missing unique index on reports(user_id, type, period_start) — run the migration.'
          : error.message)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }) },
  })
}

// Re-exported so callers don't need a second import for the SpO2 helper.
export { normalizeSpO2 }
