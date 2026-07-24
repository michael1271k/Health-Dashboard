'use client'

import { memo, useEffect, useState } from 'react'

import type { Tables } from '@/lib/supabase/types'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { EcgPulse } from '@/components/fx/EcgPulse'
import { hoursAwakeToday } from '@/lib/utils/day'
import { programStreak } from '@/components/dashboard/BrandHeader'
import { EMBER, GOLD, OXIDE, DIM, HAIRLINE } from '@/lib/theme/palette'

/**
 * BatteryOrb — the dashboard's SINGLE master metric.
 *
 * Previously this showed the recovery score in the core and the battery on the
 * rim using two DIFFERENT colour scales, which produced nonsense like "98 inside
 * a red wheel" at 23:00. There is now exactly one number and one scale: the
 * drain-only day battery. It starts at the sleep-derived wake charge and only
 * depletes (hours awake + activity + workout hardness), so it always reads the
 * same direction. The composite Daily Score is demoted to a small chip below.
 */

/** One scale, used by BOTH the ring and the number — they can never disagree. */
function batteryColor(v: number | null): string {
  if (v == null) return DIM
  if (v >= 60) return EMBER    // plenty in the tank
  if (v >= 30) return GOLD     // running down
  return OXIDE                 // depleted
}

export const ReadinessOrb = memo(function ReadinessOrb({ score, isLoading }: { score: Tables<'daily_scores'> | null; isLoading?: boolean }) {
  const battery = score?.battery_pct ?? null
  const composite = score?.score ?? null
  // Empty sleep = no score: a scored day with no sleep synced yet is PENDING,
  // never a fabricated number built from nutrition/activity alone.
  const awaitingSleep = composite != null && (score?.sleep_score ?? null) == null
  const color = batteryColor(battery)
  const streak = programStreak()
  const R = 84
  const CIRC = 2 * Math.PI * R
  // Hours-awake is TIME-dependent, so computing it during render made the
  // build-time prerendered HTML disagree with the hydrated client → React #418
  // hydration mismatch. Resolve it client-side only, after mount.
  const [awake, setAwake] = useState<number | null>(null)
  useEffect(() => { setAwake(Math.round(hoursAwakeToday())) }, [])

  if (isLoading) {
    return <div className="mx-auto w-56 h-56 rounded-full bg-surface-2/60 animate-pulse" />
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-56 h-56 orb-breathe" data-testid="readiness-orb">
        {/* Glass sphere */}
        <div
          className="absolute inset-3 rounded-full border border-white/10"
          style={{
            background: 'radial-gradient(circle at 36% 30%, rgba(48,40,36,0.55), rgba(8,9,12,0.80) 70%)',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -10px 30px rgba(0,0,0,0.5), 0 0 42px ${color}2e`,
          }}
        />
        {/* The single battery arc — same colour as the number */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 w-full h-full">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          {battery != null && !awaitingSleep && (
            <circle
              key={battery}
              className="score-ring-draw"
              cx="100" cy="100" r={R} fill="none"
              stroke={color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={CIRC}
              style={{ strokeDashoffset: CIRC - CIRC * (battery / 100), color, filter: `drop-shadow(0 0 6px ${color}88)` }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {awaitingSleep ? (
            <>
              <span className="text-3xl" role="img" aria-label="moon">🌙</span>
              <span className="font-heading font-semibold text-fluid-base text-text mt-2 leading-tight">Awaiting Sleep Data</span>
              <span className="text-[11px] text-muted mt-1">Sync your Watch to score today</span>
            </>
          ) : (
            <>
              <span className="flex items-baseline">
                <KineticNumber value={battery} className="helix-num text-6xl font-bold leading-none" />
                {battery != null && <span className="helix-num text-2xl font-bold leading-none" style={{ color }}>%</span>}
              </span>
              <span className="text-[11px] text-muted mt-1 uppercase tracking-widest">
                {battery == null ? 'no data yet' : 'battery'}
              </span>
              {battery != null && (
                <span className="text-[10px] text-muted mt-1.5 leading-snug min-h-[13px]">
                  {awake != null ? `${awake}h awake · drains with the day` : 'drains with the day'}
                </span>
              )}
            </>
          )}
        </div>
        {/* Specular highlight */}
        <div className="absolute left-9 top-8 w-16 h-8 rounded-full rotate-[-24deg] pointer-events-none" style={{ background: 'rgba(255,255,255,0.11)', filter: 'blur(2px)' }} />
      </div>

      {/* Day-streak — relocated here from the header, which had no room. */}
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 -mt-1"
        style={{ color: EMBER, background: `${EMBER}14`, border: `1px solid ${EMBER}3d` }}
        aria-label={`Day streak: ${streak} days`}
      >
        <span aria-hidden="true" className="text-fluid-sm leading-none">🔥</span>
        <span className="helix-num text-fluid-sm font-extrabold leading-none">{streak}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide leading-none">Day Streak</span>
      </span>

      <div className="w-52"><EcgPulse level={battery} color={color} /></div>

      {/* Daily Score demoted to a secondary chip — one hero metric, no rivalry. */}
      {composite != null && !awaitingSleep && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 border text-[11px]"
          style={{ borderColor: HAIRLINE, background: 'rgba(255,255,255,0.03)' }}>
          <span className="text-muted uppercase tracking-wide">Daily Score</span>
          <span className="helix-num font-bold text-text">{composite}</span>
        </span>
      )}
    </div>
  )
})
