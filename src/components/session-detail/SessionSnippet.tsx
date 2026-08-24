'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useSessionIntel, type IntelMetric } from '@/lib/hooks/useSessionIntel'
import { useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { activeProgram } from '@/lib/programs'
import { dayColor, GOLD, OXIDE, MACRO } from '@/lib/theme/palette'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { Surface, type Measure } from '@/components/ui/Zone'
import { Head, Sub } from '@/components/session-detail/MetricGrid'

/**
 * The session, at a glance — the Workout tab's "logged today" widget and the
 * Daily View's session band, which are now the same component.
 *
 * ── WHAT THIS REPLACED, AND WHY IT HAD TO GO ─────────────────────────────────
 * The Workout tab rendered `SessionProgressionCard` → `SessionIntelCard`: a
 * hand-rolled card wrapping a second card wrapping the full debrief — a coach
 * banner, four wrapping accent chips, a vs-last row, a gold PR spotlight, the
 * complete per-exercise Δ table and a markdown disclosure. Roughly 600px, for a
 * question ("did I train, and how did it go") that is answered by six numbers.
 * The Daily View, meanwhile, printed the same session as five emoji chips with
 * no deltas at all. Two screens, two vocabularies, one fact.
 *
 * ── THE RULE IT FOLLOWS ──────────────────────────────────────────────────────
 * This is not a card that resembles `SessionHero`. It renders the SAME `Head`
 * and `Sub` cells from `MetricGrid`, at the same sizes, with the same hairline
 * dividers and the same reserved qualifier line. A number therefore looks
 * identical here and on the deep-dive, which is what makes the tap between them
 * feel like zooming rather than navigating.
 *
 * ── WHAT DELIBERATELY IS NOT HERE ────────────────────────────────────────────
 * The per-exercise table collapses to one summary line that routes to
 * `/session/[id]`, where `ExerciseBreakdown` and `ProgressionTrail` already own
 * it. The coach insight and the PR spotlight do not render: a record is already
 * stated by the gold `Records` cell, and prose is one tap away. Edit and Delete
 * do not render either — a glance surface should not carry an action you cannot
 * undo.
 */
export function SessionSnippet({ session, date, measure = 'read' }: {
  session: GymReportRow
  date: string
  /** `read` for the Daily View's band flow; `grid` for the Workout tab. */
  measure?: Measure
}) {
  const { data: intel } = useSessionIntel(session.id)
  const { data: globalNum } = useGlobalSessionNumber(date)

  // `activeProgram()` is a module-cache read React cannot observe, and the plan
  // hydrates from `user_goals` after first paint — without this subscription the
  // snippet prints the default plan's label for the day_key all visit.
  void useScheduleVersion()
  const program = activeProgram()
  const label = (session.dayKey && program.days.find((d) => d.key === session.dayKey)?.label)
    ?? (session.split[0]?.toUpperCase() + session.split.slice(1))

  const accent = dayColor(session.dayKey, session.split)
  const unit = weightUnit()
  const m = (key: IntelMetric['key']) => intel?.metrics.find((x) => x.key === key)

  // Volume and sets fall back to the figures computed from the set rows: a
  // session committed offline can reach here before its totals are written.
  const volumeKg = session.volumeKg ?? intel?.computedVolumeKg ?? null
  const setCount = session.setCount ?? intel?.computedSets ?? null

  /**
   * The per-exercise table, as one line.
   *
   * A record outranks a trend — the same precedence the table itself uses — so
   * a PR is never also counted as "up". Segments with a count of zero are
   * dropped rather than printed as "0 held", and a debut session says so
   * instead of reporting that nothing moved.
   */
  const deltas = intel?.deltas ?? []
  const summary = (() => {
    if (deltas.length === 0) return null
    const prs = deltas.filter((d) => d.isPr).length
    const up = deltas.filter((d) => !d.isPr && d.delta === 1).length
    const down = deltas.filter((d) => !d.isPr && d.delta === -1).length
    const held = deltas.filter((d) => !d.isPr && d.delta === 0).length
    const fresh = deltas.filter((d) => !d.isPr && d.delta == null).length
    const parts = [
      prs > 0 ? `${prs} record${prs > 1 ? 's' : ''}` : null,
      up > 0 ? `${up} up` : null,
      down > 0 ? `${down} down` : null,
      held > 0 ? `${held} held` : null,
      fresh > 0 ? `${fresh} new` : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  })()

  return (
    <Surface variant="band" accent={accent} measure={measure} pad="snug" className="space-y-3">
      {/* Identity. One line, and the whole line is the target — a header that
          is a link should not make you hunt for the four words that are. */}
      <Link href={`/session/${session.id}`} onPointerUp={blurOnTap}
        className="flex items-baseline gap-2 min-w-0 -m-1 p-1 rounded-lg active:opacity-80"
        aria-label={`Open full analysis for ${label}`}>
        <span className="font-heading font-bold text-fluid-base min-w-0 truncate" style={{ color: accent }}>
          {label}
        </span>
        {globalNum != null && (
          <span className="helix-num text-fluid-xs text-muted shrink-0">Session #{String(globalNum).padStart(2, '0')}</span>
        )}
        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted flex items-center gap-0.5">
          Inspect <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </Link>

      {/* Row 1 — what the session WAS. Same 3-up as the deep-dive header. */}
      <div className="grid grid-cols-3 gap-x-3">
        <Head first label="Volume" value={volumeKg != null ? fmtVolume(displayWeight(volumeKg)) : null} unit={unit} metric={m('volume')} />
        <Head label="Duration" value={session.durationMin != null ? `${session.durationMin}′` : null} metric={m('duration')} />
        <Head label="Sets" value={setCount != null ? `${setCount}` : null} metric={m('sets')} />
      </div>

      {/* Row 2 — context, at label size. Three cells, not the hero's four:
          `session_rpe` is not on this row shape, and a Difficulty cell that can
          only ever print an em-dash is a hole in the grid, not a metric. */}
      <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-white/[0.06]">
        <Sub label={session.prCount === 1 ? 'Record' : 'Records'} value={session.prCount != null ? `${session.prCount}` : null} color={GOLD} />
        <Sub label="Avg HR" value={session.avgBpm != null ? `${session.avgBpm}` : null} unit="bpm" color={OXIDE} />
        <Sub label="Calories" value={session.calories != null ? `${session.calories}` : null} unit="kcal" color={MACRO.calories} />
      </div>

      {/* The whole per-exercise table, as one sentence and a destination. */}
      {summary && (
        <Link href={`/session/${session.id}`} onPointerUp={blurOnTap}
          className="flex items-center gap-2 text-fluid-xs text-muted -m-1 p-1 rounded-lg active:opacity-80">
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" aria-hidden="true" />
        </Link>
      )}
    </Surface>
  )
}
