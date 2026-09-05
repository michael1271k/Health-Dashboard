'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Surface } from '@/components/ui/Zone'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf } from '@/lib/utils/week'
import { programWeekNumber } from '@/lib/reports/weekNumber'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { clientScheduleContext, sessionTargetIn } from '@/lib/programs'
import { EMBER, EMERALD, OXIDE, MUTED } from '@/lib/theme/palette'
import { biggestChange, totalsFrom, type WeekTotals } from '@/lib/dashboard/weekSoFar'

/**
 * "The Week So Far" — what changed, not what the average was.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * `WeeklyReviewCard` listed four means: daily score, sleep, sessions, water.
 * Every one of them is already on screen, higher up, in the six BioStrips — so
 * the card's entire content was a second, less precise rendering of the row
 * above it, and it arrived below the fold where nobody compares anything.
 *
 * A mean is also the wrong shape for a week in progress. "Sleep 7.1h" on a
 * Tuesday is two nights averaged and says nothing about whether this week is
 * going better or worse than the last one, which is the only question a
 * mid-week card can usefully answer.
 *
 * So: which week this is and how much of it is done, the single largest change
 * against last week — named, not listed — and the directive you were given for
 * this week. Three lines, none of them repeated anywhere else on the page.
 */

function useWeekSoFar(thisWeek: string, lastWeek: string, today: string) {
  return useQuery({
    queryKey: ['week_so_far', thisWeek],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ cur: WeekTotals; prev: WeekTotals }> => {
      // ONE window covering both weeks, split in memory. Two round-trips per
      // table to compare a week to the week before it is three extra requests
      // on a cold dashboard for data that arrives in the same rows.
      const from = lastWeek
      const [sessions, sleep, scores] = await Promise.all([
        supabase.from('workout_sessions').select('started_at, total_volume_kg')
          .gte('started_at', `${from}T00:00:00Z`).lte('started_at', `${today}T23:59:59Z`),
        supabase.from('sleep_sessions').select('start_time, duration_min')
          .gte('start_time', `${from}T00:00:00Z`).lte('start_time', `${today}T23:59:59Z`),
        supabase.from('daily_scores').select('date, score').gte('date', from).lte('date', today),
      ])
      const S = (sessions.data ?? []) as Array<{ started_at: string; total_volume_kg: number | null }>
      const Z = (sleep.data ?? []) as Array<{ start_time: string; duration_min: number | null }>
      const C = (scores.data ?? []) as Array<{ date: string; score: number | null }>
      const dayBefore = (iso: string) => {
        const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1)
        return d.toISOString().slice(0, 10)
      }
      return {
        cur: totalsFrom(S, Z, C, thisWeek, today),
        prev: totalsFrom(S, Z, C, lastWeek, dayBefore(thisWeek)),
      }
    },
  })
}

export function WeekSoFarCard() {
  // The session TARGET comes from the active plan, which lives in localStorage.
  void useScheduleVersion()
  const today = logicalTodayISO()
  const thisWeek = weekStartOf(today, 0)
  const lastWeek = isoMinus(thisWeek, 7)
  const { data, isLoading } = useWeekSoFar(thisWeek, lastWeek, today)
  const target = sessionTargetIn(clientScheduleContext())
  const done = data?.cur.sessions ?? 0
  const change = data ? biggestChange(data.cur, data.prev) : null

  if (isLoading) {
    return <Surface variant="band" measure="grid" pad="snug"><div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" aria-hidden="true" /></Surface>
  }

  return (
    // NOT a linked Surface any more. Each target row is its own link to the
    // surface that fixes it, and an anchor inside an anchor is invalid markup
    // that React refuses to hydrate — so the card's own link moved inward onto
    // the header row it always described.
    <Surface variant="band" measure="grid" pad="snug" label="The week so far">
      <div className="space-y-2">
        <Link href="/pathfinder" className="flex items-center gap-2.5 active:opacity-80" aria-label="The week so far">
          <SessionRing done={done} target={target} />
          <span className="min-w-0 flex-1">
            <span className="block font-heading font-semibold text-fluid-sm text-text leading-tight">
              Week {programWeekNumber(today)}
            </span>
            <span className="block text-[11px] text-muted">
              {done} of {target} sessions logged
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
        </Link>

        {/* The single largest move, NAMED. Four means said less than this one
            sentence, and cost four rows to say it. */}
        <p className="text-fluid-xs">
          {change ? (
            <>
              <span className="text-muted">vs last week · </span>
              <span className="text-text">{change.label} </span>
              <span className="font-bold" style={{ color: change.good ? EMERALD : OXIDE }}>
                {change.text}
              </span>
            </>
          ) : (
            <span className="text-muted">No change worth reporting against last week yet.</span>
          )}
        </p>

        {/* ── THE PASTED-REPORT NOTE IS GONE ──
            Two renderers stood here: a target-vs-actual table and, when that
            found nothing, the report's first directive sentence as a quote.
            Both took markdown written OUTSIDE the app, by hand, in a format
            that changes without a release, and put whatever the parser made of
            it on the dashboard as fact — which is what produced the
            "fueled upper 3.6 t 2 pr" row.

            That failure is not a parser bug to tighten. `fmtV2` is deliberately
            tolerant (see `fmt-v2-reader`) because the format is not ours to
            pin down, and a tolerant parser pointed at free prose will always
            find something eventually. The mechanism is what was wrong: nothing
            checked that a matched line MEANT anything, and there was no state
            in which a bad match could be corrected — you cannot edit a note
            that was derived, only re-paste the report.

            Everything real that it carried has a first-class home already: the
            week's numbers are the card above, per-exercise prescriptions still
            reach the deck through `useReportTargets`, and the report itself is
            two taps away under Reports. */}
      </div>
    </Surface>
  )
}

/** No readings yet is not a week of zeros — every field stays null. */

const isoMinus = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Sessions done against the plan's own count — a ring, not a fifth number. */
function SessionRing({ done, target }: { done: number; target: number }) {
  const pctDone = target > 0 ? Math.min(1, done / target) : 0
  const size = 34, stroke = 3.5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const color = pctDone >= 1 ? EMERALD : EMBER
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        {pctDone > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pctDone)} />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center helix-num text-[11px] font-bold"
        style={{ color: done ? color : MUTED }}>
        {done}
      </span>
    </span>
  )
}
