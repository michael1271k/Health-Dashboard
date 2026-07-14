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

// A chart bucket. 'arms' is a HELIX-only pseudo-split (Delts & Arms) that the DB
// stores as split_day='upper' — resolved by weekday below.
type ChartSplit = SplitDay | 'arms'
const ARMS_COLOR = '#6FE9FF'

// The pill set is era-specific. PPL trains Push/Pull/Legs (no "Upper" — zero
// records); HELIX-5 logs Upper, Delts & Arms, and Legs & Core. Legacy "lower"
// always folds into legs.
const SPLITS_FOR_ERA: Record<'all' | 'ppl' | 'axis', ChartSplit[]> = {
  all: ['push', 'pull', 'legs'],
  ppl: ['push', 'pull', 'legs'],
  axis: ['upper', 'arms', 'legs'],
}
const splitLabel = (s: ChartSplit, era: 'all' | 'ppl' | 'axis') => {
  if (s === 'arms') return 'Delts & Arms'
  if (s === 'legs') return era === 'axis' ? 'Legs & Core' : 'Legs'
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * Map a session (date + DB split_day) to its chart bucket. HELIX Delts & Arms
 * days are logged as 'upper' but fall on Wednesday — that weekday split lets us
 * track them separately from the Upper A/B days.
 */
export function resolveChartSplit(dateISO: string, split: string, era: 'all' | 'ppl' | 'axis'): ChartSplit {
  if (split === 'lower') return 'legs'
  if (era === 'axis' && split === 'upper') {
    const weekday = new Date(dateISO + 'T12:00:00Z').getUTCDay()
    return weekday === 3 ? 'arms' : 'upper'
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
  const color = activeSplit === 'arms' ? ARMS_COLOR : (PPL_SPLITS[activeSplit as SplitDay]?.color ?? '#19E3B1')

  return (
    <div className="helix-card">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Workout Volume</h3>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {pills.map((s) => {
            const active = activeSplit === s
            const c = s === 'arms' ? ARMS_COLOR : (PPL_SPLITS[s as SplitDay]?.color ?? '#19E3B1')
            return (
              <button key={s} onClick={() => setSplit(s)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border"
                style={active ? { color: c, borderColor: `${c}55`, background: `${c}1f` } : { color: TEXT, borderColor: 'transparent' }}>
                {splitLabel(s, era)}
              </button>
            )
          })}
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="h-56 flex items-center justify-center"><p className="text-muted-vital text-sm">No {splitLabel(activeSplit, era)} sessions in range.</p></div>
      ) : (
        <div role="img" aria-label={`${splitLabel(activeSplit, era)} volume over time`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: TEXT, fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
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
