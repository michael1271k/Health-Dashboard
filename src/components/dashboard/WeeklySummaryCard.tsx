'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Trophy } from 'lucide-react'
import { useWeekSessions, weekStartOf } from '@/lib/hooks/useWeekSessions'
import { isWeekReady } from '@/lib/training/weekReady'
import { isoAddDays, isWeekComplete } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { fmtVolume } from '@/lib/utils/units'
import { Surface } from '@/components/ui/Zone'

const GOLD = '#D4AF37'

/**
 * Weekly Session Summary entry point. The gold CTA appears at 00:00 on the first
 * day of a new week, reviewing the week that has just CONCLUDED, once every
 * training day that week asked for was logged. Opens the full Pathfinder review.
 *
 * ── WHY IT REVIEWS LAST WEEK AND NOT THIS ONE ────────────────────────────────
 * It used to fire on the final day of the live week (`today >= weekStart + 6`,
 * a rule this file carried privately). A week with a day left to run is not
 * over: more can still be logged into it, and the summary the card promises
 * would be describing a week that is still changing underneath it. The card was
 * announcing a result before the last event.
 *
 * So the subject moved back one week and the trigger moved forward one day. The
 * week under review is `weekStartOf(today) - 7`, and `isWeekComplete` (now in
 * lib/utils/week.ts, shared with the Pathfinder capsules) is what says it is
 * genuinely over — strictly after its final day, i.e. the midnight that opens
 * the new one, under whatever "Week starts on" is set to.
 *
 * The window is the first day of the new week. That is the same one-day
 * lifetime the card always had, moved to the far side of the boundary.
 *
 * ── WHY IT LIVES ON THE DASHBOARD ────────────────────────────────────────────
 * It was on the Workout tab, which is the surface you open to train. A weekly
 * retrospective is not a training action, and the day it fires is a scheduled
 * rest day — the one day you have no reason to open Workout at all.
 *
 * Not Progress either: `/pathfinder` is the page this CTA navigates TO, and a
 * link to the page you are already on is not an entry point.
 */
export function WeeklySummaryCard() {
  const router = useRouter()
  const today = logicalTodayISO()
  const thisWeekStart = weekStartOf(today)
  const lastWeekStart = isoAddDays(thisWeekStart, -7)
  const lastWeekEnd = isoAddDays(lastWeekStart, 6)

  const lastWeek = useWeekSessions(lastWeekStart)
  const sessions = lastWeek.data?.sessions

  // The calendar says the week is over; `isWeekReady` says the work in it is
  // done. Both, or there is nothing to celebrate.
  //
  // `isWeekReady` is bounded by a `today` so the LIVE week can be ready on its
  // last training day. Here the week is finished, so the bound is its own final
  // day — every training day it asked for counts, and Wed/Sat rest never blocks.
  const logged = new Set((sessions ?? []).map((s) => s.date))
  const weekComplete =
    today === thisWeekStart &&
    isWeekComplete(lastWeekStart, today) &&
    isWeekReady(lastWeekStart, logged, lastWeekEnd)

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
            {sessions?.length ?? 0} sessions · {fmtVolume(lastWeek.data?.totals.volumeKg)} kg · vs the week before inside
          </span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
      </button>
    </Surface>
  )
}
