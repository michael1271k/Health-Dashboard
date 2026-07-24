'use client'

import { Target } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { landmarkFor, bandZone, ZONE_META } from '@/lib/training/landmarks'

/**
 * Muscle focus for the session: a set-distribution bar per worked group, and —
 * below it — where that group's set count sits on its weekly volume-landmark
 * band (MEV → MAV → MRV), so each session reads against the productive range.
 */
export function MuscleFocus({ detail }: { detail: SessionDetail }) {
  if (!detail.muscleSets.length) return null
  const maxSets = Math.max(...detail.muscleSets.map((m) => m.sets), 1)

  return (
    <section className="helix-card space-y-3">
      <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
        <Target className="w-4 h-4" style={{ color: '#B84F28' }} aria-hidden="true" /> Muscle Focus
      </h2>

      {/* Set-distribution bars */}
      <div className="space-y-2">
        {detail.muscleSets.map((m) => {
          const color = GROUP_COLOR[m.group] ?? '#79808C'
          return (
            <div key={m.group} className="flex items-center gap-2.5">
              <span className="text-fluid-xs font-semibold w-16 shrink-0" style={{ color }}>{m.group}</span>
              <span className="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${(m.sets / maxSets) * 100}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
              </span>
              <span className="helix-num text-fluid-xs text-muted w-10 text-right tabular-nums">{m.sets} set{m.sets !== 1 ? 's' : ''}</span>
            </div>
          )
        })}
      </div>

      {/* Volume-landmark (MEV/MAV/MRV) band per group this session hit */}
      <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted">Weekly volume landmarks · this session&apos;s sets</p>
        {detail.muscleSets.map((m) => {
          const l = landmarkFor(m.group)
          if (!l) return null
          const zone = bandZone(m.sets, l)
          const meta = ZONE_META[zone]
          const scaleMax = l.mrv * 1.15
          return (
            <div key={m.group} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-text/80">{m.group}</span>
                <span className="helix-num" style={{ color: meta.color }}>{meta.label} · {m.sets}/{l.mav} MAV</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
                {/* MEV→MAV productive band shading */}
                <span className="absolute inset-y-0 rounded-full" style={{ left: `${(l.mev / scaleMax) * 100}%`, width: `${((l.mav - l.mev) / scaleMax) * 100}%`, background: 'rgba(52,211,153,0.18)' }} />
                {/* current fill */}
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (m.sets / scaleMax) * 100)}%`, background: meta.color, boxShadow: `0 0 6px ${meta.color}66` }} />
                {/* MRV ceiling tick */}
                <span className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(l.mrv / scaleMax) * 100}%` }} aria-hidden="true" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
