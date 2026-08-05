'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * The most recent scale reading BEFORE a given day, field by field.
 *
 * WHY THIS EXISTS
 * Apple Health carries weight, BMI and body-fat into the day's `daily_logs` row
 * on its own. It has no type for muscle %, water %, protein % or bone mineral —
 * those can only ever be typed in — so on a morning you have weighed but not yet
 * entered, four of the nine inputs are blank and there is nothing on screen to
 * tell you what they were last time. Re-typing 78.3 from memory is how a wrong
 * number gets in.
 *
 * NOT A BACKFILL. Nothing here writes. The values are offered as placeholders
 * and behind an explicit "fill" action, never folded silently into a save — a
 * reading inherited from four days ago is context, not a measurement.
 *
 * FIELD BY FIELD, not row by row: 07-17 has a weight and a body-fat but no
 * muscle %, so the newest muscle % lives on an older row than the newest weight.
 * Taking one whole row would lose it.
 */

/** The manual-entry fields worth carrying forward. */
export const CARRY_FIELDS = [
  'weight_kg', 'bmi', 'body_fat_pct', 'muscle_percent', 'water_percent',
  'protein_percent', 'bone_mineral', 'visceral_fat', 'bmr',
  'skeletal_muscle_mass_kg',
  // NOT `estimated_waist_to_hip_ratio`: this select is one statement, and
  // PostgREST 400s all of it on one unknown column. It joins the list once the
  // paste-SQL has run — until then the ratio simply doesn't carry forward.
] as const

export type CarryField = (typeof CARRY_FIELDS)[number]

export interface LatestBodyReading {
  /** Newest non-null value per field, across the days before `date`. */
  values: Partial<Record<CarryField, number>>
  /** The date each value came from — shown so an old number can't masquerade. */
  dates: Partial<Record<CarryField, string>>
  /** Newest date contributing any value, for the one-line "from …" label. */
  latestDate: string | null
}

const EMPTY: LatestBodyReading = { values: {}, dates: {}, latestDate: null }

/**
 * 60 days back is enough to survive a fortnight of skipped weigh-ins and short
 * enough that a reading from a previous training block never leaks in.
 */
const LOOKBACK_DAYS = 60

/**
 * Fold newest-first rows into the newest non-null value per field.
 *
 * Pure and exported because the field-by-field rule is the whole point and is
 * invisible from the outside: 2026-07-17 carries a weight and a body fat but no
 * muscle %, so the newest muscle % genuinely lives on an older row than the
 * newest weight. Taking the first row that had *anything* would lose it.
 */
export function reduceLatest(
  rows: ReadonlyArray<Record<string, number | string | null>>,
): LatestBodyReading {
  const values: LatestBodyReading['values'] = {}
  const dates: LatestBodyReading['dates'] = {}
  for (const row of rows) {
    for (const f of CARRY_FIELDS) {
      if (values[f] != null) continue
      const v = row[f]
      if (typeof v === 'number' && Number.isFinite(v)) {
        values[f] = v
        dates[f] = String(row.date)
      }
    }
  }
  const latestDate = Object.values(dates).sort().pop() ?? null
  return { values, dates, latestDate }
}

export function useLatestBodyReading(date: string) {
  return useQuery({
    queryKey: ['latest_body_reading', date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LatestBodyReading> => {
      const from = new Date(`${date}T00:00:00Z`)
      from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS)
      const { data, error } = await supabase
        .from('daily_logs')
        .select(`date, ${CARRY_FIELDS.join(', ')}`)
        .gte('date', from.toISOString().slice(0, 10))
        .lt('date', date)                       // strictly before: today is not its own history
        .order('date', { ascending: false })
        .limit(LOOKBACK_DAYS)
      if (error) return EMPTY
      // Rows arrive newest-first, so the first non-null wins per field.
      return reduceLatest((data ?? []) as unknown as Array<Record<string, number | string | null>>)
    },
  })
}
