'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useSessionDetail } from '@/lib/hooks/useSessionDetail'
import { SessionHero } from '@/components/session-detail/SessionHero'
import { AppBar } from '@/components/nav/AppBar'
import { ExerciseBreakdown } from '@/components/session-detail/ExerciseBreakdown'
import { SessionHighlights } from '@/components/session-detail/SessionHighlights'
import { MuscleFocus } from '@/components/session-detail/MuscleFocus'
import { ProgressionTrail } from '@/components/session-detail/ProgressionTrail'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { weekStartOf } from '@/lib/utils/week'
import { activeProgram } from '@/lib/programs'
import { dayColor, EMBER } from '@/lib/theme/palette'
import { Surface } from '@/components/ui/Zone'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'

/**
 * Workout Analysis — the dedicated deep-dive for one session (reached by tapping
 * any completed workout, from the timeline, Daily Nexus, Post-Workout Summary or
 * the dashboard). Not a bottom-nav tab: a fullscreen analysis page with a back
 * button (the bottom nav already hides on /session*).
 *
 * FULL-BLEED, like the report reader and the Daily Nexus. This page was the last
 * of the three long documents still sitting inside the app shell's wide dashboard
 * column with gutters either side, so on a phone every card floated in dead
 * margin — a dashboard panel rather than an analysis surface. `data-fullbleed`
 * surrenders the shell's padding and measure (see globals.css), the sticky
 * command bar owns the way out, and ONE reading measure is applied once to the
 * content so a desktop still gets a centred column instead of a 1440 px line.
 */
export default function SessionAnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, isLoading } = useSessionDetail(id ?? null)
  // This page is usually deep-linked, so it renders before the plan preference
  // lands from `user_goals` and would name the wrong split for the whole visit.
  void useScheduleVersion()

  const phase = data ? getWeekPhase(weekStartOf(data.date)) : null
  const accent = data ? dayColor(data.dayKey, data.splitDay) : '#8E9AAC'
  const label = data
    ? ((data.dayKey && activeProgram().days.find((d) => d.key === data.dayKey)?.label)
      ?? (data.splitDay[0].toUpperCase() + data.splitDay.slice(1)))
    : 'Session'
  const pretty = data
    ? new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
    : ''

  return (
    <div data-fullbleed className="min-h-dvh">
      {/* The way out is pinned — a document this long that you have to scroll
          back up to escape is a trap. The workout's own colour bleeds along the
          top edge: Upper A is always steel, Legs & Core B always emerald, so
          the report identifies itself before the title is read. */}
      <AppBar accent={accent}>
          <button onClick={() => router.back()} onPointerUp={blurOnTap}
            className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-fluid-sm font-bold truncate leading-tight" style={{ color: accent }}>
              {label}
            </h1>
            <span className="text-[10px] text-muted">{pretty || 'Session'}</span>
          </div>
          {phase && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
              style={phaseBadgeStyle(phase.kind, false, phase.era)}>{phase.eraTag}</span>
          )}
      </AppBar>

      {/* ONE reading measure, applied once — edge-to-edge on a phone, a centred
          column on a desktop. Every section below inherits it rather than
          setting its own. */}
      <div className="mx-auto w-full max-w-[68ch] px-2 py-2 space-y-3 pb-8">
        {isLoading ? (
          <>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-40 animate-pulse" />
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-56 animate-pulse" />
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-40 animate-pulse" />
          </>
        ) : !data ? (
          <div className="space-y-4 py-10 text-center">
            <p className="text-muted">This session couldn&apos;t be found.</p>
            <button onClick={() => router.back()} className="btn-glass mx-auto min-h-[44px]">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        ) : (
          /* ── THREE BANDS, NOT FIVE CARDS ──
             The report was five `rounded-2xl border … p-5` panels stacked down
             the page, and the first of them nested a second bordered frame
             inside itself. Five frames around what is one document is the
             grandiosity — every section announced itself as a separate thing,
             so reading the report meant re-entering five times.

             What survived is the content, regrouped by the question each part
             answers: what the session WAS (header), how it compares and what it
             trained (progression), and what actually happened set by set
             (breakdown). Records fold into the middle band as chips, because a
             PR is a fact about the session rather than a section of it. */
          <>
            <SessionHero detail={data} />

            <Surface variant="band" accent={EMBER} pad="snug" className="space-y-3">
              <ProgressionTrail sessionId={data.id} />
              <SessionHighlights exercises={data.exercises} />
              <MuscleFocus detail={data} />
            </Surface>

            <ExerciseBreakdown sessionId={data.id} exercises={data.exercises} date={data.date} dayKey={data.dayKey} />
          </>
        )}
      </div>
    </div>
  )
}
