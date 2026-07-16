'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import type { Tables } from '@/lib/supabase/types'

const METRICS = [
  { key: 'protein_g', label: 'Protein', color: MACRO_COLORS.protein, goalKey: 'protein_goal_g' },
  { key: 'carbs_g',   label: 'Carbs',   color: MACRO_COLORS.carbs, goalKey: 'carbs_goal_g' },
  { key: 'fat_g',     label: 'Fats',    color: MACRO_COLORS.fat, goalKey: 'fat_goal_g' },
] as const

type NutritionRow = Pick<Tables<'nutrition_entries'>, 'date' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>
type GoalsRow = Tables<'user_goals'>

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

export function MacroProgressChart({ data, goals, isLoading }: { data: NutritionRow[]; goals: GoalsRow | null; isLoading?: boolean }) {
  const [mi, setMi] = useState(0)
  const metric = METRICS[mi]

  if (isLoading) {
    return <div className="helix-card h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }
  if (!data.length) {
    return <div className="helix-card h-64 flex items-center justify-center"><p className="text-muted text-sm">No nutrition data yet.</p></div>
  }

  const goal = (goals?.[metric.goalKey] as number | null) ?? null
  const usePct = goal != null && goal > 0
  const chartData = data.map((d) => {
    const raw = Number(d[metric.key]) || 0
    return { date: formatDate(d.date), val: usePct ? Math.min(Math.round((raw / goal!) * 100), 120) : raw, raw }
  })

  return (
    <div className="helix-card">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Macros vs Goal</h3>
        <div className="flex gap-1">
          {METRICS.map((m, i) => {
            const active = i === mi
            return (
              <button key={m.key} onClick={() => setMi(i)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors border"
                style={active ? { color: m.color, borderColor: `${m.color}55`, background: `${m.color}1f` } : { color: '#8B97B2', borderColor: 'transparent' }}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <span>{metric.label}{usePct ? ` vs ${goal}g goal` : ' (g/day)'}</span>
      </div>
      <div role="img" aria-label={`${metric.label} vs goal chart`}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#8B97B2', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={usePct ? [0, 120] : [0, 'auto']} tick={{ fill: '#8B97B2', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => (usePct ? `${v}%` : `${v}`)} />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip active={active}
                  payload={[{ name: metric.label, value: (payload[0].payload as { raw: number })?.raw ?? 0, color: metric.color, unit: 'g' }]}
                  label={label != null ? String(label) : undefined} />
              ) : null} />
            {usePct && <ReferenceLine y={100} stroke={metric.color} strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Goal', position: 'insideRight', fill: '#8B97B2', fontSize: 10 }} />}
            <Bar dataKey="val" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={usePct ? (entry.val >= 100 ? metric.color : entry.val >= 75 ? '#FFB020' : '#FF5470') : metric.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
