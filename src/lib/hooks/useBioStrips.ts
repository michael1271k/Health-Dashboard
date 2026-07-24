'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO, logicalTodayISO } from '@/lib/utils/day'
import { validWeight } from '@/lib/utils/units'

export interface BioDay {
  date: string
  sleepMin: number | null
  steps: number | null
  weightKg: number | null
}

/**
 * Last 21 logical days of daily_logs (ascending) — powers the strip sparklines.
 *
 * 21 days, not 7: the Body strip carries the last weigh-in forward, and a 7-day
 * window silently dropped an older reading off the end, which made the recency
 * label snap to a more recent row than the real weigh-in.
 */
export function useBioSeries() {
  return useQuery({
    queryKey: ['daily_logs', 'bio_series'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BioDay[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, sleep_minutes, steps, weight_kg')
        .gte('date', logicalDaysAgoISO(21))
        .order('date', { ascending: true })
      if (error) throw error
      return ((data ?? []) as Array<{ date: string; sleep_minutes: number | null; steps: number | null; weight_kg: number | null }>)
        .map((r) => ({ date: r.date, sleepMin: r.sleep_minutes, steps: r.steps, weightKg: validWeight(r.weight_kg) }))
    },
  })
}

export interface WeighIn {
  /** Date of the most recent GENUINE weigh-in. */
  date: string
  kg: number
  /** The weigh-in before it, if any. */
  prevKg: number | null
  /** kg change vs the previous weigh-in (negative = lost). */
  delta: number
  /** Whole days between that weigh-in and today. */
  ageDays: number
}

/** Rows as stored, oldest → newest. */
export interface WeightRow { date: string; weightKg: number | null }

/**
 * Collapse a weight series to GENUINE weigh-ins and describe the latest one.
 *
 * Two things corrupted the old "Weighed yesterday" label:
 *  1. it read `daily_logs`, whose `weight_kg` is refreshed by the rolling
 *     HealthKit sync and by carry-forward — presence of a value is not proof
 *     that a weigh-in happened that day; and
 *  2. an unchanged value still counted, so re-pushing the same reading reset
 *     the clock to "today".
 *
 * A day only counts as a weigh-in when its weight DIFFERS from the previous
 * stored reading (>= 0.05 kg — below scale resolution). Pure + exported so the
 * rule is unit-testable without a DB.
 */
export function latestWeighIn(rows: WeightRow[], today = logicalTodayISO()): WeighIn | null {
  const valid = rows
    .map((r) => ({ date: r.date, kg: validWeight(r.weightKg) }))
    .filter((r): r is { date: string; kg: number } => r.kg != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!valid.length) return null

  // Keep the first reading, then every reading that actually moved the scale.
  const changes: Array<{ date: string; kg: number }> = [valid[0]]
  for (const r of valid.slice(1)) {
    if (Math.abs(r.kg - changes[changes.length - 1].kg) >= 0.05) changes.push(r)
  }

  const last = changes[changes.length - 1]
  const prev = changes.length >= 2 ? changes[changes.length - 2] : null
  const ageDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000,
  )
  return {
    date: last.date,
    kg: last.kg,
    prevKg: prev?.kg ?? null,
    delta: prev ? Math.round((last.kg - prev.kg) * 100) / 100 : 0,
    ageDays: Math.max(0, ageDays),
  }
}

/**
 * The last genuine weigh-in, sourced from `body_composition` — the ledger that
 * only gets a row when a weight is actually entered — and falling back to
 * `daily_logs` when that table is empty (pure-HealthKit users).
 */
export function useLastWeighIn(days = 120) {
  return useQuery({
    queryKey: ['weigh_in', 'latest', days],
    staleTime: 60_000,
    queryFn: async (): Promise<WeighIn | null> => {
      const since = logicalDaysAgoISO(days)
      const [bc, dl] = await Promise.all([
        supabase.from('body_composition').select('date, weight_kg').gte('date', since).order('date', { ascending: true }),
        supabase.from('daily_logs').select('date, weight_kg').gte('date', since).order('date', { ascending: true }),
      ])
      const map = (d: unknown) => ((d ?? []) as Array<{ date: string; weight_kg: number | null }>)
        .map((r) => ({ date: r.date, weightKg: r.weight_kg }))

      const ledger = map(bc.data)
      // body_composition is the source of truth; daily_logs only when it's empty.
      return latestWeighIn(ledger.length ? ledger : map(dl.data))
    },
  })
}

/** Body-composition fields the dashboard's Body card surfaces. */
export const BODY_METRIC_FIELDS = [
  'weight_kg', 'bmi', 'lean_mass_kg', 'body_fat_pct',
  'muscle_percent', 'water_percent', 'bone_mineral', 'visceral_fat', 'bmr',
] as const
export type BodyMetricField = (typeof BODY_METRIC_FIELDS)[number]

/** Each metric's most recent reading + the day it was taken. */
export type LatestBodyMetrics = Partial<Record<BodyMetricField, { value: number; date: string }>>

/**
 * Carry EVERY body metric forward independently, not just weight.
 *
 * The Body card read only today's `daily_logs` row for BMI / lean mass / body
 * fat while weight carried forward separately — so metrics entered in the Daily
 * Nexus on any other day (or on a scale that reports BMI weekly) rendered as
 * "—" and the card looked like it only knew the weight. Each field now takes its
 * newest non-null value across the window, with the date it came from.
 */
export function pickLatestBodyMetrics(
  rows: Array<Record<string, unknown> & { date: string }>,
): LatestBodyMetrics {
  const out: LatestBodyMetrics = {}
  // Newest first, so the first USABLE value per field wins.
  for (const r of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const f of BODY_METRIC_FIELDS) {
      if (out[f]) continue
      const v = r[f]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      // A sub-50kg weight is a scale artifact everywhere else in the app —
      // SKIP it and keep looking back, rather than letting it mask a real
      // reading from the day before.
      if (f === 'weight_kg' && validWeight(v) == null) continue
      out[f] = { value: v, date: r.date }
    }
  }
  return out
}

export function useLatestBodyMetrics(days = 60) {
  return useQuery({
    queryKey: ['daily_logs', 'latest_body_metrics', days],
    staleTime: 60_000,
    queryFn: async (): Promise<LatestBodyMetrics> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select(`date, ${BODY_METRIC_FIELDS.join(', ')}`)
        .gte('date', logicalDaysAgoISO(days))
        .order('date', { ascending: false })
      if (error) throw error
      return pickLatestBodyMetrics((data ?? []) as unknown as Array<Record<string, unknown> & { date: string }>)
    },
  })
}
