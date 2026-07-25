'use client'

import { Droplets } from 'lucide-react'

const SAPPHIRE = '#3D7AB8'

/**
 * Hydration as a rising fluid column, not a flat number — the Nexus instrument
 * cluster's water gauge. Intake syncs from HealthKit (Dietary Water), so this is
 * a read gauge: a DOM fill whose HEIGHT tracks intake/goal, with two animated
 * wave crests riding the surface (GPU-friendly translateX only).
 */
export function WaterFluid({ ml, goalMl }: { ml: number | null; goalMl: number }) {
  const have = ml ?? 0
  const pct = Math.max(0, Math.min(1, goalMl > 0 ? have / goalMl : 0))

  return (
    <section className="helix-card !p-0 overflow-hidden relative min-h-[140px]" style={{ borderColor: `${SAPPHIRE}30` }}>
      {/* Rising fluid fill */}
      <div className="absolute inset-x-0 bottom-0" aria-hidden="true"
        style={{ height: `${pct * 100}%`, transition: 'height 700ms cubic-bezier(0.22,1,0.36,1)' }}>
        {/* Wave crest sitting on top of the fill (2x wide, drifts to loop) */}
        <svg className="absolute left-0 -top-[7px] w-[200%] h-3.5" viewBox="0 0 120 14" preserveAspectRatio="none">
          <path className="water-wave" fill={SAPPHIRE} fillOpacity="0.5"
            d="M0 7 C 15 0, 30 14, 45 7 C 60 0, 75 14, 90 7 C 105 0, 120 14, 135 7 L135 14 L0 14 Z" />
        </svg>
        <svg className="absolute left-0 -top-[5px] w-[200%] h-3 water-wave--slow" viewBox="0 0 120 14" preserveAspectRatio="none">
          <path fill={SAPPHIRE} fillOpacity="0.28"
            d="M0 7 C 20 12, 40 2, 60 7 C 80 12, 100 2, 120 7 L120 14 L0 14 Z" />
        </svg>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${SAPPHIRE}8c, ${SAPPHIRE}30)` }} />
      </div>

      {/* Readout */}
      <div className="relative p-3 flex flex-col gap-2 h-full min-h-[140px]">
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5" style={{ color: SAPPHIRE }} aria-hidden="true" />
          <span className="font-heading font-semibold text-fluid-sm text-text">Hydration</span>
          <span className="ml-auto text-[10px] font-bold" style={{ color: SAPPHIRE }}>{Math.round(pct * 100)}%</span>
        </div>
        <div className="mt-auto flex items-baseline gap-1">
          <span className="helix-num text-fluid-2xl font-bold text-text">{(have / 1000).toFixed(1)}</span>
          <span className="text-fluid-xs text-muted">/ {(goalMl / 1000).toFixed(1)} L</span>
        </div>
      </div>
    </section>
  )
}
