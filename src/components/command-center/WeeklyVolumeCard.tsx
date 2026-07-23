'use client'

import { Layers } from 'lucide-react'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { ZONE_META } from '@/lib/training/landmarks'

/**
 * Weekly Volume accumulator — committed sets per muscle this week vs the active
 * program's target, resetting every Sunday. On a cut the target is the MEV+
 * floor (defend muscle in a deficit); on a bulk it's the MAV ceiling to push
 * toward. Colour marks each muscle's zone.
 */
export function WeeklyVolumeCard() {
  const { data, isLoading } = useWeeklyVolume()

  if (isLoading) return <div className="helix-card h-48 animate-pulse" />
  if (!data) return null

  const total = data.muscles.reduce((n, m) => n + m.sets, 0)
  if (total === 0) return null // nothing logged yet this week

  const targetKind = data.program === 'cut' ? 'MEV+' : 'MAV'

  return (
    <div className="helix-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-semibold text-fluid-base text-text flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Weekly Volume
        </h2>
        <span className="text-fluid-xs text-muted">
          {data.program === 'cut' ? 'Helix Cut' : 'Helix Bulk'} · {targetKind} targets
        </span>
      </div>

      <p className="text-[10px] leading-snug text-muted">
        Sets per muscle this week (resets Sunday). <span className="text-text/70">MEV</span> = minimum effective
        volume to grow; <span className="text-text/70">MAV</span> = the top of the productive range. On a cut you defend
        the MEV floor; on a bulk you push toward MAV.
      </p>

      <div className="space-y-1.5">
        {data.muscles.map((m) => {
          const meta = ZONE_META[m.zone]
          const pct = m.target > 0 ? Math.min(100, (m.sets / m.target) * 100) : 0
          return (
            <div key={m.muscle} className="flex items-center gap-2.5">
              <span className="text-fluid-xs font-medium w-24 shrink-0 truncate" style={{ color: m.color }}>{m.muscle}</span>
              <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden relative">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: meta.color, boxShadow: `0 0 6px ${meta.color}55` }} />
              </span>
              <span className="helix-num text-fluid-xs tabular-nums w-14 text-right" style={{ color: meta.color }}>
                {m.sets}<span className="text-muted">/{m.target}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
