'use client'

import { useId, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts'
import { ChartScrubber, SmartLegend, useScrub, lastValues, SCRUB_TOUCH } from './SmartLegend'
import type { BodyTrendRow, BodyDetailRow } from '@/lib/hooks/useCharts'
import { mergeBodyComposition, type BodyCompositionPoint } from '@/lib/body/readings'
export { mergeBodyComposition, type BodyCompositionPoint }
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { HELIX_CUT_START } from '@/lib/programs'
import { niceDomain } from '@/lib/charts/scale'
import { BODY, MUTED, OXIDE } from '@/lib/theme/palette'

/**
 * From the shared BODY map — one hue per substance.
 *
 * This object used to hold eight hand-typed hexes with TWO collisions:
 * `lean` and `musclePct` were both #3E9E7A, and `fatMass` and `fatPct` were
 * both #D4AF37. So Lean Mass and Muscle %, which appear on the same chart,
 * were the same green — the one distinction the colour exists to make.
 *
 * Mass and percent of the same substance still share a hue on purpose: they
 * are one substance measured two ways, and they never appear in the same
 * family. Muscle is GARNET now, which is what breaks the tie with lean.
 */
const COLORS = {
  weight: BODY.weight,
  lean: BODY.lean,
  fatMass: BODY.fat,
  fatPct: BODY.fat,
  water: BODY.water,
  musclePct: BODY.muscle,
  visceral: OXIDE,   // the one metric where high is bad — see visceralColor()
  grid: 'rgba(255,255,255,0.06)',
  text: MUTED,
}

/**
 * The three families of body-composition metric, split by the SCALE they live on.
 *
 * This is the whole reason for the toggle. Weight (~68 kg), body-fat percent
 * (~18) and the visceral rating (~7) cannot share a y-axis without two of them
 * flattening into the floor. Two charts side by side, both titled "Body
 * Composition", was the previous answer; grouping by scale is the better one.
 */
type Family = 'mass' | 'percent' | 'visceral'

const FAMILY_META: Record<Family, { label: string; unit: string }> = {
  mass:     { label: 'Mass',        unit: '' },       // filled in with the user's unit
  percent:  { label: 'Composition', unit: '%' },
  visceral: { label: 'Visceral',    unit: '' },
}

/** Which series the legend lists, per family. Mirrors the <Line>/<Area> set below. */
const FAMILY_SERIES: Record<Family, Array<{ key: string; name: string; color: string }>> = {
  mass: [
    { key: 'weight', name: 'Weight', color: COLORS.weight },
    { key: 'fatFreeMass', name: 'Fat-Free', color: COLORS.lean },
    { key: 'muscleMass', name: 'Muscle', color: COLORS.musclePct },
    { key: 'fatMass', name: 'Fat', color: COLORS.fatMass },
  ],
  percent: [
    { key: 'fatPct', name: 'Fat %', color: COLORS.fatPct },
    { key: 'musclePct', name: 'Muscle %', color: COLORS.musclePct },
    { key: 'water', name: 'Water %', color: COLORS.water },
  ],
  visceral: [
    { key: 'visceral', name: 'Visceral', color: COLORS.visceral },
  ],
}

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`))

/**
 * ONE body-composition chart, with the metric families toggled rather than
 * duplicated across two cards. Reads the DB as-is — no smoothing, no imputation.
 */
export function BodyCompositionChart({ trend, detail, isLoading, showEraBoundary = false }: {
  trend: BodyTrendRow[]
  detail: BodyDetailRow[]
  isLoading?: boolean
  showEraBoundary?: boolean
}) {
  const unit = useUnitSystem()
  // Scoped — an SVG id is document-global, so a hardcoded one collides with any
  // second instance on the page.
  const bodyFill = `bodyFill-${useId().replace(/:/g, '')}`
  const scrub = useScrub()
  const [family, setFamily] = useState<Family>('mass')
  // The isolated series, by dataKey. null = show them all.
  const [focus, setFocus] = useState<string | null>(null)
  /** Non-focused curves fade back rather than disappear — the shape still reads. */
  const dim = (key: string) => (focus && focus !== key ? 0.16 : 1)

  const points = useMemo(
    () => mergeBodyComposition(trend, detail, displayWeight),
    [trend, detail],
  )
  const chartData = useMemo(
    () => points.map((p) => ({ ...p, label: fmtDate(p.date) })),
    [points],
  )

  // Which families actually have data — never offer an empty toggle.
  const available = useMemo(() => {
    const has = (pick: (p: BodyCompositionPoint) => number | null) => points.some((p) => pick(p) != null)
    const out: Family[] = []
    if (has((p) => p.weight) || has((p) => p.muscleMass) || has((p) => p.fatFreeMass)) out.push('mass')
    if (has((p) => p.fatPct) || has((p) => p.water) || has((p) => p.musclePct)) out.push('percent')
    if (has((p) => p.visceral)) out.push('visceral')
    return out
  }, [points])

  const active = available.includes(family) ? family : available[0]

  const domain = useMemo((): [number, number] => {
    if (active === 'mass') {
      return niceDomain(chartData.flatMap((p) => [p.weight, p.muscleMass, p.fatFreeMass, p.fatMass]), { padPct: 0.08, hardMin: 0 })
    }
    if (active === 'percent') {
      return niceDomain(chartData.flatMap((p) => [p.fatPct, p.water, p.musclePct]), { padPct: 0.15, hardMin: 0 })
    }
    return niceDomain(chartData.map((p) => p.visceral), { padPct: 0.2, hardMin: 0 })
  }, [chartData, active])

  // Headline delta for the active family's primary series.
  const headline = useMemo(() => {
    const key = active === 'mass' ? 'weight' : active === 'percent' ? 'fatPct' : 'visceral'
    const vals = points.map((p) => p[key as keyof BodyCompositionPoint] as number | null)
      .filter((v): v is number => v != null)
    if (vals.length < 2) return null
    const delta = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10
    const suffix = active === 'mass' ? unit : active === 'percent' ? '%' : ''
    return { first: vals[0], last: vals[vals.length - 1], delta, suffix }
  }, [points, active, unit])

  // Era boundary: only meaningful when the range spans both sides of it.
  const boundary = showEraBoundary && points.some((p) => p.date < HELIX_CUT_START)
    ? points.find((p) => p.date >= HELIX_CUT_START)
    : undefined

  if (isLoading) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }
  if (!available.length) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
        <p className="text-muted text-sm text-center px-6">No body-composition readings in this range — log an InBody entry to build the trend.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Body Composition</h3>
        <div className="flex gap-1">
          {available.map((f) => {
            const on = active === f
            return (
              // Switching family drops the focus: a key from the old family
              // matches nothing in the new one, which would blank the tooltip.
              <button key={f} onClick={() => { setFamily(f); setFocus(null) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border"
                style={on
                  ? { color: COLORS.weight, borderColor: `${COLORS.weight}55`, background: `${COLORS.weight}1f` }
                  : { color: COLORS.text, borderColor: 'transparent' }}>
                {FAMILY_META[f].label}
              </button>
            )
          })}
        </div>
      </div>

      {headline && (
        <p className="text-fluid-xs text-muted mb-2">
          <span className="helix-num text-text">{headline.first}</span> →{' '}
          <span className="helix-num text-text">{headline.last}</span>{headline.suffix}
          <span className={`helix-num ml-1.5 ${headline.delta <= 0 ? 'text-success' : 'text-warn'}`}>
            {headline.delta > 0 ? '+' : ''}{headline.delta}{headline.suffix}
          </span>
        </p>
      )}

      {/* The affordance for the legend-tap. Hidden until it matters, and its own
          escape hatch — a focused chart with no way back out is a trap. */}
      {focus && (
        <button
          type="button"
          onClick={() => setFocus(null)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted min-h-[28px]"
        >
          Showing one series · <span className="text-text font-semibold">show all</span>
        </button>
      )}

      <div role="img" aria-label={`Body composition — ${FAMILY_META[active].label}`} style={SCRUB_TOUCH}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={bodyFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.weight} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS.weight} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              minTickGap={24} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              width={38} axisLine={false} tickLine={false} domain={domain} />
            {/* The legend below is the readout now, so the tooltip only reports. */}
            <Tooltip content={<ChartScrubber scrub={scrub} />} />

            {active === 'mass' && (
              <>
                <Area isAnimationActive={false} type="monotone" dataKey="weight" name={`Weight (${unit})`} stroke={COLORS.weight}
                  fill={`url(#${bodyFill})`} strokeWidth={2} dot={false} connectNulls
                  strokeOpacity={dim('weight')} fillOpacity={focus && focus !== 'weight' ? 0.06 : 1} />
                <Line isAnimationActive={false} type="monotone" dataKey="fatFreeMass" name={`Fat-Free (${unit})`} stroke={COLORS.lean}
                  strokeWidth={2} dot={false} connectNulls strokeOpacity={dim('fatFreeMass')} />
                <Line isAnimationActive={false} type="monotone" dataKey="muscleMass" name={`Muscle (${unit})`} stroke={COLORS.musclePct}
                  strokeWidth={2} dot={false} connectNulls strokeOpacity={dim('muscleMass')} />
                <Line isAnimationActive={false} type="monotone" dataKey="fatMass" name={`Fat (${unit})`} stroke={COLORS.fatMass}
                  strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls strokeOpacity={dim('fatMass')} />
              </>
            )}
            {active === 'percent' && (
              <>
                <Line isAnimationActive={false} type="monotone" dataKey="fatPct" name="Fat %" stroke={COLORS.fatPct} strokeWidth={2} dot={false} connectNulls strokeOpacity={dim('fatPct')} />
                <Line isAnimationActive={false} type="monotone" dataKey="musclePct" name="Muscle %" stroke={COLORS.musclePct} strokeWidth={2} dot={false} connectNulls strokeOpacity={dim('musclePct')} />
                <Line isAnimationActive={false} type="monotone" dataKey="water" name="Water %" stroke={COLORS.water} strokeWidth={2} dot={false} connectNulls strokeOpacity={dim('water')} />
              </>
            )}
            {active === 'visceral' && (
              <Line isAnimationActive={false} type="monotone" dataKey="visceral" name="Visceral" stroke={COLORS.visceral}
                strokeWidth={2} dot={{ r: 2, fill: COLORS.visceral }} connectNulls />
            )}

            {boundary && (
              <ReferenceDot x={fmtDate(boundary.date)} y={domain[0]} r={4} fill={COLORS.lean} stroke="none"
                label={{ value: 'Helix', position: 'top', fill: COLORS.text, fontSize: 9 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <SmartLegend
        series={FAMILY_SERIES[active].map((x) => ({ ...x, unit: active === 'mass' ? unit : active === 'percent' ? '%' : '' }))}
        scrub={scrub}
        fallback={lastValues(chartData, FAMILY_SERIES[active].map((x) => x.key))}
        focus={focus}
        onFocus={setFocus}
      />
    </div>
  )
}
