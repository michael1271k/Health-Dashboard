'use client'

import { Target } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { MUSCLE_COLOR } from '@/lib/training/landmarks'
import { EMBER, MUTED } from '@/lib/theme/palette'

/**
 * Muscle Focus — what THIS session actually trained (direct-set distribution
 * across the 13 landmark muscles, resolved from the exercise names performed).
 *
 * The week-to-date-vs-target aggregate that used to live here moved to the Muscle
 * Analytics tab (it's a weekly view, not a per-session one, and took too much
 * room on the summary). See `WeekToDateTargets`.
 */
/** Half sets are the smallest real unit; anything finer is float noise. */
const round1 = (v: number): number => Math.round(v * 10) / 10

export function MuscleFocus({ detail }: { detail: SessionDetail }) {
  if (!detail.muscleSets.length) return null
  const total = round1(detail.muscleSets.reduce((n, m) => n + m.sets, 0))

  /* ── ONE RAMP, NOT THIRTEEN BARS ──
     This was a `p-5` card with a heading and one full-width labelled bar per
     muscle — a section as tall as the exercise list, to say which muscles the
     workout you just read about trained. Every bar was scaled against the
     largest one, so the numbers on the right were the only exact reading and
     the bars were decoration for them.

     A single stacked ramp is the same distribution at a glance: each segment's
     WIDTH is its share of the session, which is the actual question, and the
     legend underneath keeps the exact per-muscle counts. */
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-1.5" style={{ color: EMBER }}>
          <Target className="w-3 h-3" aria-hidden="true" /> Focus
        </span>
        {/* Not "direct sets" any more — assisting muscles earn half a set each
            (SECONDARY_SET_CREDIT), so the total is a weighted count and can
            land on a half. Summed floats need the round; 11 − 10.7 is not 0.3. */}
        <span className="text-[10px] text-muted ml-auto helix-num">{total} weighted sets</span>
      </div>

      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]" aria-hidden="true">
        {detail.muscleSets.map((m) => (
          <span key={m.muscle}
            style={{
              width: `${(m.sets / (total || 1)) * 100}%`,
              background: MUSCLE_COLOR[m.muscle] ?? MUTED,
            }} />
        ))}
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        {detail.muscleSets.map((m) => {
          const color = MUSCLE_COLOR[m.muscle] ?? MUTED
          return (
            <span key={m.muscle} className="inline-flex items-center gap-1 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
              <span className="text-muted">{m.muscle}</span>
              <span className="helix-num font-bold text-text tabular-nums">{m.sets}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
