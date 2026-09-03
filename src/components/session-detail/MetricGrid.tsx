'use client'

import type { IntelMetric } from '@/lib/hooks/useSessionIntel'
import { EMERALD, OXIDE } from '@/lib/theme/palette'

/**
 * How HELIX prints a metric. One definition, every screen.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * These three cells were private to `SessionHero`, which is the only place that
 * had solved the problem: a fixed grid of headline numbers that does not scroll
 * at 390px, with each delta attached to the number it modifies rather than
 * floating in a row of its own.
 *
 * Everywhere else that had to show session or body numbers re-invented it —
 * `SessionIntelCard`'s wrapping accent chips, `SessionBlock`'s emoji `MetaChip`
 * strip, the body panel's coloured silhouette. Four vocabularies for one idea,
 * so the same figure looked like a different KIND of fact depending on which
 * screen you met it on.
 *
 * The contract that comes with these cells (stated in full at `SessionHero`):
 * absolutes live ONLY in the grid; deltas live ONLY as the ▲/▼ attached to
 * their number. Nothing downstream repeats an absolute.
 */

import { pctOf } from '@/lib/sessions/detail'
export { pctOf }

/**
 * The ▲6% / ▼4% that qualifies a headline number.
 *
 * ── IT USED TO RIDE ON THE VALUE'S OWN LINE, AND IT COLLIDED ─────────────────
 * This was an inline `<span>` sharing a `text-fluid-xl` line box with the value
 * and its unit, inside a `grid-cols-3` that had no `gap` and cells with no
 * `min-w-0`. A grid item's default `min-width: auto` means a cell does not
 * shrink to its track — so "12,480 kg ▲14%" simply grew past its column and
 * landed on top of the duration beside it. With no `whitespace-nowrap` it could
 * also wrap instead, which broke the `leading-none` alignment across all three
 * cells.
 *
 * A delta is a second statement about a number, not part of it. It belongs on
 * the line below, in the slot `Head` already reserves — which costs nothing,
 * because that slot was being rendered empty on two cells out of three anyway.
 */
export function Delta({ metric }: { metric: IntelMetric | undefined }) {
  const d = pctOf(metric)
  if (!d) return null
  return (
    <span
      className="helix-num font-bold whitespace-nowrap"
      style={{ color: d.good ? EMERALD : OXIDE }}
    >
      {d.pct > 0 ? '▲' : '▼'}{Math.abs(d.pct)}%
    </span>
  )
}

/**
 * One headline cell. Hairline on the left for every cell but the first — the
 * same recipe as the exercise record strip, so every page reads as one system.
 */
export function Head({ label, value, unit, sub, metric, first }: {
  label: string
  value: string | null
  unit?: string
  /** Rendered beside the delta. A node, not a string — the set cell puts
   *  coloured chips here and a sentence would not fit. */
  sub?: React.ReactNode
  metric?: IntelMetric
  first?: boolean
}) {
  return (
    // `min-w-0` is the load-bearing class here — without it a grid item refuses
    // to shrink below its content and overruns the cell beside it.
    <div className={`min-w-0 ${first ? '' : 'pl-3 border-l border-white/[0.07]'}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted leading-tight truncate">
        {label}
      </span>
      <div className="helix-num font-bold text-fluid-xl leading-none mt-1.5 text-text whitespace-nowrap">
        {value ?? '—'}
        {unit && value != null && <span className="text-[10px] text-muted font-normal ml-1">{unit}</span>}
      </div>
      {/* The qualifier line. Reserved whether or not it is filled: a sub-line
          that appears only on some sessions makes the cells different heights.
          It carries the delta FIRST — the delta is the thing this line exists
          for — then whatever else the metric has to add. */}
      <span className="flex items-baseline gap-1.5 text-[9px] text-muted mt-1 leading-tight min-h-[1em] min-w-0">
        {value != null && <Delta metric={metric} />}
        {sub}
      </span>
    </div>
  )
}

/**
 * One context cell. Same anatomy at label size — deliberately not a different
 * component shape, so the eye reads the second row as a quieter version of the
 * first rather than as a different kind of thing.
 */
export function Sub({ label, value, unit, color, estimated }: {
  label: string
  value: string | null
  unit?: string
  color: string
  /** Derived by formula rather than measured — see `sessions/estimates.ts`. */
  estimated?: boolean
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-[0.12em] truncate" style={{ color }}>
        {label}
      </span>
      <div className="helix-num font-bold text-[13px] tabular-nums leading-none mt-1 text-text truncate">
        {value ?? '—'}
        {unit && value != null && <span className="text-[9px] text-muted font-normal ml-0.5">{unit}</span>}
        {/* The value keeps its own colour — an estimate is still your best figure
            and is counted at full weight everywhere. What it must not do is pass
            for a measurement, so the provenance is stated rather than implied. */}
        {estimated && value != null && (
          <span
            className="text-[8px] uppercase tracking-wide text-muted font-normal ml-1"
            title="Calculated by formula — no watch data for this session"
          >
            calc
          </span>
        )}
      </div>
    </div>
  )
}
