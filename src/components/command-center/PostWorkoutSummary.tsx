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
      <div className="helix-card holo-sheen flex items-center gap-3"
        style={{ borderColor: '#34D39944', boxShadow: '0 0 24px #34D39914' }}>
        <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: '#34D39920', color: '#34D399', boxShadow: '0 0 18px #34D39955' }}>
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-fluid-lg text-text leading-tight">
            {sessions.length > 1 ? `${sessions.length} sessions logged today` : 'Session logged'} 💪
          </h2>
          <p className="text-fluid-sm text-muted">Review the breakdown below, or edit any set.</p>
        </div>
        <Link href={`/day/${date}`} className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Open the full day view">
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
