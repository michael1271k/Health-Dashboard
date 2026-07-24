'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { normalizeSpO2 } from '@/lib/utils/units'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Weekly Vitals data layer — one query over daily_logs powering the
 * Apple-Health-style /vitals page. This is the DEBUT surface for
 * heart_rate_recovery, wrist_temp_delta and time_in_daylight_min (stored by
 * the ingest pipeline since v5.1 but never rendered anywhere before).
 */
export interface VitalsDay {
  date: string
  hrv_ms: number | null
  avg_rest_heart_rate: number | null
  heart_rate_recovery: number | null
  /** Since 2026-07 the Shortcut sends the night's AVERAGE wrist temp in °C. */
  wrist_temp_delta: number | null
  respiratory_rate: number | null
  blood_oxygen: number | null
  vo2max: number | null
  time_in_daylight_min: number | null
  stand_hours: number | null
  steps: number | null
  sleep_minutes: number | null
  exercise_minutes: number | null
  training_minutes: number | null
  active_energy: number | null
}

const VITALS_COLS =
  'date, hrv_ms, avg_rest_heart_rate, heart_rate_recovery, wrist_temp_delta, respiratory_rate, ' +
  'blood_oxygen, vo2max, time_in_daylight_min, stand_hours, steps, sleep_minutes, ' +
  'exercise_minutes, training_minutes, active_energy'

export const isoAddDays = (d: string, n: number): string => {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Last `days` calendar days of vitals (ascending). Default 56 = 8 weeks. */
export function useVitalsDays(days = 56) {
  return useQuery({
    queryKey: ['daily_logs', 'vitals', days],
    queryFn: async (): Promise<VitalsDay[]> => {
      const to = logicalTodayISO()
      const from = isoAddDays(to, -(days - 1))
      const { data, error } = await supabase
        .from('daily_logs')
        .select(VITALS_COLS)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
      if (error) throw error
      // Mixed-unit blood oxygen coerced at the data layer (see normalizeSpO2).
      return ((data ?? []) as unknown as VitalsDay[])
        .map((d) => ({ ...d, blood_oxygen: normalizeSpO2(d.blood_oxygen) }))
    },
    staleTime: 60_000,
  })
}

export type VitalAgg = 'avg' | 'sum'
export type VitalPick = (d: VitalsDay) => number | null | undefined

export interface VitalWindow {
  current: number | null
  prior: number | null
  delta: number | null
  /** Days with a reading inside the current 7-day window. */
  coverage: number
}

const roll = (xs: number[], agg: VitalAgg): number | null =>
  xs.length === 0 ? null : agg === 'avg' ? xs.reduce((a, b) => a + b, 0) / xs.length : xs.reduce((a, b) => a + b, 0)

/** Current 7 days (ending today) vs the prior 7 — the delta chip's source. */
export function vitalWindow(days: VitalsDay[], pick: VitalPick, agg: VitalAgg, today = logicalTodayISO()): VitalWindow {
  const startCur = isoAddDays(today, -6)
  const startPrior = isoAddDays(today, -13)
  const cur: number[] = []
  const prior: number[] = []
  for (const d of days) {
    const v = pick(d)
    if (v == null) continue
    if (d.date >= startCur && d.date <= today) cur.push(v)
    else if (d.date >= startPrior && d.date < startCur) prior.push(v)
  }
  const current = roll(cur, agg)
  const priorV = roll(prior, agg)
  return {
    current,
    prior: priorV,
    delta: current != null && priorV != null ? current - priorV : null,
    coverage: cur.length,
  }
}

/** Sunday-anchored weekly series (oldest → newest) for the trend sparkline. */
export function vitalWeeklySeries(days: VitalsDay[], pick: VitalPick, agg: VitalAgg): Array<number | null> {
  const buckets = new Map<string, number[]>()
  for (const d of days) {
    const v = pick(d)
    if (v == null) continue
    const dt = new Date(`${d.date}T12:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())   // back to Sunday
    const key = dt.toISOString().slice(0, 10)
    const arr = buckets.get(key) ?? []
    arr.push(v)
    buckets.set(key, arr)
  }
  return [...buckets.keys()].sort().map((k) => roll(buckets.get(k)!, agg))
}
