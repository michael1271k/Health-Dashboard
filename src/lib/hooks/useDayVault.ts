'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { invalidateWorkoutData } from '@/lib/query/workoutKeys'
import { eraForDate, AXIS_ERA_START, HELIX_CUT_START } from '@/lib/programs'
import { hoursAwakeToday, logicalTodayISO } from '@/lib/utils/day'
import type { Phase } from '@/lib/nutrition/phase'
import type { GymReportRow } from '@/lib/hooks/useWeekly'

const addDayISO = (d: string, n: number): string => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10)
}

/** The full master record for one logical day (the Daily Nexus). */
export interface DayVaultData {
  log: {
    steps: number | null; water_ml: number | null; sleep_minutes: number | null
    weight_kg: number | null; lean_mass_kg: number | null; body_fat_pct: number | null
    avg_rest_heart_rate: number | null; hrv_ms: number | null; respiratory_rate: number | null
    blood_oxygen: number | null; training_minutes: number | null; exercise_minutes: number | null
    stand_hours: number | null; vo2max: number | null; active_energy: number | null
    muscle_percent: number | null; water_percent: number | null; bone_mineral: number | null
    visceral_fat: number | null; bmr: number | null; bmi: number | null
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
        supabase.from('daily_logs').select('steps, water_ml, sleep_minutes, weight_kg, lean_mass_kg, body_fat_pct, avg_rest_heart_rate, hrv_ms, respiratory_rate, blood_oxygen, training_minutes, exercise_minutes, stand_hours, vo2max, active_energy, muscle_percent, water_percent, bone_mineral, visceral_fat, bmr, bmi, effort_rating, mood, journal_md')
          .eq('date', date).maybeSingle(),
        supabase.from('daily_scores').select('score, battery_pct').eq('date', date).maybeSingle(),
        supabase.from('nutrition_entries').select('calories, protein_g, carbs_g, fat_g, phase')
          .eq('date', date).eq('meal_type', 'daily').maybeSingle(),
        supabase.from('workout_sessions')
          .select('id, started_at, split_day, day_key, report_md, duration_min, avg_bpm, total_volume_kg, set_count, pr_count, calories_burned')
          .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${nextDay}T00:00:00Z`)
          .order('started_at', { ascending: true }),
      ])
      const sessions = ((sessionsRes.data ?? []) as Array<{
        id: string; started_at: string; split_day: string; day_key: string | null; report_md: string | null
        duration_min: number | null; avg_bpm: number | null; total_volume_kg: number | null
        set_count: number | null; pr_count: number | null; calories_burned: number | null
      }>).map((r) => ({
        id: r.id, date: r.started_at.slice(0, 10), split: r.split_day, dayKey: r.day_key, reportMd: r.report_md ?? '',
        durationMin: r.duration_min, avgBpm: r.avg_bpm, volumeKg: r.total_volume_kg,
        setCount: r.set_count, prCount: r.pr_count, calories: r.calories_burned,
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

/** Dates (YYYY-MM-DD) that already have a logged session — for the date picker
 *  to gray them out and enforce one session per date. */
export function useLoggedSessionDates() {
  return useQuery({
    queryKey: ['workout_sessions', 'logged_dates'],
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('workout_sessions')
        .select('started_at').order('started_at', { ascending: false }).limit(500)
      if (error) return new Set<string>()
      const set = new Set<string>()
      for (const r of (data ?? []) as Array<{ started_at: string }>) set.add(r.started_at.slice(0, 10))
      return set
    },
  })
}

/**
 * ISOLATED workout delete: removes ONLY the session + its sets (RLS owner-scoped)
 * — never nutrition, sleep, weight or scale rows, which live in separate tables
 * (nutrition_entries, sleep_sessions, daily_logs, body_composition, water_intake).
 * Then best-effort recomputes the day's score so workout_score reflects the removal.
 */
export function useDeleteSession(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      // Child sets first (in case there's no ON DELETE CASCADE), then the session.
      const { error: e1 } = await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('user_id', user.id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('workout_sessions').delete().eq('id', sessionId).eq('user_id', user.id)
      if (e2) throw new Error(e2.message)
      try {
        await authedFetch('/api/compute-score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, force: true, isToday: date === logicalTodayISO(), backfillDays: 0, hoursAwake: hoursAwakeToday() }),
        })
      } catch { /* score recompute is best-effort */ }
    },
    onSuccess: () => {
      // Same full cascade as commit — a delete must un-count everywhere too.
      invalidateWorkoutData(qc)
    },
  })
}

/**
 * Session number within the current training ERA ("Session #3"). The counter
 * restarts at the era boundary (HELIX_CUT_START) so the Helix 5.1 program
 * numbers from #1 — Upper B (Jul 16)=#1, Legs B (Jul 17)=#2, Upper A (Jul 19)=#3
 * — instead of inheriting the PPL-era all-time total (#77/#78). Uses the same
 * date→era boundary as `eraForDate`, NOT the Week-1 schedule anchor
 * (AXIS_ERA_START), so the two pre-anchor Helix sessions still count.
 */
export function useGlobalSessionNumber(date: string) {
  return useQuery({
    queryKey: ['session_global_number', date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const eraStart = eraForDate(date) === 'axis' ? HELIX_CUT_START : '2000-01-01'
      const { count, error } = await supabase.from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', `${eraStart}T00:00:00Z`)
        .lt('started_at', `${addDayISO(date, 1)}T00:00:00Z`)
      if (error) return 1
      return Math.max(1, count ?? 1)
    },
  })
}

/** 1-based ordinal of this session among same-type sessions in the era ("#2"). */
export function useSessionOrdinal(dayKey: string | null | undefined, splitDay: string, date: string) {
  return useQuery({
    queryKey: ['session_ordinal', dayKey ?? splitDay, date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const eraStart = eraForDate(date) === 'axis' ? AXIS_ERA_START : '2000-01-01'
      const end = addDayISO(date, 1)
      const { data, error } = await supabase.from('workout_sessions')
        .select('day_key, split_day')
        .gte('started_at', `${eraStart}T00:00:00Z`).lt('started_at', `${end}T00:00:00Z`)
      if (error) return 1
      const rows = (data ?? []) as Array<{ day_key: string | null; split_day: string }>
      const match = rows.filter((r) => (dayKey ? r.day_key === dayKey : r.split_day === splitDay))
      return Math.max(1, match.length)
    },
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

/** The InBody card's structured fields — all daily_logs columns. */
export interface BodyMetricsPatch {
  weight_kg?: number | null
  body_fat_pct?: number | null
  muscle_percent?: number | null
  water_percent?: number | null
  lean_mass_kg?: number | null
  bone_mineral?: number | null
  visceral_fat?: number | null
  bmr?: number | null
  bmi?: number | null
}

/**
 * Save the InBody & Scale Metrics card: upsert onto the day's daily_logs row
 * (the home Body modal + Nexus read it), then mirror the overlapping fields
 * into body_composition (the weight-trend charts read that). Mirror semantics
 * follow the old /api/ai/complete-daily route this replaces: update-if-exists,
 * INSERT only when a weight is present — body_composition.weight_kg is NOT NULL.
 */
export function useSaveBodyMetrics(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: BodyMetricsPatch) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('daily_logs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ user_id: user.id, date, ...patch } as any, { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)

      const mirror: Record<string, number | null> = {}
      if (patch.weight_kg !== undefined) mirror.weight_kg = patch.weight_kg
      if (patch.body_fat_pct !== undefined) mirror.body_fat_pct = patch.body_fat_pct
      if (patch.lean_mass_kg !== undefined) mirror.muscle_mass_kg = patch.lean_mass_kg
      if (patch.water_percent !== undefined) mirror.water_pct = patch.water_percent
      if (patch.muscle_percent !== undefined) mirror.muscle_pct = patch.muscle_percent
      if (patch.bone_mineral !== undefined) mirror.bone_mineral_pct = patch.bone_mineral
      if (patch.visceral_fat !== undefined) mirror.visceral_fat = patch.visceral_fat
      if (patch.bmr !== undefined) mirror.bmr = patch.bmr
      if (patch.bmi !== undefined) mirror.bmi = patch.bmi
      if (Object.keys(mirror).length) {
        const { data: existing } = await supabase.from('body_composition')
          .select('id').eq('user_id', user.id).eq('date', date).limit(1).maybeSingle()
        if (existing) {
          const { error: e2 } = await supabase.from('body_composition')
            .update(mirror as unknown as never).eq('id', (existing as { id: string }).id)
          if (e2) throw new Error(e2.message)
        } else if (mirror.weight_kg != null) {
          const { error: e3 } = await supabase.from('body_composition')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({ user_id: user.id, date, measured_at: `${date}T07:00:00Z`, hk_uuid: null, ...mirror } as any)
          if (e3) throw new Error(e3.message)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day_vault', date] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
      qc.invalidateQueries({ queryKey: ['body_composition'] })
    },
  })
}
