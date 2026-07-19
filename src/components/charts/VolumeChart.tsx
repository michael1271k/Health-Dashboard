'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { VolumePoint } from '@/lib/hooks/useCharts'
import { PPL_SPLITS, type SplitDay } from '@/lib/types/workout'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

const GRID = 'rgba(255,255,255,0.06)'
const TEXT = '#8B97B2'

// Chart buckets. HELIX-only pseudo-splits resolved by weekday: 'upper_a'/'upper_b'
// (both DB split_day='upper', Sun vs Thu), 'arms' (Delts & Arms, also DB 'upper',
// Tue) and 'legs_a'/'legs_b' (Legs A/B, both DB split_day='legs', Mon vs Fri).
type ChartSplit = SplitDay | 'upper_a' | 'upper_b' | 'arms' | 'legs_a' | 'legs_b'
const UPPER_A_COLOR = '#22D3EE'  // Upper A cyan (programs C.cbA)
const UPPER_B_COLOR = '#F5C15A'  // Upper B gold (programs C.cbB)
const ARMS_COLOR = '#34D399'     // Delts & Arms mint (programs C.arms)
const LEGS_A_COLOR = '#38BDF8'   // quad sky
const LEGS_B_COLOR = '#A78BFA'   // posterior violet (was #34D399 — collided with Arms mint)

// The pill set is era-specific. PPL trains Push/Pull/Legs (no "Upper" — zero
// records); HELIX-5 logs the five real splits. Legacy "lower" folds into legs.
const SPLITS_FOR_ERA: Record<'all' | 'ppl' | 'axis', ChartSplit[]> = {
  all: ['push', 'pull', 'legs'],
  ppl: ['push', 'pull', 'legs'],
  axis: ['upper_a', 'upper_b', 'arms', 'legs_a', 'legs_b'],
}
const splitLabel = (s: ChartSplit) => {
  if (s === 'upper_a') return 'Upper A'
  if (s === 'upper_b') return 'Upper B'
  if (s === 'arms') return 'Delts & Arms'
  if (s === 'legs_a') return 'Legs A'
  if (s === 'legs_b') return 'Legs B'
  if (s === 'legs') return 'Legs'
  return s[0].toUpperCase() + s.slice(1)
}
function splitColor(s: ChartSplit): string {
  if (s === 'upper_a') return UPPER_A_COLOR
  if (s === 'upper_b') return UPPER_B_COLOR
  if (s === 'arms') return ARMS_COLOR
  if (s === 'legs_a') return LEGS_A_COLOR
  if (s === 'legs_b') return LEGS_B_COLOR
  return PPL_SPLITS[s as SplitDay]?.color ?? '#34D399'
}

/**
 * Map a session (date + DB split_day) to its chart bucket by weekday. HELIX logs
 * all upper days as DB split_day='upper': Sun→Upper A, Tue→Delts & Arms, Thu→
 * Upper B. Both Legs days log as 'legs': Mon→Legs A, Fri→Legs B. The weekday
 * disambiguates the five real Helix splits.
 */
export function resolveChartSplit(dateISO: string, split: string, era: 'all' | 'ppl' | 'axis'): ChartSplit {
  if (split === 'lower') return 'legs'
  if (era === 'axis') {
    const weekday = new Date(dateISO + 'T12:00:00Z').getUTCDay()
    if (split === 'upper') return weekday === 2 ? 'arms' : weekday === 4 ? 'upper_b' : 'upper_a'
    if (split === 'legs') return weekday === 1 ? 'legs_a' : weekday === 5 ? 'legs_b' : 'legs'
  }
  return split as ChartSplit
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

export function VolumeChart({ data, isLoading, era = 'all' }: { data: VolumePoint[]; isLoading?: boolean; era?: 'all' | 'ppl' | 'axis' }) {
  const [split, setSplit] = useState<ChartSplit>('legs')
  const unit = useUnitSystem()

  if (isLoading) {
    return <div className="helix-card h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }

  // The selected split must exist in the active era's pill set.
  const pills = SPLITS_FOR_ERA[era]
  const activeSplit = pills.includes(split) ? split : pills[0]
  const filtered = data.filter((d) => resolveChartSplit(d.date, d.split, era) === activeSplit)
  const chartData = filtered.map((d) => ({ date: formatDate(d.date), volume: displayWeight(d.volume) }))
  const color = splitColor(activeSplit)

  return (
    <div className="helix-card">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Workout Volume</h3>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {pills.map((s) => {
            const active = activeSplit === s
            const c = splitColor(s)
            return (
              <button key={s} onClick={() => setSplit(s)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border"
                style={active ? { color: c, borderColor: `${c}55`, background: `${c}1f` } : { color: TEXT, borderColor: 'transparent' }}>
                {splitLabel(s)}
              </button>
            )
          })}
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="h-56 flex items-center justify-center"><p className="text-muted text-sm">No {splitLabel(activeSplit)} sessions in range.</p></div>
      ) : (
        <div role="img" aria-label={`${splitLabel(activeSplit)} volume over time`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 26, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: TEXT, fontSize: 10, fontFamily: 'var(--font-mono)' }} tickMargin={8} minTickGap={20} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: TEXT, fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
              <Area type="monotone" dataKey="volume" name={`Volume (${unit})`} stroke={color} fill="url(#volFill)" strokeWidth={2} dot={{ r: 2, fill: color }} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
