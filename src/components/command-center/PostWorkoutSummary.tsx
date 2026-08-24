'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { SessionSnippet } from '@/components/session-detail/SessionSnippet'
import { EMERALD } from '@/lib/theme/palette'
import type { WeekSessionRow } from '@/lib/hooks/useWeekSessions'
import type { GymReportRow } from '@/lib/hooks/useWeekly'

/**
 * WeekSessionRow → GymReportRow (the shape `SessionSnippet` consumes).
 * reportMd is left empty — the rich intel (Δ-vs-last, PR spotlight, volume
 * trail) is fetched independently by session id by `useSessionIntel`.
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
 * has a logged session.
 *
 * ── IT USED TO RENDER THE WHOLE DEBRIEF ──────────────────────────────────────
 * This mounted `SessionProgressionCard`, which mounted `SessionIntelCard`: a
 * card inside a card inside the full report, with Edit and Delete at the
 * bottom. It answered every question about the session except the one the
 * Workout tab is asking, which is simply "how did today go" — and it pushed the
 * week's plan below the fold to do it.
 *
 * `SessionSnippet` is that answer at ~150px, in the same two metric grids the
 * deep-dive header uses, one tap from the rest.
 */
export function PostWorkoutSummary({ sessions, date }: {
  sessions: WeekSessionRow[]
  date: string
}) {
  return (
    <section className="space-y-3">
      {/* Slim "logged" affirmation — a header line, NOT a second box. */}
      <div className="flex items-center gap-2 px-1">
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: EMERALD }} aria-hidden="true" />
        <span className="text-fluid-sm font-semibold text-text">
          {sessions.length > 1 ? `${sessions.length} sessions logged today` : 'Session logged today'}
        </span>
        <Link href={`/day/${date}`} className="ml-auto text-fluid-xs text-muted flex items-center gap-0.5 hover:text-text" aria-label="Open the full day view">
          Full day <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {sessions.map((s) => (
        <SessionSnippet key={s.id} session={toReportRow(s)} date={date} measure="grid" />
      ))}
    </section>
  )
}
