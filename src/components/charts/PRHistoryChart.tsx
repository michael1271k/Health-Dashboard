'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { PRRow } from '@/lib/hooks/useCharts'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { eraForDate } from '@/lib/programs'

const EXERCISE_COLORS = [
  '#00E5A0', // primary
  '#7C5CFF', // energy
  '#38BDF8', // info
  '#FFB020', // warn
  '#FF4D6D', // danger
]

interface PRHistoryChartProps {
  data: PRRow[]
  isLoading?: boolean
}

export function PRHistoryChart({ data, isLoading }: PRHistoryChartProps) {
  const unit = useUnitSystem()
  if (isLoading) {
    return (
      <div className="helix-card h-64 flex items-center justify-center">
        <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="helix-card h-64 flex items-center justify-center">
        <p className="text-muted-vital text-sm">Log workouts to see strength trends.</p>
      </div>
    )
  }

  // Group by exercise, pivot to date-keyed rows for Recharts.
  // Era ghost: PPL-legacy points pivot into a "· PPL" ghost series (30% opacity,
  // dashed) beneath the vivid HELIX-5 line — the era jump is instantly visible.
  const exercises = [...new Set(data.map((d) => d.exercise_name))]
  const dates = [...new Set(data.map((d) => d.date))].sort()

  const byDate = new Map<string, Record<string, number>>()
  let hasGhost = false
  for (const row of data) {
    const existing = byDate.get(row.date) ?? {}
    const ghost = eraForDate(row.date) === 'ppl'
    if (ghost) hasGhost = true
    const key = ghost ? `${row.exercise_name} · PPL` : row.exercise_name
    existing[key] = Math.max(existing[key] ?? 0, displayWeight(row.est_1rm_kg) ?? 0)
    byDate.set(row.date, existing)
  }

  const chartData = dates.map((date) => ({
    date: new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
      new Date(date + 'T12:00:00Z'),
    ),
    ...byDate.get(date),
  }))

  return (
    <div className="helix-card">
      <h3 className="font-heading font-semibold text-base mb-4">
        Estimated 1RM Trends
      </h3>
      <div role="img" aria-label="Strength trend chart showing estimated 1 rep max over time">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#243040" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: '#243040', strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
              iconType="circle"
              iconSize={6}
            />
            {exercises.slice(0, 5).map((name, i) => {
              const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length]
              return [
                hasGhost && (
                  <Line
                    key={`${name}-ppl`}
                    type="monotone"
                    dataKey={`${name} · PPL`}
                    name={`${name} · PPL`}
                    stroke={color}
                    strokeOpacity={0.3}
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    dot={false}
                    legendType="none"
                    connectNulls
                  />
                ),
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />,
              ]
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {exercises.length > 5 && (
        <p className="text-xs text-muted-vital mt-2 text-center">
          Showing top 5 exercises. Filter by exercise in the logger.
        </p>
      )}
    </div>
  )
}
