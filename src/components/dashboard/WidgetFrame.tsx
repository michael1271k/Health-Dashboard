'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { WidgetSize } from '@/lib/dashboard/layout'

/**
 * The chrome every dashboard widget wears, and nothing else.
 *
 * ── WHY THE SHELL AND THE BODY SPLIT ─────────────────────────────────────────
 * `DashboardWidget` was one generic component taking `value / status / series /
 * detail`, so thirteen domains were forced through one anatomy: icon, label, big
 * number, sparkline. Vitals has four readings and got to show one. Fuel has five
 * ratios and got to show one. That is the whole of "the widgets look superficial
 * and empty" — not a styling problem, a modelling one. A shell that can only
 * express `one number` will make every domain look like every other domain no
 * matter how it is painted.
 *
 * So the frame owns what is genuinely universal — the gradient, the border, the
 * icon, the label, the tap target, the height — and each domain owns its own
 * body and decides what its three sizes mean. Adding a widget is now writing a
 * body, not widening a props interface until it fits everybody.
 *
 * ── THE GRADIENT IS ONE RECIPE, NOT THIRTEEN TREATMENTS ──────────────────────
 * Same two layers the live-session pill wears: a radial bloom anchored at the
 * top-left, where the icon and label are and where the eye lands, and a broad
 * diagonal wash that keeps a trace of the hue all the way across. Thirteen
 * bespoke gradients would be thirteen things to keep in sync and would stop the
 * grid reading as one surface; one recipe with thirteen hues is a house style.
 *
 * Both are painted as an inert layer UNDER the content rather than as the
 * element's own `background`, so `overflow-hidden` clips them to the radius and
 * neither can wash out the numbers on top.
 */
export const WidgetFrame = memo(function WidgetFrame({
  icon: Icon, label, accent, size, onOpen, action, children,
}: {
  icon: LucideIcon
  label: string
  /** Hex. The domain's own colour, from `palette.ts`. */
  accent: string
  size: WidgetSize
  onOpen?: () => void
  /** A control in the header's right slot — large sizes only, at the body's discretion. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      /**
       * A div with a click handler rather than a `<button>`: a widget body can
       * carry its own controls (Cardio's one-tap repeat, for one), and a button
       * inside a button is invalid HTML that Safari resolves by dropping the
       * inner one — which would silently make the quick-log unreachable.
       */
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      } : undefined}
      aria-label={onOpen ? `Open ${label}` : undefined}
      className="relative h-full min-w-0 overflow-hidden rounded-2xl border px-2.5 pt-2 pb-2.5
                 flex flex-col gap-1.5 text-left active:opacity-80 transition-opacity"
      style={{ borderColor: `${accent}2e`, backgroundColor: 'rgba(255,255,255,0.025)' }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            `radial-gradient(120% 120% at 0% 0%, ${accent}2b 0%, ${accent}0f 42%, transparent 74%),`
            + `linear-gradient(140deg, ${accent}14 0%, ${accent}08 52%, rgba(255,255,255,0.02) 100%)`,
        }}
      />
      {/* The light catching the top edge of the material. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}59, transparent)` }}
      />

      {/* ── THE HEADER IS 18px TALL, NOT 24 ──
          On an 82px tile the header is 30% of the height, and every pixel it
          takes is a pixel the number cannot have. The icon tile shrinks to the
          cap-height of the label beside it, which also stops it reading as a
          button. */}
      <span className="relative flex items-center gap-1.5 min-w-0 h-[18px]">
        <span
          className="flex h-[18px] w-[18px] items-center justify-center rounded-md shrink-0"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <Icon className="w-3 h-3" aria-hidden="true" />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted truncate">
          {label}
        </span>
        {size !== 's' && action && <span className="ml-auto shrink-0">{action}</span>}
      </span>

      {/* `min-h-0` so a body that scrolls or truncates does so inside the tile
          rather than pushing the frame past its grid row. */}
      <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  )
})

/**
 * A widget with nothing to show yet.
 *
 * ── IT KEEPS ITS SHAPE, AND IT DOES NOT LOOK DEAD ────────────────────────────
 * Hiding an empty widget would move every tile beneath it, which costs exactly
 * the muscle memory the fixed grid exists to build — the tile you reach for at
 * 7am would be somewhere else at 7am and somewhere else again at noon.
 *
 * But a flat grey rectangle is most of the screen first thing in the morning,
 * and it reads as broken rather than as early. So the placeholder holds the
 * tile's own accent at low opacity, breathes on a 4.5s travel (see
 * `.helix-shimmer` — deliberately slower than a spinner, which would promise
 * that something is loading when nothing is), and says what it is waiting for
 * in the app's own voice.
 */
export function WidgetEmpty({ accent, message, hint, size = 'm' }: {
  accent: string
  /** What the tile is waiting for, in one short phrase. */
  message: string
  hint?: string
  /** The hint is dropped at small — a 1×1 tile has room for one sentence. */
  size?: WidgetSize
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 text-center px-1 overflow-hidden">
      <span
        className="helix-shimmer w-full max-w-[64px] h-1 rounded-full"
        style={{ backgroundColor: `${accent}26` }}
        aria-hidden="true"
      />
      <span className={`leading-tight text-muted mt-1 ${size === 's' ? 'text-[10px]' : 'text-[11px]'}`}>
        {message}
      </span>
      {hint && size !== 's' && <span className="text-[9px] leading-tight text-muted/60">{hint}</span>}
    </div>
  )
}
