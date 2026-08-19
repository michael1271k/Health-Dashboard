'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * What Duration / Avg HR / Calories were LAST time you did this exact workout.
 *
 * ── WHY THE FINISH SHEET ASKS FOR THESE AT ALL ───────────────────────────────
 * They are the three numbers the app cannot derive: it does not know when you
 * arrived, it never saw your watch, and calories are a device's estimate, not a
 * calculation over sets. So the sheet asks — and then, for a lifter running the
 * same five routines on a loop, asks for very nearly the same three answers
 * every time. Upper A takes about as long this week as last; the heart rate on
 * a leg day is a leg day's heart rate.
 *
 * So the sheet proposes rather than blanks, exactly the way session effort
 * already proposes `deriveSessionRpe`. The proposal is a real reading from a
 * real session of THIS routine, and it is editable — which is the difference
 * between a default and a guess.
 *
 * ── SCOPED TO THE ROUTINE, NEVER TO THE WEEKDAY ──────────────────────────────
 * The lookup is by `day_key`. A swap moves Delts & Arms onto a Wednesday, and
 * seeding from "the last session on this weekday" would then hand a leg day's
 * duration to an arm day. `day_key` is what identifies a workout in this
 * schema; the weekday is where it happened to land.
 *
 * ── AND THE FALLBACK IS AN AVERAGE, NOT A CONSTANT ───────────────────────────
 * A field missing from the most recent session (you forgot to enter calories
 * that day) falls back to the mean of that field across the recent history of
 * the same routine, and only then to blank. Per FIELD, not per session: a
 * session with a duration and no heart rate should still seed the duration.
 */
export interface SessionMetricsSeed {
  durationMin: number | null
  avgBpm: number | null
  calories: number | null
  /** The date the exact values came from, when any of them did. */
  lastDate: string | null
  /** True when at least one field fell back to the average. */
  averaged: boolean
}

/** How far back the average looks. Twelve sessions of one routine is ~10 weeks. */
const WINDOW = 12

interface Row {
  id: string
  started_at: string
  duration_min: number | null
  avg_bpm: number | null
  calories_burned: number | null
}

/** Mean of the values that exist, rounded to a whole unit, or null. */
function meanOf(rows: Row[], pick: (r: Row) => number | null): number | null {
  const vals = rows.map(pick).filter((v): v is number => typeof v === 'number' && v > 0)
  if (!vals.length) return null
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
}

export function useSessionMetricsSeed(
  dayKey: string | null | undefined,
  /** The session being EDITED — its own numbers are not a proposal for itself. */
  excludeSessionId?: string | null,
) {
  return useQuery({
    queryKey: ['session_metrics_seed', dayKey ?? null, excludeSessionId ?? null],
    enabled: !!dayKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionMetricsSeed> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, duration_min, avg_bpm, calories_burned')
        .eq('day_key', dayKey!)
        .order('started_at', { ascending: false })
        .limit(WINDOW + 1)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Row[])
        .filter((r) => r.id !== excludeSessionId)
        .slice(0, WINDOW)
      if (!rows.length) {
        return { durationMin: null, avgBpm: null, calories: null, lastDate: null, averaged: false }
      }

      // Newest FIRST, so "the first row that has one" is the most recent
      // reading of that field — which is what "last time" means per field.
      const latest = (pick: (r: Row) => number | null): { v: number; at: string } | null => {
        for (const r of rows) {
          const v = pick(r)
          if (typeof v === 'number' && v > 0) return { v: Math.round(v), at: r.started_at.slice(0, 10) }
        }
        return null
      }
      const d = latest((r) => r.duration_min)
      const h = latest((r) => r.avg_bpm)
      const c = latest((r) => r.calories_burned)

      // The exact values come from whichever session was most recent among
      // them; the averages only fill what nothing exact could.
      const dates = [d?.at, h?.at, c?.at].filter((x): x is string => !!x).sort()
      return {
        durationMin: d?.v ?? meanOf(rows, (r) => r.duration_min),
        avgBpm: h?.v ?? meanOf(rows, (r) => r.avg_bpm),
        calories: c?.v ?? meanOf(rows, (r) => r.calories_burned),
        lastDate: dates.length ? dates[dates.length - 1] : null,
        averaged: (!d && !!meanOf(rows, (r) => r.duration_min))
          || (!h && !!meanOf(rows, (r) => r.avg_bpm))
          || (!c && !!meanOf(rows, (r) => r.calories_burned)),
      }
    },
  })
}
