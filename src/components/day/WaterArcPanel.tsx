'use client'

import { Droplets, Pencil } from 'lucide-react'
import { HalfArc } from '@/components/dashboard/widgets/parts'
import { SAPPHIRE, EMERALD } from '@/lib/theme/palette'

/** One glass, in ml — the unit a person actually counts hydration in. */
const GLASS_ML = 250

/**
 * Hydration, at sheet scale, in the shape the rest of the app already uses.
 *
 * ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
 * `WaterHelix`: a glowing 2D DNA double helix, roughly 200px tall, with the
 * intake revealed bottom-up through a clip path. It was the most elaborate
 * drawing in the product and it was drawing the wrong thing — a molecule, for a
 * reading that is one ratio against one target — and it was the ONLY bespoke
 * gauge left. Sleep, water and every other "how much of a daily target" figure
 * in the widget grid is a `HalfArc`; a domain inventing its own shape for a
 * question the system has already answered is how a grid of tiles stops looking
 * like one app.
 *
 * So this is the widget's arc, larger, plus the two things a sheet can say that
 * a 175px tile cannot: how much is left, and how to correct the day.
 *
 * ── WHY THE ARC AND NOT A RING ───────────────────────────────────────────────
 * A full ring has no natural place to put a number without the number becoming
 * the subject; the arc's bowl is exactly that place. It is also the shape that
 * reads correctly when it is NOT full, which is the state hydration is in for
 * most of the day — a ring at 40% reads as a thing that has failed, an arc at
 * 40% reads as a thing in progress.
 */
export function WaterArcPanel({ ml, goalMl, onEdit }: {
  ml: number | null
  goalMl: number
  /** Opens the correction sheet. Without it the panel is a pure readout. */
  onEdit?: () => void
}) {
  const pct = ml != null && goalMl > 0 ? (ml / goalMl) * 100 : null
  const litres = ml != null ? Math.round((ml / 1000) * 10) / 10 : null
  const goalL = Math.round((goalMl / 1000) * 10) / 10
  const full = pct != null && pct >= 100
  const remainingMl = ml != null ? Math.max(0, goalMl - ml) : goalMl
  const glassesLeft = Math.ceil(remainingMl / GLASS_ML)

  return (
    <div className="space-y-3 pb-1">
      <div className="mx-auto w-full max-w-[260px]">
        {/* One segment: hydration has no constituents. The arc takes a list
            because sleep and fuel do, and passing one is how this stays the
            same component rather than a lookalike. */}
        <HalfArc
          pct={pct}
          width={11}
          segments={[{ key: 'water', value: 1, color: full ? EMERALD : SAPPHIRE }]}
        >
          <span className="flex flex-col items-center gap-0.5">
            <span className="helix-num font-bold text-fluid-2xl tabular-nums leading-none"
              style={{ color: full ? EMERALD : SAPPHIRE }}>
              {litres ?? '—'}
              <span className="text-[11px] font-normal text-muted ml-1">/ {goalL} L</span>
            </span>
            <span className="text-[10px] text-muted">
              {ml == null
                ? 'nothing logged yet'
                : full
                  ? 'target cleared'
                  : `${glassesLeft} glass${glassesLeft === 1 ? '' : 'es'} to go`}
            </span>
          </span>
        </HalfArc>
      </div>

      {onEdit && (
        /* A button, not a double-tap on the drawing. The helix hid its
           correction behind a gesture on an illustration, which is a control
           nobody finds and a screen reader cannot describe. */
        <button
          type="button"
          onClick={onEdit}
          className="w-full min-h-[48px] rounded-xl inline-flex items-center justify-center gap-2
                     font-bold text-fluid-sm active:scale-[0.98] transition-transform"
          style={{ color: SAPPHIRE, background: `${SAPPHIRE}1a`, border: `1px solid ${SAPPHIRE}59` }}
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Correct today&apos;s intake
        </button>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted/70">
        <Droplets className="w-3 h-3" aria-hidden="true" />
        Synced from Apple Health unless you have corrected the day by hand.
      </p>
    </div>
  )
}
