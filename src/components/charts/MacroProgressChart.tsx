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
import type { GoalsForDate } from '@/lib/hooks/useHistoricalGoals'

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

/**
 * Every day against the goal IT was given.
 *
 * ── THE BUG THIS SHAPE EXISTS TO PREVENT ─────────────────────────────────────
 * This chart read ONE goal — today's — and divided every bar in the window by
 * it. That is fine for exactly as long as the target never moves, and the whole
 * point of a lever is that it moves. When the maintenance rung came into force
 * and carbohydrate went 206 g → 244 g, thirty days that had each hit their own
 * 206 g target were instantly redrawn as 84% and repainted from green to
 * yellow. The bars had not changed. The denominator had, retroactively, for
 * days that were finished.
 *
 * A percentage is a claim about what was ASKED FOR at the time, so the
 * denominator has to come from the day, not from the clock. `goalFor` supplies
 * it per date — see `useHistoricalGoals`, which resolves the same ladder the
 * app grades against.
 *
 * ── AND THE LABEL HAS TO ADMIT IT ────────────────────────────────────────────
 * "vs 244g goal" over a window with two different targets in it is the same lie
 * one step up. The subtitle states the figure only when the window really had
 * ONE, and says "each day's own goal" when it did not.
 */
export function MacroProgressChart({ data, goals, goalFor, isLoading }: {
  data: NutritionRow[]
  /** Today's resolved goals — the fallback when no per-date resolver is given. */
  goals: ActiveNutritionGoals
  /**
   * The targets in force on a given date. Optional so the component still
   * renders without it, but every caller in the app passes one: without it the
   * chart is back to grading the past against the present.
   */
  goalFor?: GoalsForDate
  isLoading?: boolean
}) {
  const [key, setMetric] = useState<MacroKey>('protein_g')
  const metric = METRICS.find((m) => m.key === key) ?? METRICS[0]

  if (isLoading) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }
  if (!data.length) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><p className="text-muted text-sm">No nutrition data yet.</p></div>
  }

  /** The goal that day was set, falling back to today's only when there is no resolver. */
  const goalOn = (dateISO: string): number | null => {
    const g = goalFor ? goalFor(dateISO)[metric.goalKey] : goals[metric.goalKey]
    return g != null && g > 0 ? g : null
  }

  const rows = data.map((d) => ({
    date: formatDate(d.date),
    raw: Number(d[metric.key]) || 0,
    goal: goalOn(d.date),
  }))

  // Percent mode needs at least one day with a target. A window with none —
  // a macro untracked throughout, or a history older than any goal — falls back
  // to raw grams, which is the honest reading when nothing was asked for.
  const usePct = rows.some((r) => r.goal != null)
  const chartData = rows.map((r) => ({
    date: r.date,
    // Null, not zero, on a day with no target of its own: Recharts draws no bar,
    // which is what "this day was not graded on this macro" looks like. A zero
    // column would read as a day that ate nothing.
    val: usePct ? (r.goal == null ? null : Math.min(Math.round((r.raw / r.goal) * 100), 120)) : r.raw,
    raw: r.raw,
    goal: r.goal,
  }))

  // One figure only when the whole window really shared one. See the header.
  const distinctGoals = Array.from(new Set(rows.map((r) => r.goal).filter((g): g is number => g != null)))
  const goalLabel = distinctGoals.length === 1 ? `${distinctGoals[0]}g goal` : "each day's own goal"

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
        <span>{metric.label}{usePct ? ` vs ${goalLabel}` : ' (g/day)'}</span>
      </div>
      <div role="img" aria-label={`${metric.label} vs goal chart`}>
        <ResponsiveContainer width="100%" height={200}>
          {/* The right margin is the Goal label's lane — see the ReferenceLine below. */}
          <BarChart data={chartData} margin={{ top: 4, right: 34, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#79808C', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickMargin={8} minTickGap={20} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={usePct ? [0, 120] : [0, 'auto']} tick={{ fill: '#79808C', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => (usePct ? `${v}%` : `${v}`)} />
            {/* The tooltip carries that day's own denominator, because the bar
                is now a ratio against a number the axis cannot name. */}
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as { raw: number; goal: number | null }
              return (
                <ChartTooltip active={active}
                  payload={[{
                    name: point?.goal != null ? `${metric.label} · goal ${point.goal}g` : metric.label,
                    value: point?.raw ?? 0, color: metric.color, unit: 'g',
                  }]}
                  label={label != null ? String(label) : undefined} />
              )
            }} />
            {/* `position: 'right'` puts the label in the margin, not over the bars.
                'insideRight' drew it inside the plot, directly on top of any day
                that reached its goal near the right edge — which is every good day. */}
            {usePct && <ReferenceLine y={100} stroke={metric.color} strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Goal', position: 'right', fill: '#79808C', fontSize: 10 }} />}
            <Bar isAnimationActive={false} dataKey="val" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={
                  // The verdict is against the day's OWN target — `entry.val` is
                  // already a percentage of it, so a green day stays green when
                  // a later lever moves the number.
                  !usePct || entry.val == null ? metric.color
                    : entry.val >= 100 ? metric.color
                      : entry.val >= 75 ? '#D4AF37' : '#C4514E'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
