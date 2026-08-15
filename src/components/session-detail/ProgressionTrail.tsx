'use client'

import { useId, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useSessionIntel, type IntelMetric } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
// Imported under their real names. EMBER/EMERALD/OXIDE were aliased on import
// to VIOLET/TEAL/ROSE — three colour names the design system does not contain
// and none of which describes the value being renamed.
import { GOLD, EMBER, EMERALD, OXIDE, MUTED } from '@/lib/theme/palette'

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Format any number in a metric's unit — volume converts to tonnes, rest raw. */
function fmtMetric(m: IntelMetric, n: number | null): string {
  if (n == null) return '—'
  if (m.key === 'volume') return `${((displayWeight(n) ?? 0) / 1000).toFixed(1)}t`
  return `${Math.round(n).toLocaleString()}${m.unit ? ` ${m.unit}` : ''}`
}

/** Percentage delta badge vs the previous same-type session (arrow + %). */
function metricBadge(m: IntelMetric): { text: string; color: string; arrow: string } | null {
  if (m.previous == null) return null          // first of type → "new", no badge
  if (m.delta == null || m.delta === 0 || m.previous === 0) return { text: '0%', color: MUTED, arrow: '' }
  const pct = Math.round((m.delta / Math.abs(m.previous)) * 100)
  const good = m.higherIsBetter ? m.delta > 0 : m.delta < 0
  // Average HR has no good direction — context for the volume, not a grade.
  const color = m.key === 'avgBpm' ? MUTED : good ? EMERALD : OXIDE
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, color, arrow: m.delta > 0 ? '▲' : '▼' }
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

  if (isLoading) return <div className="h-24 rounded-xl bg-white/[0.03] animate-pulse" aria-hidden="true" />
  if (!intel) return null

  const maxVol = Math.max(...(intel.volumes.map((v) => v.volumeKg) ?? [1]), 1)

  return (
    /* NO CARD OF ITS OWN. The page composes three bands and this is the middle
       one's first block; a rounded bordered panel here would put a frame inside
       a frame, which is what made the report feel like a stack of certificates. */
    <div className="space-y-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-1.5" style={{ color: EMBER }}>
          <TrendingUp className="w-3 h-3" aria-hidden="true" /> Progression
        </span>
        {intel.previousDate && (
          <span className="text-[10px] text-muted ml-auto">
            vs <span className="text-text/80 font-medium">{intel.typeLabel}</span> · {shortDate(intel.previousDate)}
          </span>
        )}
      </div>

      {intel.isFirstOfType ? (
        <p className="text-fluid-xs text-muted">
          First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      ) : (
        /* ── ONE ROW, NOT NINE TILES ──
           Each metric used to own a bordered tile carrying a label, a value,
           two stacked comparison bars and a "last …" caption — a 3x3 grid of
           boxes roughly 220px tall to compare six numbers to six numbers. The
           two bars said the same thing as the percentage above them, twice, in
           a form that cannot be read precisely.

           A scrolling strip of value + delta chip says it once. The direction
           is the arrow, the size is the percentage, and the previous figure
           moves to the title where it is available on demand rather than
           occupying a line per metric. */
        <div className="flex items-baseline gap-3.5 overflow-x-auto no-scrollbar">
          {intel.metrics.map((m) => {
            const b = metricBadge(m)
            return (
              <span key={m.key} className="inline-flex flex-col gap-0.5 shrink-0"
                title={m.previous != null ? `last ${fmtMetric(m, m.previous)}` : 'First of this type'}>
                <span className="inline-flex items-baseline gap-1">
                  <span className="helix-num text-fluid-sm font-bold text-text tabular-nums leading-none">
                    {fmtMetric(m, m.value)}
                  </span>
                  {b
                    ? <span className="helix-num text-[9px] font-bold leading-none" style={{ color: b.color }}>{b.arrow}{b.text}</span>
                    : <span className="text-[9px] font-bold leading-none" style={{ color: GOLD }}>new</span>}
                </span>
                <span className="text-[9px] uppercase tracking-wide leading-none text-muted">{m.label}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* The gold PR list moved to SessionHighlights at the top of the report.
          Two gold panels, one under the hero and one inside Progression, were
          the same records rendered twice. */}

      {!intel.isFirstOfType && intel.volumes.length >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            Volume · last {intel.volumes.length} {intel.typeLabel || 'session'}s · tap a point
          </p>
          <VolumeCurve points={intel.volumes} max={maxVol} unit={unit} />
        </div>
      )}
    </div>
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
  // Scoped — an SVG id is document-global, so a hardcoded one collides with any
  // second instance on the page.
  const volTrail = `volTrail-${useId().replace(/:/g, '')}`
  // 40 tall, not 68. This is a direction-of-travel lane under a metric row, not
  // the section's centrepiece — the exact figures are in the caption beneath it.
  const W = 300, H = 40, PAD_X = 6, PAD_TOP = 6, PAD_BOTTOM = 8
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
          <linearGradient id={volTrail} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EMBER} stopOpacity="0.30" />
            <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={"url(#" + volTrail + ")"} />
        <path d={line} fill="none" stroke={EMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const isSelected = i === selected
          const isLatest = i === n
          return (
            <g key={p.date}>
              <circle cx={x(i)} cy={y(p.volumeKg)} r={isSelected ? 4.5 : isLatest ? 3.5 : 2.5}
                fill={isSelected || isLatest ? EMBER : 'rgba(255,255,255,0.35)'}
                style={isSelected ? { filter: `drop-shadow(0 0 6px ${EMBER})` } : undefined} />
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
            <span className="font-bold ml-1" style={{ color: changePct > 0 ? EMERALD : OXIDE }}>
              {changePct > 0 ? '+' : ''}{changePct}%
            </span>
          )}
          {selected === n && <span className="text-muted"> · this session</span>}
        </span>
      </div>
    </div>
  )
}
