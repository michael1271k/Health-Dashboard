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
// No "All" — different splits aren't comparable. Legs covers legacy "lower" too.
const SPLITS: SplitDay[] = ['push', 'pull', 'legs', 'upper']
const splitLabel = (s: SplitDay) => (s === 'legs' ? 'Legs/Lower' : s[0].toUpperCase() + s.slice(1))

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

export function VolumeChart({ data, isLoading }: { data: VolumePoint[]; isLoading?: boolean }) {
  const [split, setSplit] = useState<SplitDay>('legs')
  const unit = useUnitSystem()

  if (isLoading) {
    return <div className="vital-card h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }

  const filtered = data.filter((d) => d.split === split || (split === 'legs' && d.split === 'lower'))
  const chartData = filtered.map((d) => ({ date: formatDate(d.date), volume: displayWeight(d.volume) }))
  const color = PPL_SPLITS[split]?.color ?? '#19E3B1'

  return (
    <div className="vital-card">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Workout Volume</h3>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {SPLITS.map((s) => {
            const active = split === s
            const c = PPL_SPLITS[s]?.color ?? '#19E3B1'
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
        <div className="h-56 flex items-center justify-center"><p className="text-muted-vital text-sm">No {splitLabel(split)} sessions in range.</p></div>
      ) : (
        <div role="img" aria-label={`${splitLabel(split)} volume over time`}>
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
