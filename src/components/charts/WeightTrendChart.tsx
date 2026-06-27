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
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'

const COLORS = {
  weight: '#3D7DFF',   // electric blue (was stale #00E5A0)
  muscle: '#2DD4A7',   // success teal
  bodyFat: '#7C5CFF',  // energy violet
  grid: 'rgba(255,255,255,0.06)',
  text: '#8A97B0',
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
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr + 'T12:00:00Z'),
  )
}

export function WeightTrendChart({ data, isLoading }: WeightTrendChartProps) {
  if (isLoading) {
    return (
      <div className="vital-card h-64 flex items-center justify-center">
        <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    )
  }

  const weights = data.map((d) => d.weight_kg).filter((w): w is number => w !== null)
  if (!data.length || !weights.length) {
    return (
      <div className="vital-card h-64 flex items-center justify-center">
        <p className="text-muted-vital text-sm">No body-composition data yet. Sync Apple Health or run the historical import.</p>
      </div>
    )
  }

  const hasMuscle = data.some((d) => d.muscle_mass_kg != null)
  const allMass = [...weights, ...data.map((d) => d.muscle_mass_kg).filter((m): m is number => m != null)]
  const minMass = Math.floor(Math.min(...allMass) - 2)
  const maxMass = Math.ceil(Math.max(...weights) + 2)

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    weight: d.weight_kg,
    muscle: d.muscle_mass_kg ?? null,
    bodyFat: d.body_fat_pct,
  }))

  return (
    <div className="vital-card">
      <h3 className="font-heading font-semibold text-base mb-4">Body Composition</h3>
      <div role="img" aria-label="Body composition breakdown chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
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
            <YAxis yAxisId="mass" domain={[minMass, maxMass]} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => `${v}kg`} />
            <YAxis yAxisId="fat" orientation="right" domain={[0, 40]} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLORS.grid, strokeWidth: 1 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.text }} iconType="circle" iconSize={8} />
            <Area yAxisId="mass" type="monotone" dataKey="weight" name="Weight (kg)" stroke={COLORS.weight} fill="url(#weightFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS.weight }} />
            {hasMuscle && (
              <Area yAxisId="mass" type="monotone" dataKey="muscle" name="Muscle (kg)" stroke={COLORS.muscle} fill="url(#muscleFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS.muscle }} connectNulls />
            )}
            <Line yAxisId="fat" type="monotone" dataKey="bodyFat" name="Body Fat (%)" stroke={COLORS.bodyFat} strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: COLORS.bodyFat }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
