'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Quote } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Surface } from '@/components/ui/Zone'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf } from '@/lib/utils/week'
import { programWeekNumber } from '@/lib/reports/weekNumber'
import { firstDirective } from '@/lib/reports/directive'
import { useReports } from '@/lib/hooks/useReports'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { clientScheduleContext, sessionTargetIn } from '@/lib/programs'
import { EMBER, EMERALD, OXIDE, MUTED, GOLD } from '@/lib/theme/palette'
import { formatSleep } from '@/lib/utils/format'

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

export type ChangeDirection = 'up' | 'down'

export interface WeekChange {
  label: string
  text: string
  direction: ChangeDirection
  /** Whether the direction is good — sleep down is bad, tonnage down is bad. */
  good: boolean
}

export interface WeekTotals {
  volumeKg: number
  sessions: number
  sleepMin: number | null
  score: number | null
}

/** Percent change, guarding the divide — a week from zero has no percentage. */
const pct = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null

/**
 * The ONE change worth naming, chosen by relative size.
 *
 * Ranked by |%| rather than by a fixed priority so the card says what actually
 * moved. A 14% tonnage jump and a 3-minute sleep difference are not equally
 * interesting, and a card that always leads with the same metric stops being
 * read after the second week.
 *
 * Sessions compare as counts, not percentages: one session out of four is a 25%
 * swing that reads as enormous next to a real 25% tonnage change.
 */
export function biggestChange(cur: WeekTotals, prev: WeekTotals): WeekChange | null {
  const candidates: Array<WeekChange & { rank: number }> = []

  const vol = pct(cur.volumeKg, prev.volumeKg)
  if (vol != null && vol !== 0) {
    candidates.push({
      label: 'Tonnage', text: `${vol > 0 ? '+' : ''}${vol}%`,
      direction: vol > 0 ? 'up' : 'down', good: vol > 0, rank: Math.abs(vol),
    })
  }

  if (cur.sleepMin != null && prev.sleepMin != null) {
    const d = Math.round(cur.sleepMin - prev.sleepMin)
    if (Math.abs(d) >= 10) {
      candidates.push({
        label: 'Sleep', text: `${d > 0 ? '+' : '−'}${formatSleep(Math.abs(d))}`,
        direction: d > 0 ? 'up' : 'down', good: d > 0,
        rank: Math.abs(pct(cur.sleepMin, prev.sleepMin) ?? 0),
      })
    }
  }

  if (cur.score != null && prev.score != null) {
    const d = Math.round(cur.score - prev.score)
    if (d !== 0) {
      candidates.push({
        label: 'Daily score', text: `${d > 0 ? '+' : '−'}${Math.abs(d)}`,
        direction: d > 0 ? 'up' : 'down', good: d > 0,
        rank: Math.abs(pct(cur.score, prev.score) ?? 0),
      })
    }
  }

  const s = cur.sessions - prev.sessions
  if (s !== 0) {
    candidates.push({
      label: 'Sessions', text: `${s > 0 ? '+' : '−'}${Math.abs(s)}`,
      direction: s > 0 ? 'up' : 'down', good: s > 0,
      // Deliberately flat: a count change ranks below any real percentage move
      // so it only wins a week in which nothing else changed.
      rank: 1,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.rank - a.rank)
  const { label, text, direction, good } = candidates[0]
  return { label, text, direction, good }
}

/** Totals for one week — the same shape for this week and the last. */
function totalsFrom(
  sessions: Array<{ started_at: string; total_volume_kg: number | null }>,
  sleep: Array<{ start_time: string; duration_min: number | null }>,
  scores: Array<{ date: string; score: number | null }>,
  from: string,
  to: string,
): WeekTotals {
  const inRange = (iso: string) => iso >= from && iso <= to
  const wk = sessions.filter((s) => inRange(s.started_at.slice(0, 10)))
  const sl = sleep.filter((s) => inRange(s.start_time.slice(0, 10)))
    .map((s) => s.duration_min).filter((v): v is number => v != null && v > 0)
  const sc = scores.filter((s) => inRange(s.date))
    .map((s) => s.score).filter((v): v is number => v != null)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    volumeKg: wk.reduce((n, s) => n + (s.total_volume_kg ?? 0), 0),
    sessions: wk.length,
    sleepMin: mean(sl),
    score: mean(sc),
  }
}

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
  const { data: reports } = useReports()

  const target = sessionTargetIn(clientScheduleContext())
  const done = data?.cur.sessions ?? 0
  const change = data ? biggestChange(data.cur, data.prev) : null
  // The newest report is the one that describes THIS week's instructions —
  // it was written about last week and prescribes the next one.
  const directive = firstDirective(reports?.[0]?.content_md)

  if (isLoading) {
    return <Surface variant="band" measure="grid" pad="snug"><div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" aria-hidden="true" /></Surface>
  }

  return (
    <Surface variant="band" measure="grid" pad="snug" href="/pathfinder" label="The week so far">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
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
        </div>

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

        {/* RETRIEVED from your last pasted report — never generated. Renders
            nothing at all when no report carries a directive. */}
        {directive && (
          <p className="flex items-start gap-1.5 text-[11px] leading-snug rounded-lg px-2 py-1.5"
            style={{ background: `${GOLD}0f`, border: `1px solid ${GOLD}2e` }}>
            <Quote className="w-3 h-3 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
            <span className="text-text/90 min-w-0">{directive}</span>
          </p>
        )}
      </div>
    </Surface>
  )
}

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
