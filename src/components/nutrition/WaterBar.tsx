'use client'

import { Droplets } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { SAPPHIRE, EMERALD } from '@/lib/theme/palette'

/**
 * Today's hydration, on one line.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * `WaterHelix` — a glowing 2D DNA double-helix, about 200px tall, under its own
 * "Water intake" heading, roughly two thirds of the way down the Nutrition page.
 *
 * The figure is one ratio. A helix is a beautiful way to draw one ratio and it
 * is an expensive one: at 200px it was the largest single element on a page
 * whose subject is macros, it sat below the fold on a phone, and the number it
 * carried is the one on this page you most want BEFORE lunch rather than after
 * scrolling past four other cards. The shape was doing the work of a headline
 * for a footnote.
 *
 * So the quantity moved to where it is useful — docked at the top, above the
 * macro rings — and shrank to what it is: a value, a target, and a bar. The
 * helix still exists on the Nexus day page, where hydration is one of the day's
 * own subjects rather than an aside to nutrition.
 *
 * ── AND THE GESTURE IS A SINGLE TAP NOW ──────────────────────────────────────
 * The helix took a DOUBLE tap to open the override, on the reasoning that it had
 * no single-tap action so the gesture cost nothing. This has one job, so it
 * takes the plain tap: a double-tap on a 44px bar is a gesture nobody discovers,
 * and there is no other action here for it to collide with.
 */
export function WaterBar({ ml, goalMl, onEdit }: {
  ml: number | null
  goalMl: number
  onEdit: () => void
}) {
  const pct = ml != null && goalMl > 0 ? (ml / goalMl) * 100 : 0
  // Clamped for DRAWING only — the litres beside it still say the real number,
  // because a bar that silently pins at full stops distinguishing "hit it" from
  // "drank five litres".
  const drawn = Math.max(0, Math.min(100, pct))
  const met = pct >= 100
  const color = met ? EMERALD : SAPPHIRE

  return (
    <button
      type="button"
      onPointerDown={() => { void tapLight() }}
      onClick={onEdit}
      className="w-full rounded-xl border px-3 py-2 flex items-center gap-2.5 active:scale-[0.99] transition-transform"
      style={{ borderColor: `${color}2e`, background: `${color}0d` }}
      aria-label={ml != null
        ? `Water: ${ml} of ${goalMl} millilitres. Tap to correct.`
        : 'Water: nothing logged yet. Tap to correct.'}
    >
      <span className="w-6 h-6 rounded-lg grid place-items-center shrink-0"
        style={{ background: `${color}1f`, color }}>
        <Droplets className="w-3.5 h-3.5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="helix-num text-[13px] font-bold tabular-nums leading-none" style={{ color }}>
            {ml != null ? (ml / 1000).toFixed(1) : '—'}
            <span className="text-[10px] font-normal text-muted ml-0.5">
              / {(goalMl / 1000).toFixed(1)} L
            </span>
          </span>
          <span className="helix-num text-[10px] tabular-nums text-muted ml-auto shrink-0">
            {ml != null ? `${Math.round(pct)}%` : 'not logged'}
          </span>
        </span>
        <span className="block relative h-1.5 rounded-full overflow-hidden bg-white/[0.07] mt-1.5" aria-hidden="true">
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
            style={{ width: `${drawn}%`, background: color }}
          />
        </span>
      </span>
    </button>
  )
}
