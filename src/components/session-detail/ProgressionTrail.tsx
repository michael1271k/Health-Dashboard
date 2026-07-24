'use client'

import { Star, TrendingUp } from 'lucide-react'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { GOLD, EMBER as VIOLET, EMERALD as TEAL, OXIDE as ROSE } from '@/lib/theme/palette'

/**
 * Historical comparison for the session: volume Δ vs the previous SAME-TYPE
 * session, a gold PR spotlight, and a volume trail across the last few sessions
 * of this type. Complements the hero (stat tiles) and the exercise breakdown
 * (per-set detail); degrades to a "baseline set" note on the first of a type.
 */
export function ProgressionTrail({ sessionId }: { sessionId: string }) {
  const { data: intel, isLoading } = useSessionIntel(sessionId)
  const unit = useUnitSystem()

  if (isLoading) return <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
  if (!intel) return null

  const maxVol = Math.max(...(intel.volumes.map((v) => v.volumeKg) ?? [1]), 1)

  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${VIOLET}28` }}>
      <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: VIOLET }} aria-hidden="true" /> Progression
      </h2>

      {intel.volumeDeltaPct != null ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 flex items-center gap-2 text-fluid-xs flex-wrap">
          <span className="text-muted">vs last <span className="text-text font-medium">{intel.typeLabel}</span>:</span>
          <span className="helix-num font-bold" style={{ color: intel.volumeDeltaPct >= 0 ? TEAL : ROSE }}>
            volume {intel.volumeDeltaPct >= 0 ? '+' : ''}{intel.volumeDeltaPct}%
          </span>
          {intel.setsDelta != null && (
            <span className="helix-num text-muted">· sets {intel.setsDelta > 0 ? `+${intel.setsDelta}` : intel.setsDelta === 0 ? '=' : intel.setsDelta}</span>
          )}
        </div>
      ) : intel.isFirstOfType ? (
        <p className="text-fluid-xs text-muted flex items-center gap-1.5">
          <span aria-hidden="true">💪</span> First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      ) : null}

      {!!intel.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1" style={{ borderColor: `${GOLD}55`, background: `${GOLD}12`, boxShadow: `0 0 18px ${GOLD}22` }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD, filter: `drop-shadow(0 0 4px ${GOLD})` }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: GOLD }}>{displayWeight(pr.kg)}{unit} × {pr.reps}</span>
            </div>
          ))}
        </div>
      )}

      {!intel.isFirstOfType && intel.volumes.length >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Volume vs previous {intel.volumes.length - 1} session{intel.volumes.length > 2 ? 's' : ''}</p>
          <VolumeCurve points={intel.volumes} max={maxVol} unit={unit} />
        </div>
      )}
    </section>
  )
}

/**
 * Volume trend as a smooth curve rather than a bar strip.
 *
 * Bars implied that each session is an independent quantity to compare; volume
 * across sessions of one type is a continuous trajectory, so a curve reads the
 * direction of travel at a glance. Hand-rolled SVG (no recharts) because it's a
 * handful of points inside a card — pulling a chart library in here would cost
 * more than it renders.
 */
function VolumeCurve({ points, max, unit }: {
  points: Array<{ date: string; volumeKg: number }>
  max: number
  unit: string
}) {
  const W = 300, H = 68, PAD_X = 6, PAD_TOP = 8, PAD_BOTTOM = 10
  const n = points.length - 1
  const x = (i: number) => PAD_X + (i / n) * (W - PAD_X * 2)
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM)

  // Catmull-Rom → cubic Bézier: the curve passes THROUGH every real point.
  // (A plain quadratic smoothing would round the peaks off, drawing volumes
  // that were never lifted.) Endpoints clamp to themselves so the ends don't
  // overshoot past the first/last session.
  const at = (i: number) => {
    const c = Math.min(n, Math.max(0, i))
    return { x: x(c), y: y(points[c].volumeKg) }
  }
  let line = `M${at(0).x} ${at(0).y}`
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    line += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6},`
      + ` ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6},`
      + ` ${p2.x} ${p2.y}`
  }
  const area = `${line} L${x(n)} ${H - PAD_BOTTOM} L${x(0)} ${H - PAD_BOTTOM} Z`
  const fmt = (kg: number) => `${Math.round((displayWeight(kg) ?? 0) / 100) / 10}k`

  return (
    <div>
      {/* Uniform scaling (default preserveAspectRatio) — stretching the viewBox
          would turn the session dots into ellipses. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full"
        role="img" aria-label={`Volume trend across ${points.length} sessions`}>
        <defs>
          <linearGradient id="volTrail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIOLET} stopOpacity="0.30" />
            <stop offset="100%" stopColor={VIOLET} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#volTrail)" />
        <path d={line} fill="none" stroke={VIOLET} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const isThis = i === n
          return (
            <circle key={p.date} cx={x(i)} cy={y(p.volumeKg)} r={isThis ? 4 : 2.5}
              fill={isThis ? VIOLET : 'rgba(255,255,255,0.35)'}
              style={isThis ? { filter: `drop-shadow(0 0 5px ${VIOLET})` } : undefined}>
              <title>{`${p.date} · ${fmt(p.volumeKg)}${unit}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="flex justify-between text-[8px] text-muted helix-num -mt-1">
        <span>{new Date(points[0].date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span className="font-bold" style={{ color: VIOLET }}>
          {fmt(points[n].volumeKg)}{unit} · {new Date(points[n].date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  )
}
