'use client'

import { useId, useMemo } from 'react'
import { Droplets } from 'lucide-react'

const SAPPHIRE = '#3D7AB8'
const AQUA = '#5FB8E8'

// Geometry — a compact, WIDE double-helix (shorter + thicker than the old skinny
// column). Wider amplitude, fewer turns, a near-square viewport it winds down.
const CX = 60, AMP = 42, TURNS = 2.25, SAMPLES = 64
const Y_TOP = 16, Y_BOT = 116, SPAN = Y_BOT - Y_TOP

interface Node { y: number; xa: number; xb: number }

/** Sample the two counter-rotating strands once (deterministic, memoised). */
function buildHelix(): { nodes: Node[]; strandA: string; strandB: string } {
  const nodes: Node[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const f = i / SAMPLES
    const t = f * TURNS * Math.PI * 2
    nodes.push({ y: Y_TOP + f * SPAN, xa: CX + AMP * Math.sin(t), xb: CX - AMP * Math.sin(t) })
  }
  const line = (pick: (n: Node) => number) =>
    nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${pick(n).toFixed(2)} ${n.y.toFixed(2)}`).join(' ')
  return { nodes, strandA: line((n) => n.xa), strandB: line((n) => n.xb) }
}

/**
 * Hydration as a glowing 2D DNA double-helix — the Nexus water gauge, echoed in
 * Nutrition. Two counter-rotating strands with base-pair rungs; intake fills the
 * strands bottom-up (a bright, glowing overlay revealed by a clip-path inset that
 * transitions with the fill). GPU-cheap, theme-agnostic, and static under
 * reduce-motion (only a clip-path state change animates — no infinite loop).
 */
export function WaterHelix({ ml, goalMl }: { ml: number | null; goalMl: number }) {
  const uid = useId().replace(/[:]/g, '')
  const glow = `wh-glow-${uid}`
  const { nodes, strandA, strandB } = useMemo(buildHelix, [])
  const have = ml ?? 0
  const pct = Math.max(0, Math.min(1, goalMl > 0 ? have / goalMl : 0))

  // Base-pair rungs every few samples (skip near the crossings where they'd be a dot).
  const rungs = nodes.filter((_, i) => i % 4 === 2 && Math.abs(nodes[i].xa - nodes[i].xb) > 6)

  const Helix = ({ bright }: { bright: boolean }) => (
    <g
      fill="none"
      strokeLinecap="round"
      style={bright ? { filter: `url(#${glow})` } : undefined}
    >
      {rungs.map((n, i) => (
        <line key={i} x1={n.xa} y1={n.y} x2={n.xb} y2={n.y}
          stroke={bright ? AQUA : SAPPHIRE} strokeWidth={bright ? 2 : 1.5}
          strokeOpacity={bright ? 0.75 : 0.18} />
      ))}
      <path d={strandA} stroke={bright ? AQUA : SAPPHIRE} strokeWidth={bright ? 3.2 : 2.4} strokeOpacity={bright ? 0.95 : 0.22} />
      <path d={strandB} stroke={SAPPHIRE} strokeWidth={bright ? 3.2 : 2.4} strokeOpacity={bright ? 0.9 : 0.22} />
      {/* Base-pair nodes on the bright layer only — the "living" glow points. */}
      {bright && nodes.filter((_, i) => i % 4 === 0).map((n, i) => (
        <circle key={i} cx={n.xa} cy={n.y} r={2} fill={AQUA} fillOpacity={0.9} />
      ))}
    </g>
  )

  return (
    <section className="helix-card space-y-2 min-h-[120px]" style={{ borderColor: `${SAPPHIRE}30` }}>
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5" style={{ color: SAPPHIRE }} aria-hidden="true" />
        <span className="font-heading font-semibold text-fluid-sm text-text">Hydration</span>
        <span className="ml-auto text-[10px] font-bold" style={{ color: SAPPHIRE }}>{Math.round(pct * 100)}%</span>
      </div>

      <div className="flex items-center gap-3">
        {/* The double-helix — centred in its own space; numbers sit to the side */}
        <div className="flex-1 flex justify-center min-w-0">
          <svg viewBox="0 0 120 132" width="132" height="116" aria-hidden="true" className="max-w-full">
            <defs>
              <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.8" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

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
          <span className="text-[10px] text-muted">Dietary water · today</span>
        </div>
      </div>
    </section>
  )
}
