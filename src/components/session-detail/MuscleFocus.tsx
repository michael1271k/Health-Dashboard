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
  const maxSets = Math.max(...detail.muscleSets.map((m) => m.sets), 1)

  return (
    <section className="helix-card space-y-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: EMBER }} aria-hidden="true" /> Muscle Focus
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
          {/* Not "direct sets" any more — assisting muscles earn half a set each
              (SECONDARY_SET_CREDIT), so the total is a weighted count and can
              land on a half. Summed floats need the round; 11 − 10.7 is not 0.3. */}
          {round1(detail.muscleSets.reduce((n, m) => n + m.sets, 0))} weighted sets
        </span>
      </div>

      {/* This session's weighted set distribution */}
      <div className="space-y-2">
        {detail.muscleSets.map((m) => {
          const color = MUSCLE_COLOR[m.muscle] ?? MUTED
          return (
            <div key={m.muscle} className="flex items-center gap-2.5">
              <span className="text-fluid-xs font-semibold w-[74px] shrink-0 truncate" style={{ color }}>{m.muscle}</span>
              <span className="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <span className="block h-full rounded-full"
                  style={{ width: `${(m.sets / maxSets) * 100}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
              </span>
              <span className="helix-num text-fluid-xs text-muted w-10 text-right tabular-nums">
                {m.sets} set{m.sets !== 1 ? 's' : ''}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
