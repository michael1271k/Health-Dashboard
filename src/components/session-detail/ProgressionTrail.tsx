'use client'

import { useState } from 'react'
import { Star, TrendingUp } from 'lucide-react'
import { useSessionIntel, type IntelMetric } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { GOLD, EMBER as VIOLET, EMERALD as TEAL, OXIDE as ROSE, MUTED } from '@/lib/theme/palette'

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Compact number for a metric cell — volume converts, everything else is raw. */
function metricValue(m: IntelMetric): string {
  if (m.value == null) return '—'
  if (m.key === 'volume') return `${((displayWeight(m.value) ?? 0) / 1000).toFixed(1)}t`
  return `${Math.round(m.value).toLocaleString()}${m.unit ? ` ${m.unit}` : ''}`
}

function metricDelta(m: IntelMetric): { text: string; color: string } | null {
  if (m.delta == null || m.delta === 0) return null
  const good = m.higherIsBetter ? m.delta > 0 : m.delta < 0
  const sign = m.delta > 0 ? '+' : ''
  const shown = m.key === 'volume'
    ? `${sign}${((displayWeight(m.delta) ?? 0) / 1000).toFixed(1)}t`
    : `${sign}${Math.round(m.delta).toLocaleString()}`
  // Average HR has no good direction — it's context for the volume, not a grade.
  const color = m.key === 'avgBpm' ? MUTED : good ? TEAL : ROSE
  return { text: shown, color }
}

/**
 * Historical comparison for the session — every headline metric against the
 * previous session of the SAME type, a gold PR spotlight, and the volume
 * trajectory across recent sessions of this type.
 *
 * The comparison used to be one run-on line ("vs last legs & core b posterior
 * focus · volume +3% · sets ="), which crammed the session-type name, two
 * metrics and a bare "=" into a single wrapping sentence. It's a grid now, and
 * it carries time, calories, average HR and PRs alongside volume and sets.
 */
export function ProgressionTrail({ sessionId }: { sessionId: string }) {
  const { data: intel, isLoading } = useSessionIntel(sessionId)
  const unit = useUnitSystem()

  if (isLoading) return <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
  if (!intel) return null

  const maxVol = Math.max(...(intel.volumes.map((v) => v.volumeKg) ?? [1]), 1)

  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${VIOLET}28` }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: VIOLET }} aria-hidden="true" /> Progression
        </h2>
        {intel.previousDate && (
          <span className="text-[10px] text-muted">
            vs <span className="text-text/80 font-medium">{intel.typeLabel}</span> · {shortDate(intel.previousDate)}
          </span>
        )}
      </div>

      {intel.isFirstOfType ? (
        <p className="text-fluid-xs text-muted">
          First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {intel.metrics.map((m) => {
            const d = metricDelta(m)
            return (
              <div key={m.key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <span className="block text-[9px] uppercase tracking-wide text-muted leading-none">{m.label}</span>
                <span className="helix-num block text-fluid-sm font-bold text-text mt-1 leading-tight truncate">
                  {metricValue(m)}
                </span>
                <span className="helix-num block text-[9px] font-bold mt-0.5 leading-none"
                  style={{ color: d?.color ?? MUTED }}>
                  {d ? d.text : m.previous == null ? 'new' : 'no change'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!!intel.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1"
          style={{ borderColor: `${GOLD}55`, background: `${GOLD}12`, boxShadow: `0 0 18px ${GOLD}22` }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD, filter: `drop-shadow(0 0 4px ${GOLD})` }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: GOLD }}>
                {displayWeight(pr.kg)}{unit} × {pr.reps}
              </span>
            </div>
          ))}
        </div>
      )}

      {!intel.isFirstOfType && intel.volumes.length >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
            Volume across the last {intel.volumes.length} {intel.typeLabel || 'session'}s · tap a point
          </p>
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
 *
 * Every point is TAPPABLE: `<title>` alone is a desktop hover affordance that
 * does nothing on a phone, which is where this is actually read.
 */
function VolumeCurve({ points, max, unit }: {
  points: Array<{ date: string; volumeKg: number }>
  max: number
  unit: string
}) {
  const n = points.length - 1
  const [selected, setSelected] = useState<number>(n)
  const W = 300, H = 68, PAD_X = 6, PAD_TOP = 8, PAD_BOTTOM = 10
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

  const active = points[selected] ?? points[n]
  const exact = Math.round(displayWeight(active.volumeKg) ?? 0).toLocaleString()
  const prev = selected > 0 ? points[selected - 1] : null
  const changePct = prev && prev.volumeKg > 0
    ? Math.round(((active.volumeKg - prev.volumeKg) / prev.volumeKg) * 100)
    : null

  return (
    <div>
      {/* Uniform scaling (default preserveAspectRatio) — stretching the viewBox
          would turn the session dots into ellipses. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible"
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
          const isSelected = i === selected
          const isLatest = i === n
          return (
            <g key={p.date}>
              <circle cx={x(i)} cy={y(p.volumeKg)} r={isSelected ? 4.5 : isLatest ? 3.5 : 2.5}
                fill={isSelected || isLatest ? VIOLET : 'rgba(255,255,255,0.35)'}
                style={isSelected ? { filter: `drop-shadow(0 0 6px ${VIOLET})` } : undefined} />
              {/* A generous invisible hit target — a 4px dot is untappable on
                  a touch screen. */}
              <circle cx={x(i)} cy={y(p.volumeKg)} r="14" fill="transparent"
                className="cursor-pointer" role="button" tabIndex={0}
                aria-label={`${p.date}: ${Math.round(displayWeight(p.volumeKg) ?? 0)} ${unit}`}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i) } }} />
            </g>
          )
        })}
      </svg>
      <div className="flex items-baseline justify-between gap-2 text-[10px] mt-0.5">
        <span className="text-muted helix-num">{shortDate(points[0].date)}</span>
        <span className="helix-num text-right">
          <span className="font-bold text-text">{exact}{unit}</span>
          <span className="text-muted"> · {shortDate(active.date)}</span>
          {changePct != null && changePct !== 0 && (
            <span className="font-bold ml-1" style={{ color: changePct > 0 ? TEAL : ROSE }}>
              {changePct > 0 ? '+' : ''}{changePct}%
            </span>
          )}
          {selected === n && <span className="text-muted"> · this session</span>}
        </span>
      </div>
    </div>
  )
}
