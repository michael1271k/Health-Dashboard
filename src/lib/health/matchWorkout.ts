import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

export interface SessionMetricFill {
  durationMin?: number | null
  avgBpm?: number | null
  caloriesBurned?: number | null
}

/**
 * Fill session metrics the user didn't type, from Apple Health data already
 * ingested for that day. Only fills NULL/undefined inputs — never overwrites
 * values the user explicitly provided.
 *
 * Currently available HK data: daily_metrics.active_cal (day's active energy)
 * and daily_metrics.rest_hr. These are day-level, so they serve as proxies:
 *  - caloriesBurned ← active_cal (day total) when not stated.
 *  - avgBpm: no workout-level HR is ingested yet → left null unless stated
 *    (will improve once Health Auto Export exports workout heart-rate).
 */
export async function matchWorkoutMetrics(
  supabase: DB,
  userId: string,
  dateISO: string,           // YYYY-MM-DD
  provided: SessionMetricFill,
): Promise<SessionMetricFill> {
  const result: SessionMetricFill = { ...provided }

  const needsCalories = result.caloriesBurned == null

  if (needsCalories) {
    const { data } = await supabase
      .from('daily_metrics')
      .select('active_cal, rest_hr')
      .eq('user_id', userId)
      .eq('date', dateISO)
      .maybeSingle()
    const m = data as { active_cal: number | null; rest_hr: number | null } | null
    if (m) {
      if (result.caloriesBurned == null && m.active_cal != null) {
        result.caloriesBurned = m.active_cal
      }
    }
  }

  return result
}
