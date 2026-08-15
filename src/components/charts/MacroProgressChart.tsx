'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { Segmented } from '@/components/ui/Segmented'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import type { Tables } from '@/lib/supabase/types'
import type { ActiveNutritionGoals } from '@/lib/hooks/useNutritionGoals'

// `goalKey` indexes the RESOLVED goals, not the raw `user_goals` row. The chart
// used to read that row directly while the rings on the same page read healed
// local state, so the two graded the same day against different numbers.
const METRICS = [
  { key: 'protein_g', label: 'Protein', color: MACRO_COLORS.protein, goalKey: 'protein' },
  { key: 'carbs_g',   label: 'Carbs',   color: MACRO_COLORS.carbs, goalKey: 'carbs' },
  { key: 'fat_g',     label: 'Fats',    color: MACRO_COLORS.fat, goalKey: 'fat' },
] as const

type NutritionRow = Pick<Tables<'nutrition_entries'>, 'date' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>


function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

type MacroKey = (typeof METRICS)[number]['key']

export function MacroProgressChart({ data, goals, isLoading }: { data: NutritionRow[]; goals: ActiveNutritionGoals; isLoading?: boolean }) {
  const [key, setMetric] = useState<MacroKey>('protein_g')
  const metric = METRICS.find((m) => m.key === key) ?? METRICS[0]

  if (isLoading) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }
  if (!data.length) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><p className="text-muted text-sm">No nutrition data yet.</p></div>
  }

  const goal = goals[metric.goalKey] ?? null
  const usePct = goal != null && goal > 0
  const chartData = data.map((d) => {
    const raw = Number(d[metric.key]) || 0
    return { date: formatDate(d.date), val: usePct ? Math.min(Math.round((raw / goal!) * 100), 120) : raw, raw }
  })

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Macros vs Goal</h3>
        <Segmented<MacroKey>
          label="Macro"
          size="sm"
          value={metric.key}
          onChange={(k) => setMetric(k)}
          options={METRICS.map((m) => ({ value: m.key, label: m.label, color: m.color }))}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <span>{metric.label}{usePct ? ` vs ${goal}g goal` : ' (g/day)'}</span>
      </div>
      <div role="img" aria-label={`${metric.label} vs goal chart`}>
        <ResponsiveContainer width="100%" height={200}>
          {/* The right margin is the Goal label's lane — see the ReferenceLine below. */}
          <BarChart data={chartData} margin={{ top: 4, right: 34, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#79808C', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickMargin={8} minTickGap={20} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={usePct ? [0, 120] : [0, 'auto']} tick={{ fill: '#79808C', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => (usePct ? `${v}%` : `${v}`)} />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip active={active}
                  payload={[{ name: metric.label, value: (payload[0].payload as { raw: number })?.raw ?? 0, color: metric.color, unit: 'g' }]}
                  label={label != null ? String(label) : undefined} />
              ) : null} />
            {/* `position: 'right'` puts the label in the margin, not over the bars.
                'insideRight' drew it inside the plot, directly on top of any day
                that reached its goal near the right edge — which is every good day. */}
            {usePct && <ReferenceLine y={100} stroke={metric.color} strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Goal', position: 'right', fill: '#79808C', fontSize: 10 }} />}
            <Bar isAnimationActive={false} dataKey="val" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={usePct ? (entry.val >= 100 ? metric.color : entry.val >= 75 ? '#D4AF37' : '#C4514E') : metric.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
