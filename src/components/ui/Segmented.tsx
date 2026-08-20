'use client'

import type { LucideIcon } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { MUTED } from '@/lib/theme/palette'

/**
 * The one segmented control.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * Four hand-rolled ones, none of which agreed about anything. `ChartRange` used
 * `flex gap-1 p-1 rounded-2xl` at 40px, the Pathfinder view switcher
 * `flex rounded-xl overflow-hidden` with shared borders, the DOMS front/back
 * toggle `rounded-lg` at 32px, and the macro metric toggle borderless pills with
 * no track at all. Same gesture, four appearances, three heights — and each new
 * surface was about to add a fifth.
 *
 * ── WHY A TRACK AND A THUMB, NOT FOUR BORDERS ────────────────────────────────
 * A segmented control is one control showing a position, not N buttons that
 * happen to be adjacent. The track is the thing; the active segment is a filled
 * region inside it. Two of the four old ones drew a border per segment, which
 * reads as a row of buttons and loses the "one of these" meaning that makes the
 * pattern worth using.
 *
 * ── FEEDBACK ON PRESS, NOT ON COMMIT ─────────────────────────────────────────
 * `active:scale` and the haptic both fire on pointer-DOWN (Surface does the
 * same). Waiting for the click to acknowledge a tap is the latency that makes an
 * interface feel like a computer.
 *
 * Colour is per-instance: the timeframe control is steel/gold, soreness is
 * ember, a muscle filter is its own group hue. The control does not have an
 * opinion, it takes one.
 */

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Optional leading glyph. Omitted everywhere the label is already short. */
  icon?: LucideIcon
  /** Overrides `accent` for this segment only — the era pill is gold, the month steel. */
  color?: string
  /** Hover/long-press explanation. The era pill carries its anchor date here. */
  title?: string
}

export type SegmentedSize = 'sm' | 'md'

/**
 * Heights are the two that exist, not a scale.
 *
 * `md` (40px) is a primary control the eye goes to — the timeframe. `sm` (32px)
 * is a control that qualifies something already on screen, like front/back on a
 * body map. Both clear the 44px tap target through the track's own padding.
 */
const SIZE: Record<SegmentedSize, { pad: string; text: string; gap: string }> = {
  sm: { pad: 'px-2.5 min-h-[32px]', text: 'text-[10px] uppercase tracking-wide', gap: 'gap-1' },
  md: { pad: 'px-3.5 py-1.5 min-h-[40px]', text: 'text-fluid-xs', gap: 'gap-1.5' },
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent,
  size = 'md',
  label,
  fluid = false,
  className = '',
}: {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Colour of the active segment. Per-option `color` wins over it. */
  accent?: string
  size?: SegmentedSize
  /** Accessible name for the group. Required — a control with no name is a puzzle. */
  label: string
  /**
   * Fill the line and split it evenly between the segments.
   *
   * The default sizes each segment to its own label, which is right when the
   * control qualifies something beside it. It is wrong when the control IS the
   * line — a set's type in the tuner, where the segments are the only thing on
   * that row and ragged widths read as four buttons that happen to be adjacent.
   * `w-fit` and `w-full` are both width utilities, so a caller cannot reliably
   * override this from `className`; it has to be a prop.
   */
  fluid?: boolean
  className?: string
}) {
  const s = SIZE[size]
  return (
    <div
      role="group"
      aria-label={label}
      className={`${fluid ? 'flex w-full' : 'inline-flex w-fit'} gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        const c = o.color ?? accent
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            // Pointer-down, so the press is acknowledged before the release.
            onPointerDown={() => { if (!active) tapLight() }}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            title={o.title}
            className={`inline-flex items-center justify-center ${s.gap} ${s.pad} ${s.text}
                        rounded-xl font-semibold border whitespace-nowrap
                        ${fluid ? 'flex-1 min-w-0' : 'shrink-0'}
                        transition-colors active:scale-[0.97]`}
            style={active && c
              ? { color: c, borderColor: `${c}55`, background: `${c}1f`, boxShadow: `0 0 10px ${c}33` }
              : active
                ? { color: 'var(--color-text)', borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)' }
                : { color: MUTED, borderColor: 'transparent' }}
          >
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
