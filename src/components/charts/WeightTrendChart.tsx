'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Brush,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { HELIX_CUT_START } from '@/lib/programs'

const COLORS = {
  weight: '#6D5BFF',   // royal indigo (Midnight Luxe)
  muscle: '#19E3B1',   // neon teal
  bodyFat: '#5AD7FF',  // ice cyan
  grid: 'rgba(255,255,255,0.06)',
  text: '#8B97B2',
}

interface WeightDataPoint {
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_mass_kg?: number | null
}

interface WeightTrendChartProps {
  data: WeightDataPoint[]
  isLoading?: boolean
  /** Draw the Helix 5.1 Cut era-start marker (shown on the all-history view). */
  showEraBoundary?: boolean
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr + 'T12:00:00Z'),
  )
}

export function WeightTrendChart({ data, isLoading, showEraBoundary }: WeightTrendChartProps) {
  const unit = useUnitSystem()
  if (isLoading) {
    return (
      <div className="helix-card h-64 flex items-center justify-center">
        <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    )
  }

  const weights = data.map((d) => displayWeight(d.weight_kg)).filter((w): w is number => w !== null)
  if (!data.length || !weights.length) {
    return (
      <div className="helix-card h-64 flex items-center justify-center">
        <p className="text-muted text-sm">No body-composition data yet. Sync Apple Health or run the historical import.</p>
      </div>
    )
  }

  const hasMuscle = data.some((d) => d.muscle_mass_kg != null)
  const allMass = [...weights, ...data.map((d) => displayWeight(d.muscle_mass_kg)).filter((m): m is number => m != null)]
  const minMass = Math.floor(Math.min(...allMass) - 2)
  const maxMass = Math.ceil(Math.max(...weights) + 2)

  // Baseline + delta highlights (initial → latest)
  const firstWeight = weights[0]
  const lastWeight = weights[weights.length - 1]
  const weightDelta = Math.round((lastWeight - firstWeight) * 10) / 10
  const fats = data.map((d) => d.body_fat_pct).filter((f): f is number => f != null)
  const fatDelta = fats.length >= 2 ? Math.round((fats[fats.length - 1] - fats[0]) * 10) / 10 : null

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    weight: displayWeight(d.weight_kg),
    muscle: displayWeight(d.muscle_mass_kg),
    bodyFat: d.body_fat_pct,
  }))

  // Era boundary: the first data point on/after HELIX_CUT_START — only
  // meaningful when the data spans both sides of the boundary.
  const eraBoundaryPoint = showEraBoundary && data.some((d) => d.date < HELIX_CUT_START)
    ? data.find((d) => d.date >= HELIX_CUT_START)
    : undefined

  return (
    <div className="helix-card">
      <div className="flex items-baseline justify-between gap-2 mb-4 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Body Composition</h3>
        <div className="flex items-center gap-3 text-fluid-xs text-muted">
          <span>
            Weight <span className="helix-num text-text">{firstWeight}</span> →{' '}
            <span className="helix-num text-text">{lastWeight}</span>{unit}
            <span className={`helix-num ml-1 ${weightDelta <= 0 ? 'text-success' : 'text-warn'}`}>
              {weightDelta > 0 ? '+' : ''}{weightDelta}
            </span>
          </span>
          {fatDelta != null && (
            <span>
              Fat <span className={`helix-num ${fatDelta <= 0 ? 'text-success' : 'text-warn'}`}>
                {fatDelta > 0 ? '+' : ''}{fatDelta}%
              </span>
            </span>
          )}
        </div>
      </div>
      <div role="img" aria-label="Body composition breakdown chart">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
            <ReferenceLine
              yAxisId="mass" y={firstWeight}
              stroke={COLORS.weight} strokeOpacity={0.4} strokeDasharray="2 4"
              label={{ value: 'baseline', position: 'insideTopLeft', fill: COLORS.text, fontSize: 10 }}
            />
            {eraBoundaryPoint && (
              <ReferenceLine
                yAxisId="mass" x={formatDate(eraBoundaryPoint.date)}
                stroke="#3EE0FF" strokeOpacity={0.7} strokeDasharray="4 3"
                label={{ value: 'Helix 5.1', position: 'insideTopRight', fill: '#3EE0FF', fontSize: 10 }}
              />
            )}
            <defs>
              <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.weight} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.weight} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="muscleFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.muscle} stopOpacity={0.25} />
                <stop offset="100%" stopColor={COLORS.muscle} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="mass" domain={[minMass, maxMass]} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => `${v}${unit}`} />
            <YAxis yAxisId="fat" orientation="right" domain={[0, 40]} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLORS.grid, strokeWidth: 1 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.text }} iconType="circle" iconSize={8} />
            <Area yAxisId="mass" type="monotone" dataKey="weight" name={`Weight (${unit})`} stroke={COLORS.weight} fill="url(#weightFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS.weight }} />
            {hasMuscle && (
              <Area yAxisId="mass" type="monotone" dataKey="muscle" name={`Muscle (${unit})`} stroke={COLORS.muscle} fill="url(#muscleFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS.muscle }} connectNulls />
            )}
            <Line yAxisId="fat" type="monotone" dataKey="bodyFat" name="Body Fat (%)" stroke={COLORS.bodyFat} strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: COLORS.bodyFat }} connectNulls />
            {chartData.length > 8 && (
              <Brush dataKey="date" height={18} travellerWidth={8} stroke={COLORS.weight} fill="rgba(255,255,255,0.03)" tickFormatter={() => ''} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
