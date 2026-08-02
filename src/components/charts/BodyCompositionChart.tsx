'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { BodyTrendRow, BodyDetailRow } from '@/lib/hooks/useCharts'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { HELIX_CUT_START } from '@/lib/programs'
import { niceDomain } from '@/lib/charts/scale'

const COLORS = {
  weight: '#8E9AAC',
  lean: '#3E9E7A',
  fatMass: '#D4AF37',
  fatPct: '#D4AF37',
  water: '#3D7AB8',
  musclePct: '#3E9E7A',
  visceral: '#E0703C',
  grid: 'rgba(255,255,255,0.06)',
  text: '#79808C',
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

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`))

export interface BodyCompositionPoint {
  date: string
  weight: number | null
  /** Weight × muscle% — skeletal muscle only. Null when muscle% wasn't measured. */
  muscleMass: number | null
  /** Weight − fat mass. Includes bone, water and organs, so it always runs higher. */
  fatFreeMass: number | null
  fatMass: number | null
  fatPct: number | null
  water: number | null
  musclePct: number | null
  visceral: number | null
}

/**
 * Join the two body-composition sources by date.
 *
 * `useWeightTrend` carries weight / fat% / muscle mass (unioned from the
 * `body_composition` ledger and `daily_logs`); `useBodyDetailTrend` carries the
 * scale's extra readings. Both are read-only here — nothing is derived except
 * fat mass and lean mass, which are simple products of numbers already present.
 */
export function mergeBodyComposition(
  trend: BodyTrendRow[],
  detail: BodyDetailRow[],
  toDisplay: (kg: number | null) => number | null,
): BodyCompositionPoint[] {
  const byDate = new Map<string, BodyCompositionPoint>()
  const blank = (date: string): BodyCompositionPoint => ({
    date, weight: null, muscleMass: null, fatFreeMass: null, fatMass: null,
    fatPct: null, water: null, musclePct: null, visceral: null,
  })

  for (const r of trend) {
    const p = byDate.get(r.date) ?? blank(r.date)
    p.weight = toDisplay(r.weight_kg)
    p.fatPct = r.body_fat_pct ?? p.fatPct
    // TWO series, never one.
    //
    // There used to be a single `lean` that meant weight − fat when body-fat %
    // was recorded and muscle mass otherwise. Those are ~2.6 kg apart, so the
    // line stepped up 2.6 kg on 2026-07-23 — the date HealthKit started filling
    // the column — and read as lean-mass gain during a cut. Each series is now
    // drawn only from its own definition, and stays null where its inputs are
    // missing rather than borrowing the other one's value.
    if (r.weight_kg != null && r.body_fat_pct != null) {
      const fatKg = (r.weight_kg * r.body_fat_pct) / 100
      p.fatMass = toDisplay(fatKg)
      p.fatFreeMass = toDisplay(r.weight_kg - fatKg)
    } else if (r.fat_free_mass_kg != null) {
      p.fatFreeMass = toDisplay(r.fat_free_mass_kg)
    }
    if (r.muscle_mass_kg != null) p.muscleMass = toDisplay(r.muscle_mass_kg)
    byDate.set(r.date, p)
  }

  for (const r of detail) {
    const p = byDate.get(r.date) ?? blank(r.date)
    p.water = r.water_percent ?? p.water
    p.musclePct = r.muscle_percent ?? p.musclePct
    p.visceral = r.visceral_fat ?? p.visceral
    p.fatPct = p.fatPct ?? r.body_fat_pct ?? null
    byDate.set(r.date, p)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

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
  const [family, setFamily] = useState<Family>('mass')

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
    return <div className="helix-card h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }
  if (!available.length) {
    return (
      <div className="helix-card h-64 flex items-center justify-center">
        <p className="text-muted text-sm text-center px-6">No body-composition readings in this range — log an InBody entry to build the trend.</p>
      </div>
    )
  }

  return (
    <div className="helix-card">
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Body Composition</h3>
        <div className="flex gap-1">
          {available.map((f) => {
            const on = active === f
            return (
              <button key={f} onClick={() => setFamily(f)}
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

      <div role="img" aria-label={`Body composition — ${FAMILY_META[active].label}`}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.weight} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS.weight} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              minTickGap={24} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: COLORS.text, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              width={38} axisLine={false} tickLine={false} domain={domain} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            {active === 'mass' && (
              <>
                <Area type="monotone" dataKey="weight" name={`Weight (${unit})`} stroke={COLORS.weight}
                  fill="url(#bodyFill)" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="fatFreeMass" name={`Fat-Free (${unit})`} stroke={COLORS.lean}
                  strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="muscleMass" name={`Muscle (${unit})`} stroke={COLORS.musclePct}
                  strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="fatMass" name={`Fat (${unit})`} stroke={COLORS.fatMass}
                  strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls />
              </>
            )}
            {active === 'percent' && (
              <>
                <Line type="monotone" dataKey="fatPct" name="Fat %" stroke={COLORS.fatPct} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="musclePct" name="Muscle %" stroke={COLORS.musclePct} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="water" name="Water %" stroke={COLORS.water} strokeWidth={2} dot={false} connectNulls />
              </>
            )}
            {active === 'visceral' && (
              <Line type="monotone" dataKey="visceral" name="Visceral" stroke={COLORS.visceral}
                strokeWidth={2} dot={{ r: 2, fill: COLORS.visceral }} connectNulls />
            )}

            {boundary && (
              <ReferenceDot x={fmtDate(boundary.date)} y={domain[0]} r={4} fill={COLORS.lean} stroke="none"
                label={{ value: 'Helix', position: 'top', fill: COLORS.text, fontSize: 9 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
