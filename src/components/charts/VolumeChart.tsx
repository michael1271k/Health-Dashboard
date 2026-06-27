'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { VolumePoint } from '@/lib/hooks/useCharts'

const COLORS = { volume: '#3D7DFF', grid: 'rgba(255,255,255,0.06)', text: '#8A97B0' }

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr + 'T12:00:00Z'),
  )
}

export function VolumeChart({ data, isLoading }: { data: VolumePoint[]; isLoading?: boolean }) {
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
        <p className="text-muted-vital text-sm">No workout volume yet. Log sessions to see your trend.</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({ date: formatDate(d.date), volume: d.volume }))

  return (
    <div className="vital-card">
      <h3 className="font-heading font-semibold text-base mb-4">Workout Volume</h3>
      <div role="img" aria-label="Workout volume over time">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.volume} stopOpacity={0.4} />
                <stop offset="100%" stopColor={COLORS.volume} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLORS.grid, strokeWidth: 1 }} />
            <Area type="monotone" dataKey="volume" name="Volume (kg)" stroke={COLORS.volume} fill="url(#volFill)" strokeWidth={2} dot={{ r: 2, fill: COLORS.volume }} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
