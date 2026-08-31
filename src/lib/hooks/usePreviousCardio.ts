'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * What the treadmill block looked like last time THIS DAY came round.
 *
 * ── WHY IT IS SCOPED TO THE DAY, AND NOT TO THE MOVEMENT ─────────────────────
 * A strength lift's `Previous` is the last time you did that movement on any
 * routine, because a bench press is a bench press whichever day it lands on.
 * A treadmill block is not: the same machine carries a 0.37 km opener on Upper B
 * and a 2 km finisher on a Zone-2 day, and showing the finisher as the reference
 * for the opener would make every warm-up look like a collapse.
 *
 * `cardio_logs` has no name of its own — `save.ts` writes every block as
 * `kind: 'treadmill'` deliberately, so a warm-up inside a lifting session cannot
 * be mistaken for the daily walk. What distinguishes one block from another is
 * therefore the SESSION it belonged to, and the session carries `day_key`. So
 * the lookup joins through it, and a day with no history simply has no
 * reference — which is the honest answer and the same one the strength column
 * gives.
 *
 * ── AND WHY THE CURRENT SESSION IS EXCLUDED ──────────────────────────────────
 * Editing a saved session re-opens its own deck. Without the exclusion the card
 * would show today's own numbers as "previous", which is both useless and
 * actively misleading: it would say you matched last time, every time.
 */

export interface PreviousCardio {
  distanceKm: number | null
  durationMin: number | null
  inclinePct: number | null
  date: string
}

/** Rows come back newest-first; the first one wins. */
interface Row {
  date: string
  distance_m: number | null
  duration_min: number | null
  incline_pct?: number | null
  workout_sessions: { day_key: string | null } | null
}

export function usePreviousCardio(dayKey: string | null | undefined, excludeSessionId?: string | null) {
  return useQuery({
    queryKey: ['previous_cardio', dayKey ?? '', excludeSessionId ?? ''] as const,
    enabled: !!dayKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PreviousCardio | null> => {
      // `!inner` on the join, so a block whose session was deleted cannot come
      // back as a reference with no day to belong to.
      let query = supabase.from('cardio_logs')
        .select('date, distance_m, duration_min, incline_pct, workout_sessions!inner(day_key)')
        .eq('kind', 'treadmill')
        .eq('workout_sessions.day_key', dayKey!)
        .order('date', { ascending: false })
        .limit(1)
      if (excludeSessionId) query = query.neq('session_id', excludeSessionId)

      const { data, error } = await query
      // `incline_pct` may not be migrated — retry without it rather than lose
      // the two figures that were already working, the same trade `save.ts`
      // makes on the way in.
      if (error) {
        let retry = supabase.from('cardio_logs')
          .select('date, distance_m, duration_min, workout_sessions!inner(day_key)')
          .eq('kind', 'treadmill')
          .eq('workout_sessions.day_key', dayKey!)
          .order('date', { ascending: false })
          .limit(1)
        if (excludeSessionId) retry = retry.neq('session_id', excludeSessionId)
        const back = await retry
        if (back.error || !back.data?.length) return null
        return toPrevious(back.data[0] as unknown as Row)
      }
      if (!data?.length) return null
      return toPrevious(data[0] as unknown as Row)
    },
  })
}

function toPrevious(r: Row): PreviousCardio {
  return {
    // Metres in, kilometres out — the deck's own unit, and rounded to the two
    // decimals a treadmill actually displays rather than to whatever the
    // division produces.
    distanceKm: r.distance_m != null ? Math.round(r.distance_m / 10) / 100 : null,
    durationMin: r.duration_min ?? null,
    inclinePct: r.incline_pct ?? null,
    date: r.date,
  }
}

/** "0.37 km in 5:00", or null when there is nothing to say. */
export function formatPreviousCardio(p: PreviousCardio | null | undefined): string | null {
  if (!p) return null
  const parts: string[] = []
  if (p.distanceKm != null) parts.push(`${p.distanceKm.toFixed(2)} km`)
  if (p.durationMin != null) {
    const whole = Math.floor(p.durationMin)
    const secs = Math.round((p.durationMin - whole) * 60)
    parts.push(`${parts.length ? 'in ' : ''}${whole}:${String(secs).padStart(2, '0')}`)
  }
  return parts.length ? parts.join(' ') : null
}
