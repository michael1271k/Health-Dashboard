'use client'

import { useState } from 'react'
import { ATLAS_VIEWBOX, MUSCLE_PATHS, type AtlasView } from '@/lib/body/atlas'
import { bodyUrl, maskUrl } from '@/lib/body/rasterAtlas'
import { musclesOnView } from '@/lib/body/atlas'
import type { LandmarkMuscle } from '@/lib/training/landmarks'

/**
 * The photo-real body, tinted per muscle.
 *
 * ── THE WHOLE TRICK, IN ONE PARAGRAPH ────────────────────────────────────────
 * Three stacked layers in one `isolate`d box. Bottom: a greyscale body image
 * carrying every bit of the shading. Middle: one absolutely-positioned div per
 * WORKED muscle, filled with the workout's colour, masked to that muscle's
 * shape, and composited with `mix-blend-mode: color` — which keeps the hue and
 * saturation of the tint and the LUMINANCE of the photo underneath, so the
 * muscle comes out coloured and still lit rather than painted over. Top: the
 * vector `MUSCLE_PATHS`, fully transparent, purely to catch taps.
 *
 * ── WHY `isolation: isolate` IS NOT OPTIONAL ─────────────────────────────────
 * `mix-blend-mode` blends against the nearest stacking context. Without the
 * isolate it would blend against whatever the PAGE has behind the figure — the
 * gradient wash, the card, the deck — and the tint would change colour depending
 * on what it happened to be sitting over.
 *
 * ── AND WHY THE FALLBACK IS THE POINT ────────────────────────────────────────
 * These are files that may simply not be there. A body that fails to load must
 * degrade to the vector figure, never to a blank box — so the base image's
 * `onError` flips a switch and the caller renders `MuscleAtlas`'s own SVG
 * instead. That is also what makes shipping this before the art exists safe.
 */
export function RasterAtlas({ view, worked, color, onPick, interactive = false, label, onUnavailable }: {
  view: AtlasView
  /** muscle → 0–1. Missing or 0 is left as the base greyscale. */
  worked?: Partial<Record<LandmarkMuscle, number>>
  /** The workout's colour. */
  color: string
  interactive?: boolean
  onPick?: (muscle: LandmarkMuscle) => void
  label?: string
  /** The body image 404'd — the caller should draw the vector figure instead. */
  onUnavailable: () => void
}) {
  const [ready, setReady] = useState(false)
  const lit = musclesOnView(view).filter((m) => (worked?.[m] ?? 0) > 0)

  return (
    <div
      className="relative w-full h-full"
      // See the note above: without this the tint blends against the page.
      style={{ isolation: 'isolate' }}
      role="group"
      aria-label={label ?? `Muscle map, ${view} view`}
    >
      {/* Layer 1 — the body. `object-contain` so it fits the same box the SVG
          would, at the same aspect ratio, which is what keeps the hit layer
          above in register with it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bodyUrl(view)}
        alt=""
        aria-hidden="true"
        draggable={false}
        onLoad={() => setReady(true)}
        onError={onUnavailable}
        className="absolute inset-0 w-full h-full object-contain select-none"
      />

      {/* Layer 2 — the tint, one masked rectangle per worked muscle.
          Held back until the body has loaded: a tint composited over nothing is
          a solid coloured silhouette, and for one frame on a slow connection
          that is what you would see. */}
      {ready && lit.map((m) => {
        const intensity = Math.max(0, Math.min(1, worked?.[m] ?? 0))
        const url = `url("${maskUrl(view, m)}")`
        return (
          <span
            key={m}
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: color,
              // Alpha carries the volume: a muscle that got one set out of
              // twelve is visibly lighter than the one that got twelve. Floor of
              // 0.35 because the lightest real work still HAPPENED.
              opacity: 0.35 + intensity * 0.6,
              mixBlendMode: 'color',
              WebkitMaskImage: url,
              maskImage: url,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
            }}
          />
        )
      })}

      {/* Layer 3 — the hit targets. The SAME geometry the vector figure draws,
          rendered invisible: a raster has nothing to click, and duplicating the
          shapes as a second set of coordinates is exactly the drift
          `atlas-parity.test.ts` exists to prevent. */}
      {interactive && (
        <svg
          viewBox={`0 0 ${ATLAS_VIEWBOX.width} ${ATLAS_VIEWBOX.height}`}
          className="absolute inset-0 w-full h-full"
          aria-hidden={!interactive}
        >
          {MUSCLE_PATHS.filter((p) => p.view === view).map((p, i) => (
            <path
              key={`${p.muscle}-${i}`}
              d={p.d}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`${p.muscle}${(worked?.[p.muscle] ?? 0) > 0 ? ' — worked' : ''}`}
              aria-pressed={(worked?.[p.muscle] ?? 0) > 0}
              onClick={() => onPick?.(p.muscle)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                onPick?.(p.muscle)
              }}
              className="cursor-pointer outline-none focus-visible:stroke-white focus-visible:stroke-[1.5]"
            />
          ))}
        </svg>
      )}
    </div>
  )
}
