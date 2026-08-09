'use client'

import { Target } from 'lucide-react'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { ZONE_META } from '@/lib/training/landmarks'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { EMBER } from '@/lib/theme/palette'

/**
 * Week-to-date direct sets vs the active program's per-muscle target — the single
 * most actionable "what should I train next" view, so it sits at the TOP of the
 * Muscle Analytics tab. Moved here from the per-session summary (it was a weekly
 * aggregate crammed onto a session page). Muscles with no sets this week are
 * omitted, never zero-filled.
 *
 * This is now the ONLY MEV/MAV card. `WeeklyVolumeCard` rendered the same hook's
 * data ten lines away on the same page — two cards, two `workout_sets` scans,
 * and they disagreed about zero-target muscles (that one printed a literal
 * "3/0").
 */
export function WeekToDateTargets() {
  const today = logicalTodayISO()
  const weekStart = weekStartOf(today)
  const { data: week } = useWeeklyVolume(weekStart, today)

  // A zero TARGET means the phase does not program that muscle at all —
  // Adductors on a cut, for instance. Rendering it as a bar with no target is
  // noise at best and reads as a failed goal at worst.
  const rows = (week?.muscles ?? []).filter((m) => m.sets > 0 && m.target > 0)
  if (!rows.length) return null

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: EMBER }} aria-hidden="true" /> Week to date
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
          Sun → {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          {week ? ` · ${week.program} targets` : ''}
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map((m) => {
          const meta = ZONE_META[m.zone]
          const scaleMax = Math.max(m.target * 1.4, m.sets, 1)
          return (
            <div key={m.muscle} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-semibold text-text/80 truncate">{m.muscle}</span>
                <span className="helix-num shrink-0" style={{ color: meta.color }}>
                  {m.sets}{m.target > 0 ? `/${m.target}` : ''} · {meta.label}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <span className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.min(100, (m.sets / scaleMax) * 100)}%`, background: meta.color, boxShadow: `0 0 6px ${meta.color}aa` }} />
                {m.target > 0 && (
                  <span className="absolute inset-y-0 w-px bg-white/45"
                    style={{ left: `${(m.target / scaleMax) * 100}%` }} aria-hidden="true" />
                )}
              </div>
              {m.target > 0 && m.sets < m.target && (
                // Rounded: assisting muscles pay half sets, and 11 − 10.7 is
                // 0.2999999999999998 in float, not 0.3.
                <p className="text-[9px] text-muted">
                  {Math.round((m.target - m.sets) * 10) / 10} to target
                  {m.indirectSets > 0 ? ` · ${m.indirectSets} indirect` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
