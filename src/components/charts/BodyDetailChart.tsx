'use client'

import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { BodyDetailRow } from '@/lib/hooks/useCharts'

const COLORS = {
  water: '#3D7AB8',
  muscle: '#3E9E7A',
  fat: '#D4AF37',
  visceral: '#E0703C',
  grid: 'rgba(255,255,255,0.06)',
  text: '#79808C',
}

/**
 * Body-composition detail trend — the InBody numbers beyond weight: body water %,
 * muscle %, body-fat % (left axis) and the visceral-fat rating (right axis).
 * Complements WeightTrendChart, which carries weight + fat% + muscle mass.
 */
export function BodyDetailChart({ data, isLoading }: { data: BodyDetailRow[]; isLoading?: boolean }) {
  const has = data.some((r) => r.water_percent != null || r.muscle_percent != null || r.visceral_fat != null || r.body_fat_pct != null)

  return (
    <div className="helix-card">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <span className="text-[10px] text-muted uppercase tracking-wide">water · muscle · fat · visceral</span>
      </div>

      {isLoading ? (
        <div className="h-56 bg-surface-2 rounded-xl animate-pulse" />
      ) : !has ? (
        <p className="text-fluid-xs text-muted py-10 text-center">No scale readings in this range — log an InBody entry to build the trend.</p>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
            <YAxis yAxisId="pct" tick={{ fill: COLORS.text, fontSize: 10 }} width={30} domain={['dataMin - 3', 'dataMax + 3']} />
            <YAxis yAxisId="visc" orientation="right" tick={{ fill: COLORS.text, fontSize: 10 }} width={22} domain={[0, 'dataMax + 2']} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line yAxisId="pct" name="Water %" dataKey="water_percent" stroke={COLORS.water} strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="pct" name="Muscle %" dataKey="muscle_percent" stroke={COLORS.muscle} strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="pct" name="Fat %" dataKey="body_fat_pct" stroke={COLORS.fat} strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="visc" name="Visceral" dataKey="visceral_fat" stroke={COLORS.visceral} strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
