'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { Tables } from '@/lib/supabase/types'

const MACROS = [
  { key: 'calories' as const,  label: 'Cal',     color: '#38BDF8', unit: 'kcal', goalKey: 'calorie_goal' as const },
  { key: 'protein_g' as const, label: 'Protein', color: '#2DD4A7', unit: 'g',    goalKey: 'protein_goal_g' as const },
  { key: 'carbs_g' as const,   label: 'Carbs',   color: '#FF4D6D', unit: 'g',    goalKey: 'carbs_goal_g' as const },
  { key: 'fat_g' as const,     label: 'Fat',     color: '#FFB020', unit: 'g',    goalKey: 'fat_goal_g' as const },
] as const

type NutritionRow = Pick<Tables<'nutrition_entries'>, 'date' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>
type GoalsRow = Tables<'user_goals'>

interface MacroProgressChartProps {
  data: NutritionRow[]
  goals: GoalsRow | null
  isLoading?: boolean
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr + 'T12:00:00Z'),
  )
}

export function MacroProgressChart({ data, goals, isLoading }: MacroProgressChartProps) {
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
        <p className="text-muted-vital text-sm">No nutrition data yet.</p>
      </div>
    )
  }

  // Show % of goal achieved (capped at 120%)
  const proteinGoal = goals?.protein_goal_g ?? 180
  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    protein: Math.min(Math.round((d.protein_g / proteinGoal) * 100), 120),
    rawProtein: d.protein_g,
    proteinGoal,
  }))

  return (
    <div className="vital-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-base">Protein vs Goal</h3>
        <span className="text-xs text-muted-vital">Target: {proteinGoal}g/day</span>
      </div>
      <div role="img" aria-label="Protein vs goal chart">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 120]}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    active={active}
                    payload={payload.map((p) => ({
                      name: 'Protein',
                      value: (p.payload as { rawProtein: number })?.rawProtein ?? 0,
                      color: '#2DD4A7',
                      unit: 'g',
                    }))}
                    label={label != null ? String(label) : undefined}
                  />
                ) : null
              }
            />
            {/* 100% goal line */}
            <ReferenceLine
              y={100}
              stroke="#2DD4A7"
              strokeDasharray="4 2"
              strokeWidth={1}
              label={{ value: 'Goal', position: 'insideRight', fill: '#94A3B8', fontSize: 10 }}
            />
            <Bar dataKey="protein" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.protein >= 100 ? '#2DD4A7' : entry.protein >= 75 ? '#FFB020' : '#FF4D6D'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Today's macro breakdown */}
      {data.length > 0 && (() => {
        const today = data[data.length - 1]
        return (
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border">
            {MACROS.map(({ key, label, color, unit }) => (
              <div key={key} className="text-center">
                <div className="vital-number text-base font-bold" style={{ color }}>
                  {Math.round(Number(today[key]))}
                  <span className="text-xs text-muted-vital ml-0.5">{unit}</span>
                </div>
                <div className="text-xs text-muted-vital">{label}</div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
