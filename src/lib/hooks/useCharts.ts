'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'
import { epley1RM } from '@/lib/utils/epley'
import { validWeight } from '@/lib/utils/units'
import { eraForDate } from '@/lib/programs'

/**
 * Charts are the most expensive queries in the app (multi-hundred-row scans over
 * `workout_sets` / `daily_logs`) and the least time-sensitive — a trend line does
 * not change meaningfully within a session. They used to inherit the global 60s
 * default, so every navigation back to Analytics re-ran the lot.
 */
const CHART_STALE_MS = 5 * 60 * 1000

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

/**
 * `muscle_mass_kg` and `fat_free_mass_kg` are DIFFERENT quantities — weight ×
 * muscle% and weight − fat respectively, about 2.6 kg apart — and both are
 * carried so the chart never has to choose one and call it "lean".
 */
export type BodyTrendRow =
  Pick<Tables<'body_composition'>, 'date' | 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg'>
  & { fat_free_mass_kg?: number | null }

export interface BodyDetailRow {
  date: string
  water_percent: number | null
  muscle_percent: number | null
  visceral_fat: number | null
  body_fat_pct: number | null
}

/** Trend of the InBody detail metrics (water %, muscle %, visceral, fat %) from
 *  daily_logs — the numbers a smart scale reports beyond weight. */
export function useBodyDetailTrend(days = 90) {
  return useQuery({
    queryKey: ['daily_logs', 'body_detail', days],
    staleTime: CHART_STALE_MS,
    queryFn: async (): Promise<BodyDetailRow[]> => {
      const since = daysAgo(days)
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, water_percent, muscle_percent, visceral_fat, body_fat_pct')
        .gte('date', since)
        .order('date', { ascending: true })
      if (error) throw error
      return ((data ?? []) as BodyDetailRow[]).filter(
        (r) => r.water_percent != null || r.muscle_percent != null || r.visceral_fat != null || r.body_fat_pct != null,
      )
    },
  })
}

/**
 * Merge the two places a body reading can live, newest-wins per FIELD per date.
 *
 * `body_composition` is the ledger the charts were built on, but its
 * `weight_kg` is NOT NULL — a Daily Nexus entry of BMI or body-fat on a day with
 * no weight cannot open a row there, so it only ever reaches `daily_logs`. The
 * graph read the ledger alone and was therefore blind to exactly the entries the
 * user had just made by hand. Unioning the two makes the chart show everything
 * that was actually recorded, from whichever table holds it.
 *
 * Pure + exported so the precedence rule is testable without a DB.
 */
export function mergeBodyTrend(ledger: BodyTrendRow[], logs: BodyTrendRow[]): BodyTrendRow[] {
  const byDate = new Map<string, BodyTrendRow>()
  // daily_logs first so the ledger (the deliberate weigh-in record) overwrites it.
  for (const r of [...logs, ...ledger]) {
    const cur = byDate.get(r.date)
    byDate.set(r.date, {
      date: r.date,
      weight_kg: r.weight_kg ?? cur?.weight_kg ?? null,
      body_fat_pct: r.body_fat_pct ?? cur?.body_fat_pct ?? null,
      muscle_mass_kg: r.muscle_mass_kg ?? cur?.muscle_mass_kg ?? null,
      fat_free_mass_kg: r.fat_free_mass_kg ?? cur?.fat_free_mass_kg ?? null,
    })
  }
  // Global rule: sub-50kg readings are scale artifacts — drop the row entirely.
  return [...byDate.values()]
    .filter((r) => validWeight(r.weight_kg) != null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function useWeightTrend(days = 90) {
  return useQuery({
    queryKey: ['body_composition', 'trend', days],
    staleTime: CHART_STALE_MS,
    queryFn: async (): Promise<BodyTrendRow[]> => {
      const since = daysAgo(days)
      const [bc, dl] = await Promise.all([
        supabase.from('body_composition')
          .select('date, weight_kg, body_fat_pct, muscle_mass_kg, fat_free_mass_kg').gte('date', since),
        // Both masses by their own names. `lean_mass_kg` used to be aliased to
        // muscle_mass_kg here, which is what carried the FFM/muscle ambiguity
        // all the way into the chart.
        supabase.from('daily_logs')
          .select('date, weight_kg, body_fat_pct, muscle_mass_kg, fat_free_mass_kg').gte('date', since),
      ])
      if (bc.error) throw bc.error
      const logs = ((dl.data ?? []) as Array<{
        date: string; weight_kg: number | null; body_fat_pct: number | null
        muscle_mass_kg: number | null; fat_free_mass_kg: number | null
      }>).map((r) => ({
        date: r.date, weight_kg: r.weight_kg, body_fat_pct: r.body_fat_pct,
        muscle_mass_kg: r.muscle_mass_kg, fat_free_mass_kg: r.fat_free_mass_kg,
      })) as BodyTrendRow[]
      return mergeBodyTrend((bc.data ?? []) as BodyTrendRow[], logs)
    },
  })
}

export type VolumePoint = { date: string; volume: number; split: string }

export function useVolumeTrend(days = 90) {
  return useQuery({
    queryKey: ['workout_sessions', 'volume_trend', days],
    staleTime: CHART_STALE_MS,
    queryFn: async (): Promise<VolumePoint[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('started_at, total_volume_kg, split_day, notes')
        .gte('started_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('started_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as Array<{ started_at: string; total_volume_kg: number | null; split_day: string; notes: string | null }>)
        .filter((r) => r.total_volume_kg != null && !r.notes?.startsWith('__seed_'))
        .map((r) => ({ date: r.started_at.slice(0, 10), volume: Math.round(r.total_volume_kg as number), split: r.split_day }))
    },
  })
}

export function useMacroHistory(days = 14) {
  return useQuery({
    queryKey: ['nutrition_entries', 'history', days],
    staleTime: CHART_STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_entries')
        .select('date, calories, protein_g, carbs_g, fat_g')
        .eq('meal_type', 'daily')
        .gte('date', daysAgo(days))
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Pick<Tables<'nutrition_entries'>, 'date' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]
    },
  })
}

export type PRRow = {
  exercise_id: string
  exercise_name: string
  date: string
  est_1rm_kg: number
  weight_kg: number
  reps: number
}

export type PRRawRow = PRRow & { startedAt: string }

/**
 * Collapse per-set rows to ONE point per (exercise, session): the TOP set's
 * est-1RM. Plotting every set made a single session's top set then its back-off
 * sets read as a strength DROP (the "76→59kg" ghost). Result is sorted by date.
 */
export function collapseToSessionBest(rows: PRRawRow[]): PRRow[] {
  const best = new Map<string, PRRow>()
  for (const r of rows) {
    const key = `${r.exercise_id}|${r.startedAt}`
    const cur = best.get(key)
    if (!cur || r.est_1rm_kg > cur.est_1rm_kg) {
      best.set(key, {
        exercise_id: r.exercise_id, exercise_name: r.exercise_name,
        date: r.date, est_1rm_kg: r.est_1rm_kg, weight_kg: r.weight_kg, reps: r.reps,
      })
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function usePRHistory(exerciseId?: string, days = 180, era: 'all' | 'ppl' | 'axis' = 'all') {
  return useQuery({
    queryKey: ['workout_sets', 'pr_history', exerciseId, days, era],
    staleTime: CHART_STALE_MS,
    queryFn: async () => {
      let query = supabase
        .from('workout_sets')
        .select(`
          exercise_id,
          weight_kg,
          reps,
          est_1rm_kg,
          exercises!inner(name),
          workout_sessions!inner(started_at)
        `)
        // NOTE: no server-side order — PostgREST rejects ordering the parent
        // rows by an embedded column ("failed to parse order"), which made
        // this whole query 400 and left PR history silently empty. Rows are
        // sorted client-side by date below.
        .gte('workout_sessions.started_at', new Date(Date.now() - days * 86400000).toISOString())
        // Was unbounded, so a "Plan Era" range silently rode PostgREST's 1000-row
        // default with no way to know it had truncated. An explicit cap makes the
        // ceiling visible and matches the other set-scanning hooks.
        .limit(4000)

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
      } else {
        // Default: compound lifts only
        query = query.eq('exercises.is_compound', true)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string
        weight_kg: number
        reps: number
        est_1rm_kg: number | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>).map((row) => ({
        exercise_id: row.exercise_id,
        exercise_name: row.exercises.name,
        startedAt: row.workout_sessions.started_at,
        date: row.workout_sessions.started_at.slice(0, 10),
        // `||`, not `??`: rows logged before `epley1RM` learned to return null
        // hold a stored est_1rm_kg of exactly 0 for every bodyweight set, and 0
        // is not an estimate — it plotted core work as a flat zero series.
        est_1rm_kg: row.est_1rm_kg || epley1RM(row.weight_kg, row.reps),
        weight_kg: row.weight_kg,
        reps: row.reps,
      }))
        // A movement with no 1RM to estimate has no place on a 1RM chart.
        .filter((row): row is typeof row & { est_1rm_kg: number } => row.est_1rm_kg != null)
        .filter((row) => era === 'all' || eraForDate(row.date) === era)

      // GHOST-DATA FIX: one point per (exercise, session) — the TOP set's est-1RM.
      return collapseToSessionBest(rows) satisfies PRRow[]
    },
    enabled: true,
  })
}

// Epley formula: re-exported from server-safe utility module
export { epley1RM } from '@/lib/utils/epley'
