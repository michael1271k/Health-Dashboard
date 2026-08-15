'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Trophy } from 'lucide-react'
import { useWeekSessions, weekStartOf } from '@/lib/hooks/useWeekSessions'
import { isWeekReady } from '@/components/pathfinder/PathfinderTimeline'
import { isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { fmtVolume } from '@/lib/utils/units'
import { Surface } from '@/components/ui/Zone'

const GOLD = '#D4AF37'

/**
 * The week's last day, under whatever "Week starts on" is set to.
 *
 * ── WHY THIS IS NOT `weekday === 5` ──────────────────────────────────────────
 * It used to be. Weeks here are Sunday-anchored (`WEEK0_START = '2026-07-12'`
 * is a Sunday), so a Sunday-start week ENDS on Saturday — and the card fired on
 * Friday, announcing a complete week with a whole day of it still to run. The
 * number 5 was reasoning about Legs B, the last TRAINING day, which is a fact
 * about the plan and not about the calendar.
 *
 * The weekday is also not fixed: "Week starts on" is a real setting (Sunday or
 * Monday), so the final day is Saturday or Sunday depending on it. Deriving it
 * from `weekStartOf` means the card follows the preference for free, the way
 * every other week-scoped surface already does.
 *
 * `>=` rather than `===` so a clock that jumps cannot land the user in a week
 * whose end has quietly passed with the card never having appeared.
 */
export function isWeekOver(weekStart: string, today: string): boolean {
  return today >= isoAddDays(weekStart, 6)
}

/**
 * Weekly Session Summary entry point. The gold CTA appears on the FINAL DAY of
 * the week, once every training day the plan asked for has been logged. Opens
 * the full Pathfinder review.
 *
 * ── WHY IT LIVES ON THE DASHBOARD ────────────────────────────────────────────
 * It was on the Workout tab, which is the surface you open to train. A weekly
 * retrospective is not a training action, and the day it fires is a scheduled
 * rest day — the one day you have no reason to open Workout at all. The
 * Dashboard is what gets opened on a rest Saturday.
 *
 * Not Progress either: `/pathfinder` is the page this CTA navigates TO, and a
 * link to the page you are already on is not an entry point.
 */
export function WeeklySummaryCard() {
  const router = useRouter()
  const today = logicalTodayISO()
  const thisWeekStart = weekStartOf(today)

  const thisWeek = useWeekSessions(thisWeekStart)
  const sessions = thisWeek.data?.sessions

  // The calendar says the week is over; `isWeekReady` says the work in it is
  // done. Both, or there is nothing to celebrate. `isWeekReady` counts only
  // training days that have PASSED, so on the final day that is the whole week —
  // and Wed/Sat rest never blocks it.
  const logged = new Set((sessions ?? []).map((s) => s.date))
  const weekComplete = isWeekOver(thisWeekStart, today) && isWeekReady(thisWeekStart, logged, today)

  // The band is INSIDE the guard on purpose. Rendered by the page, an empty
  // `Surface variant="band"` still paints its bottom border, so every day that
  // is not the last one would carry a stray hairline where nothing lives.
  if (!weekComplete) return null

  return (
    <Surface measure="grid" pad="snug" variant="band">
      <button onClick={() => router.push('/pathfinder')}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
        style={{ borderColor: `${GOLD}55`, boxShadow: `0 0 20px ${GOLD}1f` }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `${GOLD}1c`, color: GOLD }}>
          <Trophy className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold" style={{ color: GOLD }}>Week complete — Session Summary ready</span>
          <span className="block text-[11px] text-muted">
            {sessions?.length ?? 0} sessions · {fmtVolume(thisWeek.data?.totals.volumeKg)} kg · vs last week inside
          </span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
      </button>
    </Surface>
  )
}
