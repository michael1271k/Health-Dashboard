'use client'

import { memo } from 'react'

import type { Tables } from '@/lib/supabase/types'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { EcgPulse } from '@/components/fx/EcgPulse'

function scoreColor(v: number | null): string {
  if (v == null) return '#5A6B85'
  if (v >= 80) return '#8B5CF6'
  if (v >= 60) return '#22D3EE'
  if (v >= 40) return '#FBBF24'
  return '#FB7185'
}

/**
 * ReadinessOrb — the dashboard hero. A breathing glass orb: the RECOVERY score
 * at the core (physiological: sleep + HRV + resting-HR), the day BATTERY as a
 * liquid arc around the rim, ECG pulse beneath. These measure different things:
 * recovery reflects how restored your body is this morning and holds steady all
 * day; the battery drains with hours-awake + activity. So a 99 recovery beside a
 * 5% battery at night is expected, not a contradiction — the caption says so.
 * Opacity/glow animations only (the iOS backdrop-filter rule).
 */
export const ReadinessOrb = memo(function ReadinessOrb({ score, isLoading }: { score: Tables<'daily_scores'> | null; isLoading?: boolean }) {
  // Recovery = physiological recovery (sleep + HRV + resting-HR) — reads high
  // after good sleep. The blended adherence composite is the smaller "Daily Score".
  const total = score?.recovery_score ?? score?.score ?? null
  const composite = score?.score ?? null
  const battery = score?.battery_pct ?? null
  const color = scoreColor(total)
  const batteryColor = battery == null ? '#5A6B85' : battery >= 60 ? '#22D3EE' : battery >= 30 ? '#FBBF24' : '#FB7185'
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
        {/* Core: kinetic recovery score + the smaller Daily Score composite */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <KineticNumber value={total} className="helix-num text-6xl font-bold leading-none" />
          <span className="text-[11px] text-muted mt-1 uppercase tracking-widest">{total == null ? 'no data yet' : 'recovery'}</span>
          {composite != null && (
            <span className="text-[10px] text-muted mt-1">Daily Score <span className="helix-num font-semibold text-text">{composite}</span></span>
          )}
          {battery != null && (
            <span className="helix-num text-fluid-xs mt-0.5" style={{ color: batteryColor }}>{battery}% battery · energy spent</span>
          )}
        </div>
        {/* Specular highlight */}
        <div className="absolute left-9 top-8 w-16 h-8 rounded-full rotate-[-24deg] pointer-events-none" style={{ background: 'rgba(255,255,255,0.13)', filter: 'blur(2px)' }} />
      </div>
      <div className="w-52"><EcgPulse level={total} color={color} /></div>
      {/* Defuse the "99 recovery vs 5% battery" clash: when the body is well
          recovered but the day-battery has drained, say so explicitly. */}
      {total != null && total >= 75 && battery != null && battery < 35 && (
        <p className="text-[11px] text-muted text-center max-w-[15rem] leading-snug">
          Fully recovered — the battery is just today&apos;s energy spent, not lost recovery.
        </p>
      )}
    </div>
  )
})
