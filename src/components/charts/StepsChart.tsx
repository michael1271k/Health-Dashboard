'use client'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { EMERALD, PLATINUM, EMBER, MUTED } from '@/lib/theme/palette'
import type { StepsPoint } from '@/lib/hooks/useCharts'

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

/** The same three-band colouring `StepsJourney` uses for a single day. */
function bandFor(steps: number, goal: number | null): string {
  if (!goal || goal <= 0) return PLATINUM
  const pct = steps / goal
  return pct >= 1 ? EMERALD : pct >= 0.5 ? PLATINUM : EMBER
}

/**
 * Steps per day against the goal.
 *
 * ── WHY IT LIVES WITH BODY WEIGHT AND NOT WITH VOLUME ────────────────────────
 * Steps are the other half of the energy-balance story: weight is the outcome,
 * intake and steps are the inputs. Reading them on one surface is what makes a
 * stalled cut legible. Training volume answers a different question (is the
 * stimulus there?) and belongs with the lifts.
 *
 * ── WHY BARS AND NOT A LINE ──────────────────────────────────────────────────
 * A line implies the value between two points means something. Steps reset to
 * zero every midnight, so there is no "between" — each day is its own quantity,
 * and a line drawn through them invents a slope that never existed. The bar
 * colouring carries the verdict (hit / halfway / short) so the goal line is a
 * reference rather than the only way to read the chart.
 *
 * Deliberately NOT a 7-day average: this is the raw record. The trend belongs to
 * body weight, which is the metric that actually needs smoothing.
 */
export function StepsChart({ data, goal, isLoading }: {
  data: StepsPoint[]
  goal: number | null
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
        <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    )
  }
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
        <p className="text-muted text-sm">No step data in this window.</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({ date: formatDate(d.date), steps: d.steps }))
  const hit = goal && goal > 0 ? data.filter((d) => d.steps >= goal).length : null
  const mean = Math.round(data.reduce((s, d) => s + d.steps, 0) / data.length)

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Steps</h3>
        <span className="helix-num text-[11px]" style={{ color: MUTED }}>
          {mean.toLocaleString()} avg
          {hit != null && <> · {hit}/{data.length} hit goal</>}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        {goal && goal > 0 ? `Daily count vs a ${goal.toLocaleString()} goal` : 'Daily count'}
      </p>
      <div role="img" aria-label="Daily steps chart">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#79808C', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickMargin={8} minTickGap={20} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#79808C', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              axisLine={false} tickLine={false} width={40}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(Number(v) / 1000)}k` : `${v}`)} />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip active={active}
                  payload={[{
                    name: 'Steps',
                    value: (payload[0].payload as { steps: number })?.steps ?? 0,
                    color: bandFor((payload[0].payload as { steps: number })?.steps ?? 0, goal),
                  }]}
                  label={label != null ? String(label) : undefined} />
              ) : null} />
            {goal != null && goal > 0 && (
              <ReferenceLine y={goal} stroke={EMERALD} strokeDasharray="4 2" strokeWidth={1}
                label={{ value: 'Goal', position: 'insideRight', fill: '#79808C', fontSize: 10 }} />
            )}
            <Bar isAnimationActive={false} dataKey="steps" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={bandFor(entry.steps, goal)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
