'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Phase } from '@/lib/nutrition/phase'
import type { GymReportRow } from '@/lib/hooks/useWeekly'

/** The full master record for one logical day (Phase 16 Day Vault). */
export interface DayVaultData {
  log: {
    steps: number | null; water_ml: number | null; sleep_minutes: number | null
    weight_kg: number | null; lean_mass_kg: number | null; body_fat_pct: number | null
    avg_rest_heart_rate: number | null; hrv_ms: number | null; respiratory_rate: number | null
    blood_oxygen: number | null; training_minutes: number | null; exercise_minutes: number | null
    stand_hours: number | null; vo2max: number | null; active_energy: number | null
    effort_rating: number | null; mood: number | null; journal_md: string | null
  } | null
  score: { score: number | null; battery_pct: number | null } | null
  nutrition: { calories: number; protein_g: number; carbs_g: number; fat_g: number; phase: Phase | null } | null
  sessions: GymReportRow[]
}

/** Core Trio completeness: sleep · water · food. Optional data never penalizes. */
export function dayCompleteness(d: DayVaultData | undefined): { done: number; parts: [boolean, boolean, boolean] } {
  const sleep = (d?.log?.sleep_minutes ?? 0) > 0
  const water = (d?.log?.water_ml ?? 0) > 0
  const food = d?.nutrition != null
  const parts: [boolean, boolean, boolean] = [sleep, water, food]
  return { done: parts.filter(Boolean).length, parts }
}

export function useDayVault(date: string) {
  return useQuery({
    queryKey: ['day_vault', date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async (): Promise<DayVaultData> => {
      const nextDay = (() => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) })()
      const [logRes, scoreRes, nutritionRes, sessionsRes] = await Promise.all([
        supabase.from('daily_logs').select('steps, water_ml, sleep_minutes, weight_kg, lean_mass_kg, body_fat_pct, avg_rest_heart_rate, hrv_ms, respiratory_rate, blood_oxygen, training_minutes, exercise_minutes, stand_hours, vo2max, active_energy, effort_rating, mood, journal_md')
          .eq('date', date).maybeSingle(),
        supabase.from('daily_scores').select('score, battery_pct').eq('date', date).maybeSingle(),
        supabase.from('nutrition_entries').select('calories, protein_g, carbs_g, fat_g, phase')
          .eq('date', date).eq('meal_type', 'daily').maybeSingle(),
        supabase.from('workout_sessions')
          .select('id, started_at, split_day, report_md, duration_min, avg_bpm, total_volume_kg, set_count, pr_count')
          .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${nextDay}T00:00:00Z`)
          .order('started_at', { ascending: true }),
      ])
      const sessions = ((sessionsRes.data ?? []) as Array<{
        id: string; started_at: string; split_day: string; report_md: string | null
        duration_min: number | null; avg_bpm: number | null; total_volume_kg: number | null
        set_count: number | null; pr_count: number | null
      }>).map((r) => ({
        id: r.id, date: r.started_at.slice(0, 10), split: r.split_day, reportMd: r.report_md ?? '',
        durationMin: r.duration_min, avgBpm: r.avg_bpm, volumeKg: r.total_volume_kg,
        setCount: r.set_count, prCount: r.pr_count,
      }))
      return {
        log: (logRes.data ?? null) as DayVaultData['log'],
        score: (scoreRes.data ?? null) as DayVaultData['score'],
        nutrition: (nutritionRes.data ?? null) as DayVaultData['nutrition'],
        sessions,
      }
    },
    staleTime: 60_000,
  })
}

export interface SubjectivePatch { effort_rating?: number | null; mood?: number | null; journal_md?: string | null }

/** Save the subjective block (effort / mood / journal) onto the day's daily_logs row. */
export function useSaveSubjective(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: SubjectivePatch) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('daily_logs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ user_id: user.id, date, ...patch } as any, { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['day_vault', date] }) },
  })
}
