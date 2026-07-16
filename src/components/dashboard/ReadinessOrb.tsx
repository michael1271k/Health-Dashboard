'use client'

import { memo } from 'react'

import type { Tables } from '@/lib/supabase/types'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { EcgPulse } from '@/components/fx/EcgPulse'

function scoreColor(v: number | null): string {
  if (v == null) return '#5A6B85'
  if (v >= 80) return '#16F5C3'
  if (v >= 60) return '#3EE0FF'
  if (v >= 40) return '#FFB86B'
  return '#FF5470'
}

/**
 * ReadinessOrb — the dashboard hero. A breathing glass orb: kinetic daily score
 * at the core, the battery as a liquid arc around the rim, ECG pulse beneath.
 * Opacity/glow animations only (the iOS backdrop-filter rule).
 */
export const ReadinessOrb = memo(function ReadinessOrb({ score, isLoading }: { score: Tables<'daily_scores'> | null; isLoading?: boolean }) {
  const total = score?.score ?? null
  const battery = score?.battery_pct ?? null
  const color = scoreColor(total)
  const batteryColor = battery == null ? '#5A6B85' : battery >= 60 ? '#3EE0FF' : battery >= 30 ? '#FFB86B' : '#FF5470'
  const R = 84
  const CIRC = 2 * Math.PI * R

  if (isLoading) {
    return <div className="mx-auto w-56 h-56 rounded-full bg-surface-2/60 animate-pulse" />
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-56 h-56 orb-breathe" data-testid="readiness-orb">
        {/* Glass sphere */}
        <div
          className="absolute inset-3 rounded-full border border-white/12"
          style={{
            background: 'radial-gradient(circle at 36% 30%, rgba(22,62,72,0.55), rgba(5,10,20,0.75) 70%)',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -10px 30px rgba(0,0,0,0.45), 0 0 42px ${color}2e`,
          }}
        />
        {/* Battery liquid arc around the rim */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 w-full h-full">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
          {battery != null && (
            <circle
              key={battery}
              className="score-ring-draw"
              cx="100" cy="100" r={R} fill="none"
              stroke={batteryColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={CIRC}
              style={{ strokeDashoffset: CIRC - CIRC * (battery / 100), color: batteryColor, filter: `drop-shadow(0 0 6px ${batteryColor}88)` }}
            />
          )}
        </svg>
        {/* Core: kinetic score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <KineticNumber value={total} className="helix-num text-6xl font-bold leading-none" />
          <span className="text-[11px] text-muted mt-1 uppercase tracking-widest">{total == null ? 'no data yet' : 'readiness'}</span>
          {battery != null && (
            <span className="helix-num text-fluid-xs mt-0.5" style={{ color: batteryColor }}>{battery}% battery</span>
          )}
        </div>
        {/* Specular highlight */}
        <div className="absolute left-9 top-8 w-16 h-8 rounded-full rotate-[-24deg] pointer-events-none" style={{ background: 'rgba(255,255,255,0.13)', filter: 'blur(2px)' }} />
      </div>
      <div className="w-52"><EcgPulse level={total} color={color} /></div>
    </div>
  )
})
