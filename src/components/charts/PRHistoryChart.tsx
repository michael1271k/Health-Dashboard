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
        <p className="text-muted-vital text-sm">Log workouts to see strength trends.</p>
      </div>
    )
  }

  // Group by exercise, pivot to date-keyed rows for Recharts
  const exercises = [...new Set(data.map((d) => d.exercise_name))]
  const dates = [...new Set(data.map((d) => d.date))].sort()

  // Build pivot: { date, [exerciseName]: est1rm }
  const byDate = new Map<string, Record<string, number>>()
  for (const row of data) {
    const existing = byDate.get(row.date) ?? {}
    // Take max est_1rm for this exercise on this date
    existing[row.exercise_name] = Math.max(existing[row.exercise_name] ?? 0, row.est_1rm_kg)
    byDate.set(row.date, existing)
  }

  const chartData = dates.map((date) => ({
    date: new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
      new Date(date + 'T12:00:00Z'),
    ),
    ...byDate.get(date),
  }))

  return (
    <div className="vital-card">
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
              tickFormatter={(v) => `${v}kg`}
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
            {exercises.slice(0, 5).map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={EXERCISE_COLORS[i % EXERCISE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
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
