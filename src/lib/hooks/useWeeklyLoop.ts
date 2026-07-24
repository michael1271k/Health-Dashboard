'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { buildWeeklyExport, type ExportDay, type ExportSession } from '@/lib/reports/weeklyExport'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, eraForDate } from '@/lib/programs'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type Program } from '@/lib/training/landmarks'
import { normalizeSpO2 } from '@/lib/utils/units'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The AI weekly-summary report type stored in `reports`. */
export const WEEKLY_AI_TYPE = 'weekly_ai'

/**
 * Assemble the full week payload (days · sessions · direct-set volume) and
 * render it as the AI prompt string. One hook powers the "Export Week" button.
 */
export function useWeeklyExport(weekStart = weekStartOf(logicalTodayISO())) {
  const weekEnd = isoAddDays(weekStart, 6)
  return useQuery({
    queryKey: ['weekly_export', weekStart],
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const startInstant = new Date(`${weekStart}T00:00:00`).toISOString()
      const endInstant = new Date(`${isoAddDays(weekEnd, 1)}T00:00:00`).toISOString()

      const [logsRes, scoresRes, nutritionRes, sessionsRes, setsRes, goalsRes] = await Promise.all([
        supabase.from('daily_logs').select('date, weight_kg, steps, sleep_minutes, water_ml, blood_oxygen')
          .gte('date', weekStart).lte('date', weekEnd),
        supabase.from('daily_scores').select('date, score').gte('date', weekStart).lte('date', weekEnd),
        supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g')
          .eq('meal_type', 'daily').gte('date', weekStart).lte('date', weekEnd),
        supabase.from('workout_sessions')
          .select('id, started_at, split_day, day_key, total_volume_kg, set_count, duration_min, pr_count')
          .gte('started_at', startInstant).lt('started_at', endInstant).order('started_at', { ascending: true }),
        supabase.from('workout_sets')
          .select('id, pair_id, weight_kg, reps, est_1rm_kg, session_id, exercises!inner(name, muscle_groups)')
          .gte('created_at', startInstant).lt('created_at', endInstant).limit(2000),
        supabase.from('user_goals').select('calorie_goal').maybeSingle(),
      ])

      const logs = new Map((logsRes.data ?? []).map((r: Record<string, unknown>) => [r.date as string, r]))
      const scores = new Map((scoresRes.data ?? []).map((r: Record<string, unknown>) => [r.date as string, r]))
      const nutri = new Map((nutritionRes.data ?? []).map((r: Record<string, unknown>) => [r.date as string, r]))
      const calorieGoal = (goalsRes.data as { calorie_goal?: number } | null)?.calorie_goal ?? null

      const days: ExportDay[] = Array.from({ length: 7 }, (_, i) => {
        const date = isoAddDays(weekStart, i)
        const l = logs.get(date) as Record<string, number | null> | undefined
        const nt = nutri.get(date) as Record<string, number | null> | undefined
        const sc = scores.get(date) as Record<string, number | null> | undefined
        return {
          date, weekdayLabel: WD[i],
          weightKg: l?.weight_kg ?? null,
          calories: nt?.calories ?? null,
          proteinG: nt?.protein_g ?? null,
          carbsG: nt?.carbs_g ?? null,
          fatG: nt?.fat_g ?? null,
          steps: l?.steps ?? null,
          sleepMin: l?.sleep_minutes ?? null,
          waterMl: l?.water_ml ?? null,
          score: sc?.score ?? null,
        }
      })

      // Sets grouped per session, and per-exercise roll-ups.
      const setRows = ((setsRes.data ?? []) as unknown as Array<{
        id: string; pair_id: string | null; weight_kg: number; reps: number
        est_1rm_kg: number | null; session_id: string
        exercises: { name: string; muscle_groups: string[] | null }
      }>)

      const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
      const sessions: ExportSession[] = ((sessionsRes.data ?? []) as unknown as Array<{
        id: string; started_at: string; split_day: string; day_key: string | null
        total_volume_kg: number | null; set_count: number | null; duration_min: number | null; pr_count: number | null
      }>).map((s) => {
        const mine = setRows.filter((r) => r.session_id === s.id)
        const byName = new Map<string, { sets: number; topKg: number; bestE1rm: number }>()
        for (const r of mine) {
          const e = byName.get(r.exercises.name) ?? { sets: 0, topKg: 0, bestE1rm: 0 }
          e.sets += 1
          e.topKg = Math.max(e.topKg, r.weight_kg)
          e.bestE1rm = Math.max(e.bestE1rm, r.est_1rm_kg ?? 0)
          byName.set(r.exercises.name, e)
        }
        return {
          date: s.started_at.slice(0, 10),
          label: (s.day_key && program.days.find((d) => d.key === s.day_key)?.label) ?? s.split_day,
          volumeKg: s.total_volume_kg, setCount: s.set_count,
          durationMin: s.duration_min, prCount: s.pr_count,
          exercises: [...byName.entries()].map(([name, v]) => ({
            name, sets: v.sets, topKg: v.topKg || null, bestE1rm: v.bestE1rm || null,
          })),
        }
      })

      // DIRECT-set weekly volume, same rule as the Weekly Volume card.
      const prog: Program = calorieGoal != null && calorieGoal >= 2450 ? 'bulk' : 'cut'
      const volumeByMuscle = weeklyVolumeByMuscle(
        setRows.map((r) => ({
          muscleTokens: lookupMuscles(r.exercises.name)?.primary ?? (r.exercises.muscle_groups ?? []).slice(0, 1),
          dedupeKey: r.pair_id ?? r.id,
        })),
        prog,
      ).map((m) => ({ muscle: m.muscle, sets: m.sets, target: m.target }))

      return buildWeeklyExport({
        weekStart, weekEnd,
        programLabel: eraForDate(weekStart) === 'axis' ? `Helix ${prog === 'cut' ? 'Cut' : 'Bulk'}` : 'PPL (legacy)',
        calorieGoal, days, sessions, volumeByMuscle,
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
export function useWeeklyAiSummaries(limit = 8) {
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
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }) },
  })
}

// Re-exported so callers don't need a second import for the SpO2 helper.
export { normalizeSpO2 }
