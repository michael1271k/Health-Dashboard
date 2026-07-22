'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Trophy } from 'lucide-react'
import { useWeekSessions, weekStartOf } from '@/lib/hooks/useWeekSessions'
import { logicalTodayISO } from '@/lib/utils/day'
import { fmtVolume } from '@/lib/utils/units'

const GOLD = '#F5C15A'

/**
 * Weekly Session Summary entry points. The gold CTA appears on Fridays once the
 * week's final session (Legs B) is committed; the quiet footer link reviews the
 * completed prior week any day. Both open the full /weekly-summary dashboard.
 */
export function WeeklySummaryCard() {
  const router = useRouter()
  const today = logicalTodayISO()
  const thisWeekStart = weekStartOf(today)

  const thisWeek = useWeekSessions(thisWeekStart)

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const todaySessions = thisWeek.data?.sessions.filter((s) => s.date === today) ?? []
  // Friday + the final session of the week committed (day_key when known).
  const weekComplete = weekday === 5
    && todaySessions.some((s) => (s.dayKey ? s.dayKey === 'legs_b' : true))

  return (
    <>
      {weekComplete && (
        <button onClick={() => router.push('/pathfinder')}
          className="w-full glass-card px-4 py-3 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          style={{ borderColor: `${GOLD}55`, boxShadow: `0 0 20px ${GOLD}1f` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${GOLD}1c`, color: GOLD }}>
            <Trophy className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ color: GOLD }}>Week complete — Session Summary ready</span>
            <span className="block text-[11px] text-muted">
              {thisWeek.data?.sessions.length ?? 0} sessions · {fmtVolume(thisWeek.data?.totals.volumeKg)} kg · vs last week inside
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
        </button>
      )}
    </>
  )
}
