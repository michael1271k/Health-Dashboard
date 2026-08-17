'use client'

import { memo } from 'react'
import {
  ATLAS_VIEWBOX, BASE_SHAPES, MUSCLE_PATHS, type AtlasView,
} from '@/lib/body/atlas'
import type { LandmarkMuscle } from '@/lib/training/landmarks'
import { EMBER } from '@/lib/theme/palette'

/**
 * The one component that draws a body.
 *
 * ── WHAT IT IS AND IS NOT ────────────────────────────────────────────────────
 * It renders INTENSITY per muscle, 0–1, and nothing else. It does not know what
 * the intensity means: soreness, sets, tonnage share, a plan's targets — all of
 * those become a number between nothing and everything before they arrive here.
 * That is what lets the same figure serve the DOMS tracker, the session report
 * and the progress page without any of them owning the anatomy.
 *
 * The base is greyscale and always drawn. An untouched muscle is part of a body,
 * not a zero — painting it in the accent at 0% would make a rest day look like a
 * diagram of a corpse.
 */
export const MuscleAtlas = memo(function MuscleAtlas({
  worked, view = 'front', color = EMBER, interactive = false, onPick, className = '', label,
}: {
  /** muscle → 0–1. Missing or 0 draws as base greyscale. */
  worked?: Partial<Record<LandmarkMuscle, number>>
  /** `both` draws front and back side by side, sharing one scale. */
  view?: AtlasView | 'both'
  color?: string
  interactive?: boolean
  onPick?: (muscle: LandmarkMuscle) => void
  className?: string
  /** Accessible name. Defaults to naming the view. */
  label?: string
}) {
  if (view === 'both') {
    return (
      <div className={`flex items-stretch gap-1 ${className}`}>
        <MuscleAtlas worked={worked} view="front" color={color} interactive={interactive} onPick={onPick} className="flex-1" />
        <MuscleAtlas worked={worked} view="back" color={color} interactive={interactive} onPick={onPick} className="flex-1" />
      </div>
    )
  }

  const paths = MUSCLE_PATHS.filter((p) => p.view === view)

  return (
    <svg
      viewBox={`0 0 ${ATLAS_VIEWBOX.width} ${ATLAS_VIEWBOX.height}`}
      className={`w-full h-full ${className}`}
      role="group"
      aria-label={label ?? `Muscle map, ${view} view`}
    >
      {/* Anatomy, not data — head, neck and feet. Never interactive. */}
      <g aria-hidden="true" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" strokeWidth="0.75">
        {BASE_SHAPES.map((d, i) => <path key={i} d={d} />)}
      </g>

      {paths.map((p, i) => {
        const intensity = Math.max(0, Math.min(1, worked?.[p.muscle] ?? 0))
        const on = intensity > 0
        // Alpha, not a colour ramp: one hue at four strengths reads as "more of
        // the same thing", where a green→red ramp would read as a verdict — and
        // this figure makes no verdicts. Floor of 0.18 so the lightest real
        // work is still visible against the base.
        const fill = on ? `${color}${alphaHex(0.18 + intensity * 0.62)}` : 'rgba(255,255,255,0.05)'
        const stroke = on ? color : 'rgba(255,255,255,0.12)'

        const common = {
          d: p.d,
          style: {
            fill, stroke,
            strokeWidth: on ? 1.1 : 0.75,
            transition: 'fill 220ms ease, stroke 220ms ease',
          },
        }

        if (!interactive) return <path key={`${p.muscle}-${i}`} {...common} aria-hidden="true" />

        return (
          <path
            key={`${p.muscle}-${i}`}
            {...common}
            role="button"
            tabIndex={0}
            aria-label={`${p.muscle}${on ? ` — worked` : ''}`}
            aria-pressed={on}
            onClick={() => onPick?.(p.muscle)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onPick?.(p.muscle)
            }}
            className="cursor-pointer outline-none focus-visible:stroke-[1.6]"
          />
        )
      })}
    </svg>
  )
})

/** 0–1 → the two hex digits an 8-digit colour needs. */
function alphaHex(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')
}
