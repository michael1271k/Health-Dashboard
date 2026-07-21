'use client'

import Link from 'next/link'
import { Plus, ArrowRight, CheckCircle2 } from 'lucide-react'
import { SessionProgressionCard } from '@/components/day/SessionProgressionCard'
import type { WeekSessionRow } from '@/lib/hooks/useWeekSessions'
import type { GymReportRow } from '@/lib/hooks/useWeekly'

/**
 * WeekSessionRow → GymReportRow (the shape SessionProgressionCard / SessionIntelCard
 * consume). reportMd is left empty — the rich intel (Δ-vs-last, PR spotlight,
 * volume trail) is fetched independently by session id via useSessionIntel.
 */
function toReportRow(s: WeekSessionRow): GymReportRow {
  return {
    id: s.id, date: s.date, split: s.splitDay, reportMd: '',
    durationMin: s.durationMin, avgBpm: s.avgBpm, volumeKg: s.volumeKg,
    setCount: s.setCount, prCount: s.prCount, dayKey: s.dayKey, calories: s.calories,
  }
}

/**
 * Post-Workout Summary — replaces the "Log X" hero on the Workout tab once today
 * has a logged session (Hevy-style). Reuses SessionProgressionCard: session #,
 * vs-last-same-type comparison, PR spotlight, muscle/volume breakdown, and the
 * Edit Workout action (which routes through the same commit → global-update
 * cascade). First-time empty state ("baseline set") is handled inside
 * SessionIntelCard, so a debut Upper A degrades gracefully.
 */
export function PostWorkoutSummary({ sessions, date, onLogAnother }: {
  sessions: WeekSessionRow[]
  date: string
  onLogAnother: () => void
}) {
  return (
    <section className="space-y-3">
      {/* Slim "logged" affirmation — a header line, NOT a second box. The session
          breakdown below is the single unified, always-expanded workout block. */}
      <div className="flex items-center gap-2 px-1">
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#34D399' }} aria-hidden="true" />
        <span className="text-fluid-sm font-semibold text-text">
          {sessions.length > 1 ? `${sessions.length} sessions logged today` : 'Session logged today'} 💪
        </span>
        <Link href={`/day/${date}`} className="ml-auto text-fluid-xs text-muted flex items-center gap-0.5 hover:text-text" aria-label="Open the full day view">
          Full day <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {sessions.map((s) => <SessionProgressionCard key={s.id} session={toReportRow(s)} date={date} />)}

      <button onClick={onLogAnother} className="btn-glass w-full justify-center min-h-[44px] text-fluid-xs">
        <Plus className="w-3.5 h-3.5" /> Log another session
      </button>
    </section>
  )
}
