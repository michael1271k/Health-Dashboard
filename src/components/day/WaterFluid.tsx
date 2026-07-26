'use client'

import { useId } from 'react'
import { Droplets } from 'lucide-react'

const SAPPHIRE = '#3D7AB8'

/**
 * Hydration as a filling bottle, not a flat number — the Nexus instrument
 * cluster's water gauge. Intake syncs from HealthKit (Dietary Water), so this is
 * a read gauge: fluid clipped to a bottle silhouette rises with intake/goal, two
 * wave crests riding the surface (GPU-friendly translateX only).
 */
export function WaterFluid({ ml, goalMl }: { ml: number | null; goalMl: number }) {
  const uid = useId().replace(/[:]/g, '')
  const clip = `wf${uid}`
  const have = ml ?? 0
  const pct = Math.max(0, Math.min(1, goalMl > 0 ? have / goalMl : 0))

  // Fillable interior runs y≈28 (below the neck) → 122 (bottom): 94px of travel.
  const fillTop = 122 - pct * 94
  const fillH = 122 - fillTop

  return (
    <section className="helix-card space-y-2 min-h-[140px]" style={{ borderColor: `${SAPPHIRE}30` }}>
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5" style={{ color: SAPPHIRE }} aria-hidden="true" />
        <span className="font-heading font-semibold text-fluid-sm text-text">Hydration</span>
        <span className="ml-auto text-[10px] font-bold" style={{ color: SAPPHIRE }}>{Math.round(pct * 100)}%</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Bottle silhouette with rising fill */}
        <svg viewBox="0 0 60 130" width="56" height="122" aria-hidden="true" className="shrink-0"
          style={{ filter: `drop-shadow(0 0 8px ${SAPPHIRE}33)` }}>
          <defs>
            <clipPath id={clip}>
              <path d="M24,14 H36 V26 C36,32 48,32 48,46 V108 C48,118 42,122 34,122 H26 C18,122 12,118 12,108 V46 C12,32 24,32 24,26 Z" />
            </clipPath>
          </defs>

          {/* cap */}
          <rect x="23" y="5" width="14" height="9" rx="2.5" fill={SAPPHIRE} fillOpacity="0.55" />

          {/* interior wash + fluid, clipped to the bottle */}
          <g clipPath={`url(#${clip})`}>
            <rect x="0" y="0" width="60" height="130" fill="rgba(255,255,255,0.04)" />
            <g style={{ transform: `translateY(${fillTop}px)`, transition: 'transform 700ms cubic-bezier(0.22,1,0.36,1)' }}>
              <rect x="0" y="0" width="60" height={fillH + 8} fill={SAPPHIRE} fillOpacity="0.5" />
              {/* wave crests riding the surface */}
              <svg x="0" y="-4" width="120" height="9" viewBox="0 0 120 9" preserveAspectRatio="none" className="water-wave">
                <path d="M0 5 C 15 0, 30 9, 45 5 C 60 0, 75 9, 90 5 C 105 0, 120 9, 135 5 L135 9 L0 9 Z" fill={SAPPHIRE} fillOpacity="0.6" />
              </svg>
              <svg x="0" y="-3" width="120" height="8" viewBox="0 0 120 9" preserveAspectRatio="none" className="water-wave--slow">
                <path d="M0 5 C 20 8, 40 2, 60 5 C 80 8, 100 2, 120 5 L120 9 L0 9 Z" fill={SAPPHIRE} fillOpacity="0.32" />
              </svg>
            </g>
          </g>

          {/* glass outline */}
          <path d="M24,14 H36 V26 C36,32 48,32 48,46 V108 C48,118 42,122 34,122 H26 C18,122 12,118 12,108 V46 C12,32 24,32 24,26 Z"
            fill="none" stroke={SAPPHIRE} strokeOpacity="0.55" strokeWidth="1.4" />
        </svg>

        {/* Readout */}
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span className="helix-num text-fluid-2xl font-bold text-text">{(have / 1000).toFixed(1)}</span>
            <span className="text-fluid-xs text-muted">/ {(goalMl / 1000).toFixed(1)} L</span>
          </div>
          <span className="text-[10px] text-muted">Dietary water · today</span>
        </div>
      </div>
    </section>
  )
}
