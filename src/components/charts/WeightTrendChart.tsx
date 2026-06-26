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
  weight: '#00E5A0',
  bodyFat: '#7C5CFF',
  grid: '#243040',
  text: '#94A3B8',
}

interface WeightDataPoint {
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
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

  if (!data.length) {
    return (
      <div className="vital-card h-64 flex items-center justify-center">
        <p className="text-muted-vital text-sm">No weight data yet. Sync Health Auto Export to see trends.</p>
      </div>
    )
  }

  const weights = data.map((d) => d.weight_kg).filter((w): w is number => w !== null)
  const minWeight = Math.floor(Math.min(...weights) - 2)
  const maxWeight = Math.ceil(Math.max(...weights) + 2)

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    rawDate: d.date,
    weight: d.weight_kg,
    bodyFat: d.body_fat_pct,
  }))

  return (
    <div className="vital-card">
      <h3 className="font-heading font-semibold text-base mb-4">Weight Trend</h3>
      <div role="img" aria-label="Weight trend chart">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: COLORS.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="weight"
              domain={[minWeight, maxWeight]}
              tick={{ fill: COLORS.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
              tickFormatter={(v) => `${v}kg`}
            />
            <YAxis
              yAxisId="fat"
              orientation="right"
              domain={[0, 40]}
              tick={{ fill: COLORS.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: COLORS.grid, strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: COLORS.text }}
              iconType="circle"
              iconSize={8}
            />
            {/* Weight area */}
            <Area
              yAxisId="weight"
              type="monotone"
              dataKey="weight"
              name="Weight (kg)"
              stroke={COLORS.weight}
              fill={COLORS.weight}
              fillOpacity={0.08}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS.weight }}
            />
            {/* Body fat line */}
            <Line
              yAxisId="fat"
              type="monotone"
              dataKey="bodyFat"
              name="Body Fat (%)"
              stroke={COLORS.bodyFat}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 3, fill: COLORS.bodyFat }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
