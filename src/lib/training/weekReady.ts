import { isoAddDays } from '@/lib/utils/week'
import { isTrainingDay } from '@/lib/programs'

/**
 * A week is READY when every scheduled training day in it that has already
 * passed carries a logged session — i.e. you did the work the program asked for.
 * Ready weeks get the gold aura: the visual reward for a complete week, and the
 * cue that it's worth exporting for review.
 *
 * `today` bounds it so the live week can be ready on its last training day
 * rather than only after Saturday midnight.
 *
 * ── WHY IT IS ITS OWN MODULE ─────────────────────────────────────────────────
 * It lived in `PathfinderTimeline`, and `WeeklySummaryCard` — which renders on
 * the DASHBOARD — imported it from there. That one value import pulled the
 * timeline module in, which pulls `useWeeklyLoop`, which pulls
 * `lib/reports/weeklyExport.ts`: 115 KB of report-prose generation, in the home
 * route's first-load JS, for a single boolean.
 *
 * It cannot live in `lib/utils/week.ts` beside `isWeekComplete`, its calendar
 * counterpart: that file is deliberately React-free and server-safe, and this
 * one asks `isTrainingDay`, which resolves the active plan from localStorage.
 * Two different questions with two different dependency footprints.
 */
export function isWeekReady(weekStart: string, loggedDates: Set<string>, today: string): boolean {
  const due = Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i))
    .filter((d) => d <= today && isTrainingDay(d))
  if (!due.length) return false
  return due.every((d) => loggedDates.has(d))
}
