'use client'

import { memo, useId } from 'react'
import {
  ATLAS_VIEWBOX, BASE_SHAPES, DETAIL_SHAPES, MUSCLE_PATHS, type AtlasView,
} from '@/lib/body/atlas'
import type { LandmarkMuscle } from '@/lib/training/landmarks'
import { ATLAS_BLUE } from '@/lib/theme/palette'

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
 *
 * ── WHERE THE THIRD DIMENSION COMES FROM ─────────────────────────────────────
 * Nowhere in `atlas.ts`, deliberately. Geometry is shared with the iOS widget
 * through a generator that emits SwiftUI `Path`s, and a `Path` has no fill; how
 * a body is LIT is a rendering decision, and it differs between a 24px
 * thumbnail and a 220px sheet.
 *
 * So the modelling is three gradients declared here:
 *
 *   · `flesh`  — the untouched body, lit from the top-left. This single change
 *                is most of why the figure stopped reading as a diagram: a flat
 *                5%-white fill has no form, and a body without form is a chart.
 *   · `belly`  — the same light over an untouched muscle, one step brighter than
 *                the silhouette so the bellies separate from the mass they sit on.
 *   · `worked` — the accent, brightest where the light falls. A worked muscle
 *                should look lit, not merely coloured.
 *
 * No SVG `filter`s. `feGaussianBlur` over ~30 paths × 2 views is a per-frame
 * cost on the one screen whose keystroke latency has been measured and fixed
 * twice, and iOS Safari rasterises filters at unpredictable resolutions.
 *
 * ── AND WHY THE IDS ARE SUFFIXED ─────────────────────────────────────────────
 * `view="both"` renders two `<svg>`s, and the session report shows a thumbnail
 * and a sheet at once — up to four figures in one document. Duplicate `<defs>`
 * ids in one document all resolve to whichever painted first, so a `useId`
 * suffix is not tidiness, it is the difference between four bodies and one body
 * painted four times.
 */
export const MuscleAtlas = memo(function MuscleAtlas({
  worked, view = 'front', color = ATLAS_BLUE, colorFor, interactive = false, onPick, className = '', label,
}: {
  /** muscle → 0–1. Missing or 0 draws as base greyscale. */
  worked?: Partial<Record<LandmarkMuscle, number>>
  /** `both` draws front and back side by side, sharing one scale. */
  view?: AtlasView | 'both'
  color?: string
  /**
   * Per-muscle hue, overriding `color` for the muscles it answers for.
   *
   * ── WHY A FUNCTION AND NOT A MAP ────────────────────────────────────────────
   * The figure must not import the training taxonomy. Every caller that wants
   * anatomical colour already has `landmarkColor` to hand, and passing the
   * lookup keeps this component knowing only geometry and light — which is what
   * lets the same body serve the DOMS tracker (one accent) and the weekly
   * breakdown (sixteen hues) without either of them owning the other's palette.
   *
   * Returning a falsy value for a muscle falls back to `color`, so a caller can
   * tint three muscles and leave the rest alone.
   */
  colorFor?: (muscle: LandmarkMuscle) => string | undefined
  interactive?: boolean
  onPick?: (muscle: LandmarkMuscle) => void
  className?: string
  /** Accessible name. Defaults to naming the view. */
  label?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (view === 'both') {
    return (
      <div className={`flex items-stretch gap-1 ${className}`}>
        <MuscleAtlas worked={worked} view="front" color={color} colorFor={colorFor} interactive={interactive} onPick={onPick} className="flex-1" />
        <MuscleAtlas worked={worked} view="back" color={color} colorFor={colorFor} interactive={interactive} onPick={onPick} className="flex-1" />
      </div>
    )
  }

  const paths = MUSCLE_PATHS.filter((p) => p.view === view)
  const details = DETAIL_SHAPES.filter((p) => p.view === view)
  const fleshId = `atlas-flesh-${uid}`
  const bellyId = `atlas-belly-${uid}`
  const workedId = `atlas-worked-${uid}`

  /**
   * One `worked` gradient per DISTINCT hue on this view, not one per muscle.
   *
   * A `<linearGradient>` per path would put thirty defs into a 24px thumbnail
   * for no visible gain; a single-accent figure — which is still every caller
   * but the weekly breakdown — emits exactly the one gradient it always did.
   * The default `color` is seeded first so it keeps the stable `workedId`.
   */
  const hueOf = (m: LandmarkMuscle) => colorFor?.(m) || color
  const hues = new Map<string, string>([[color, workedId]])
  for (const p of paths) {
    const hue = hueOf(p.muscle)
    if (!hues.has(hue)) hues.set(hue, `atlas-worked-${hues.size}-${uid}`)
  }

  return (
    <svg
      viewBox={`0 0 ${ATLAS_VIEWBOX.width} ${ATLAS_VIEWBOX.height}`}
      className={`w-full h-full ${className}`}
      role="group"
      aria-label={label ?? `Muscle map, ${view} view`}
    >
      <defs>
        {/* 145°: light from the upper left, shadow falling to the lower right.
            One direction for every gradient here — two light sources on one
            figure is the thing that makes a render look wrong without anyone
            being able to say why.

            `white` and `black` by name, not by hex. They are light and shade,
            not colours: neither is a palette value, and spelling them as hex
            would put two permanent orphans into `palette-discipline`'s ledger
            for something that has no business being a brand token. */}
        <linearGradient id={fleshId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.14" />
          <stop offset="45%" stopColor="white" stopOpacity="0.075" />
          <stop offset="100%" stopColor="black" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={bellyId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.20" />
          <stop offset="50%" stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="black" stopOpacity="0.10" />
        </linearGradient>
        {[...hues].map(([hue, id]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="1" />
            <stop offset="55%" stopColor={hue} stopOpacity="0.82" />
            <stop offset="100%" stopColor={hue} stopOpacity="0.55" />
          </linearGradient>
        ))}
      </defs>

      {/* ── Layer 1: the body ──
          Head, hair, neck, torso, arms, fists, legs, feet. Anatomy, not data,
          and never tinted. */}
      <g aria-hidden="true" stroke="rgba(255,255,255,0.13)" strokeWidth="0.7"
        strokeLinejoin="round" fill={`url(#${fleshId})`}>
        {BASE_SHAPES.map((d, i) => <path key={i} d={d} />)}
      </g>

      {/* ── Layer 2: the muscles ── */}
      {paths.map((p, i) => {
        const intensity = Math.max(0, Math.min(1, worked?.[p.muscle] ?? 0))
        const on = intensity > 0
        // Alpha over the gradient, not a colour ramp: one hue at several
        // strengths reads as "more of the same thing", where a green→red ramp
        // would read as a verdict — and this figure makes no verdicts.
        const hue = hueOf(p.muscle)
        const common = {
          d: p.d,
          style: {
            fill: on ? `url(#${hues.get(hue) ?? workedId})` : `url(#${bellyId})`,
            // Alpha carries the volume: a muscle that got one set out of twelve
            // is visibly lighter than the one that got twelve. The floor is 0.22
            // rather than 0.30 and the range runs to 0.94, because the old band
            // was narrow enough that a light session and a heavy one looked
            // nearly the same.
            fillOpacity: on ? 0.22 + intensity * 0.72 : 1,
            stroke: on ? hue : 'rgba(255,255,255,0.14)',
            strokeWidth: on ? 1 : 0.6,
            strokeLinejoin: 'round' as const,
            transition: 'fill-opacity 220ms ease, stroke 220ms ease',
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

      {/* ── Layer 3: definition ──
          Stroked, never filled — several of these are open paths, and a filled
          open path is a wedge rather than a line. `pointer-events: none` so a
          hairline over the quad can never eat the quad's own tap. */}
      <g aria-hidden="true" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.55"
        strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
        {details.map((p, i) => <path key={i} d={p.d} />)}
      </g>
    </svg>
  )
})
