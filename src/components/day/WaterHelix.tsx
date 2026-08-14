'use client'

import { useMemo } from 'react'
import { Droplets, Pencil } from 'lucide-react'
import { useDoubleTap } from '@/lib/utils/doubleTap'

// Empty baseline = slate/grey; it fills with blue as intake rises. Filled strands
// are a DEEP blue (darker outer edges) and the inner base-pair rungs a lighter AQUA
// so they pop against the strands.
const SLATE = '#3A4250'
const SLATE_RUNG = '#4A5462'
const DEEP = '#2E6AAE'
const AQUA = '#6CC1EE'
const ACCENT = '#3D7AB8' // header chrome (icon, percent, card border)

// Geometry — a thinner, elegant double-helix that closes into a single loop: both
// strands converge to one vertex at top and bottom (TURNS is a half-integer, so
// sin() = 0 at each end → xa = xb = CX). Narrower amplitude than before.
const CX = 60, AMP = 34, TURNS = 2.5, SAMPLES = 64
const Y_TOP = 14, Y_BOT = 118, SPAN = Y_BOT - Y_TOP

interface Node { y: number; xa: number; xb: number }

/**
 * Sample the two counter-rotating strands once (deterministic, memoised). `closed`
 * traces down strand A and back up strand B as ONE continuous path, so the shape is
 * a true closed loop joined at the top + bottom vertices.
 */
function buildHelix(): { nodes: Node[]; closed: string } {
  const nodes: Node[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const f = i / SAMPLES
    const t = f * TURNS * Math.PI * 2
    nodes.push({ y: Y_TOP + f * SPAN, xa: CX + AMP * Math.sin(t), xb: CX - AMP * Math.sin(t) })
  }
  const down = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.xa.toFixed(2)} ${n.y.toFixed(2)}`).join(' ')
  const up = [...nodes].reverse().map((n) => `L ${n.xb.toFixed(2)} ${n.y.toFixed(2)}`).join(' ')
  return { nodes, closed: `${down} ${up} Z` }
}

/**
 * Hydration as a glowing 2D DNA double-helix — the Nexus water gauge, echoed in
 * Nutrition. Two counter-rotating strands with base-pair rungs; intake fills the
 * strands bottom-up (a bright, glowing overlay revealed by a clip-path inset that
 * transitions with the fill). GPU-cheap, theme-agnostic, and static under
 * reduce-motion (only a clip-path state change animates — no infinite loop).
 *
 * ── DOUBLE-TAP TO CORRECT (opt-in) ───────────────────────────────────────────
 * `onOverride` makes the card editable. Absent, it stays exactly as inert as it
 * was — which is why the dashboard's read-only use needs no change.
 *
 * Double-tap rather than a visible button, matching the macro cards, because the
 * gauge is a READOUT first: hydration arrives from HealthKit and is correct on
 * almost every day, so a permanent Edit control would advertise an action that
 * is nearly always the wrong one. The affordance is a hint, not a button.
 *
 * `useDoubleTap` (not `useSingleOrDoubleTap`) is deliberate: this card has no
 * single-tap action, so nothing needs deferring by 300 ms to disambiguate. Where
 * a single tap DOES exist — the day page's compact water bar, which opens the
 * Hydration sheet — that tap is left alone and this card takes the double-tap
 * inside the sheet instead. Paying a tap delay everywhere to add a second gesture
 * makes the common action worse to reach the rare one.
 */
export function WaterHelix({ ml, goalMl, onOverride }: {
  ml: number | null
  goalMl: number
  onOverride?: () => void
}) {
  const { nodes, closed } = useMemo(buildHelix, [])
  const have = ml ?? 0
  const pct = Math.max(0, Math.min(1, goalMl > 0 ? have / goalMl : 0))
  const onTap = useDoubleTap(() => onOverride?.())

  // Base-pair rungs every few samples (skip near the crossings where they'd be a dot).
  const rungs = nodes.filter((_, i) => i % 4 === 2 && Math.abs(nodes[i].xa - nodes[i].xb) > 6)

  const Helix = ({ bright }: { bright: boolean }) => (
    <g fill="none" strokeLinecap="round">
      {/* Halo — a wide, translucent pass beneath the crisp strand.
          This replaces an feGaussianBlur filter that lived on this same group.
          The group's clip-path transitions for 700ms on every intake change, and
          a filter inside an animating clip is re-rasterised EVERY frame, over a
          region deliberately inflated to 200%. One extra stroke, painted once,
          reads the same at this size. */}
      {bright && (
        <path d={closed} stroke={AQUA} strokeWidth={6} strokeOpacity={0.16} strokeLinejoin="round" />
      )}
      {/* Inner base-pair rungs — lighter aqua when filled so they pop off the strands. */}
      {rungs.map((n, i) => (
        <line key={i} x1={n.xa} y1={n.y} x2={n.xb} y2={n.y}
          stroke={bright ? AQUA : SLATE_RUNG} strokeWidth={bright ? 1.6 : 1.1}
          strokeOpacity={bright ? 0.85 : 0.4} />
      ))}
      {/* Outer strand loop — darker deep-blue edge when filled, slate when empty. */}
      <path d={closed} stroke={bright ? DEEP : SLATE} strokeWidth={bright ? 2.2 : 1.4}
        strokeOpacity={bright ? 0.98 : 0.55} strokeLinejoin="round" />
      {/* Base-pair glow points on the bright layer only. */}
      {bright && nodes.filter((_, i) => i % 4 === 0).map((n, i) => (
        <circle key={i} cx={n.xa} cy={n.y} r={1.7} fill={AQUA} fillOpacity={0.9} />
      ))}
    </g>
  )

  return (
    <section
      className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-2 min-h-[120px] ${
        onOverride ? 'cursor-pointer select-none active:scale-[0.99] transition-transform' : ''
      }`}
      style={{ borderColor: `${ACCENT}30` }}
      onClick={onOverride ? onTap : undefined}
      role={onOverride ? 'button' : undefined}
      tabIndex={onOverride ? 0 : undefined}
      // Keyboard has no double-tap. Enter/Space opens the editor directly —
      // the gesture is a touch shortcut, never the only way in.
      onKeyDown={onOverride ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOverride() } } : undefined}
      aria-label={onOverride ? 'Hydration — double-tap to correct' : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5" style={{ color: ACCENT }} aria-hidden="true" />
        <span className="font-heading font-semibold text-fluid-sm text-text">Hydration</span>
        {onOverride && <Pencil className="w-2.5 h-2.5 opacity-40" style={{ color: ACCENT }} aria-hidden="true" />}
        <span className="ml-auto text-[10px] font-bold" style={{ color: ACCENT }}>{Math.round(pct * 100)}%</span>
      </div>

      <div className="flex items-center gap-3">
        {/* The double-helix — centred in its own space; numbers sit to the side */}
        <div className="flex-1 flex justify-center min-w-0">
          {/*
            The viewBox is 120×132 (taller than wide). The element used to be
            sized `width={132} height={116}` — WIDER than tall — so the two
            aspect ratios disagreed by 29%. On a phone the column is narrow
            enough that `max-w-full` shrank the box back into roughly the right
            shape; on a desktop nothing constrained it, `preserveAspectRatio`
            letterboxed the drawing into the short box, and the strands got
            squeezed against the bottom edge. THE FIX IS TO STOP DECLARING TWO
            SHAPES: one intrinsic size that matches the viewBox, `h-auto` so
            height follows width, and a max-height so a wide desktop card can't
            inflate it into a tower.
          */}
          <svg viewBox="0 0 120 132" width="120" height="132" aria-hidden="true"
            className="w-[120px] max-w-full h-auto max-h-[132px]"
            style={{ aspectRatio: '120 / 132' }}>
            {/* Dim, empty strands — always fully visible */}
            <Helix bright={false} />
            {/* Bright, filled strands — revealed bottom-up by the intake fraction */}
            <g style={{ clipPath: `inset(${((1 - pct) * 100).toFixed(1)}% 0 0 0)`, transition: 'clip-path 700ms cubic-bezier(0.22,1,0.36,1)' }}>
              <Helix bright />
            </g>
          </svg>
        </div>

        {/* Readout — to the side */}
        <div className="flex flex-col items-end shrink-0 text-right">
          <div className="flex items-baseline gap-1">
            <span className="helix-num text-fluid-2xl font-bold text-text">{(have / 1000).toFixed(1)}</span>
            <span className="text-fluid-xs text-muted">/ {(goalMl / 1000).toFixed(1)} L</span>
          </div>
          {/* Was "Dietary water · today" — the day page renders this for a PAST
              date, so the second half was a claim the component cannot make. */}
          <span className="text-[10px] text-muted">
            {onOverride ? 'Double-tap to correct' : 'Dietary water'}
          </span>
        </div>
      </div>
    </section>
  )
}
