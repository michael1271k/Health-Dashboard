'use client'

import type { QueryClient } from '@tanstack/react-query'
import { todayBundleKey, type TodayBundle } from '@/lib/hooks/useToday'
import type { TodayReadiness } from '@/lib/hooks/useTodayReadiness'

/**
 * The `daily_scores` row `POST /api/compute-score` echoes back.
 *
 * Only the fields any reader actually paints are named; the route returns the
 * whole insert row, and extra keys are carried through untouched into the
 * `today` bundle's `score` object.
 */
export interface ComputedScore {
  date: string
  score: number | null
  sleep_score: number | null
  nutrition_score: number | null
  activity_score: number | null
  workout_score: number | null
  recovery_score: number | null
  battery_pct: number | null
}

/**
 * Paint a freshly computed score into the caches that display it.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Committing a session used to invalidate `['readiness_today']` BEFORE the
 * recompute POST resolved, so the refetch raced the write and usually won —
 * reading the PRE-recompute battery and then marking it fresh for
 * `useTodayReadiness`'s five-minute staleTime. A second invalidation in the
 * promise's `.then` was what actually corrected it, and it never ran when the
 * POST failed. The visible symptom was a battery percentage that only moved
 * after a manual sync.
 *
 * Writing the returned row directly removes the race entirely: the number the
 * server just computed is the number on screen, with no round trip to lose.
 * Callers should still invalidate afterwards, so everything derived from the
 * score (day vault, coach, trends) refreshes — but the visible figure no longer
 * waits on that.
 *
 * ONLY PATCHES QUERIES THAT ARE ALREADY CACHED. Seeding a key that has never
 * been fetched would install a bundle holding a score and nothing else, and the
 * dashboard would render that skeleton as though it were the day.
 */
export function paintComputedScore(
  qc: QueryClient,
  date: string,
  computed: ComputedScore | null | undefined,
): void {
  if (!computed) return

  qc.setQueryData<TodayReadiness>(['readiness_today', date], (prev) => (
    prev ? { ...prev, batteryPct: computed.battery_pct ?? null, sleepScore: computed.sleep_score ?? null } : prev
  ))

  qc.setQueryData<TodayBundle>(todayBundleKey(date), (prev) => (
    prev ? { ...prev, score: { ...(prev.score ?? {}), ...computed } as TodayBundle['score'] } : prev
  ))
}

/**
 * POST the recompute and paint whatever it returns.
 *
 * Every caller wants the same three things — force the recompute, show the new
 * number immediately, then refresh what depends on it — and each of the four
 * call sites had been spelling that out slightly differently.
 *
 * Best-effort by contract: the underlying data is already written, so a failed
 * recompute must never surface as a failed commit. Returns whether a row came
 * back, for callers that want to know.
 */
export async function recomputeAndPaint(
  qc: QueryClient,
  date: string,
  body: Record<string, unknown>,
  post: (url: string, init: RequestInit) => Promise<Response>,
): Promise<boolean> {
  try {
    const res = await post('/api/compute-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...body }),
    })
    const json = await res.json().catch(() => null) as { score?: ComputedScore | null } | null
    paintComputedScore(qc, date, json?.score)
    return !!json?.score
  } catch {
    return false
  }
}
