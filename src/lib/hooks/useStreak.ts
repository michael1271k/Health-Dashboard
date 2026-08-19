'use client'

import { useLogicalDate } from '@/lib/hooks/useLogicalDate'
import { programDayCount } from '@/lib/training/streak'

/**
 * The app's read of the streak — the same number the widget shows, from the same
 * derivation.
 *
 * ── IT IS THE PROGRAM DAY NOW ────────────────────────────────────────────────
 * This used to rebuild a 42-day window and walk it with `streakFrom`, counting
 * consecutive scheduled training days actually trained. That answered a real
 * question and not the one the flame on the dashboard is asking: how far into
 * the cut you are. See the note at the top of `lib/training/streak.ts` — the
 * counter is deliberately monotonic, because a block's length is not something
 * a missed Tuesday shortens.
 *
 * Which also means there is nothing left to fetch. The old hook pulled the
 * whole continuum and subscribed to the schedule store to ask, per day, whether
 * it was a training day; the answer now needs one date and one constant.
 *
 * `useLogicalDate` rather than a bare `logicalTodayISO()` call: the number has
 * to advance the instant the day boundary passes, and a value read during
 * render only changes when something else re-renders.
 */
export function useStreak(): { current: number; best: number } {
  const today = useLogicalDate()
  const day = programDayCount(today)
  // `best` is kept in the shape because the widget payload carries the same
  // pair. For a counter that only rises the two are the same number, and that
  // is the honest answer rather than an omission.
  return { current: day, best: day }
}
