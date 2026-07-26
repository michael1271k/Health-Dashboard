'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useWeightTrend, useMacroHistory, usePRHistory, useVolumeTrend } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { RangeSelector } from '@/components/charts/RangeSelector'
import { PlanEraButton } from '@/components/charts/PlanEraButton'
import { eraForDate } from '@/lib/programs'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'

// Recharts-heavy components load client-only so they don't inflate first-load JS.
const chartFallback = () => (
  <div className="helix-card h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const WeightTrendChart = dynamic(() => import('@/components/charts/WeightTrendChart').then((m) => m.WeightTrendChart), { ssr: false, loading: chartFallback })
const VolumeChart = dynamic(() => import('@/components/charts/VolumeChart').then((m) => m.VolumeChart), { ssr: false, loading: chartFallback })
const MacroProgressChart = dynamic(() => import('@/components/charts/MacroProgressChart').then((m) => m.MacroProgressChart), { ssr: false, loading: chartFallback })
const PRHistoryChart = dynamic(() => import('@/components/charts/PRHistoryChart').then((m) => m.PRHistoryChart), { ssr: false, loading: chartFallback })

/** Analytics view of the Momentum tab — the BODY & PERFORMANCE trend charts
 * (weight, volume, macros, PRs) filterable by range and training era. The
 * gym/muscle-progress graphs (Contour Map, Intensity Calendar, Volume Stream,
 * Muscle Analytics) moved to the Workout Command Center. */
export function AnalyticsPanel() {
  const [days, setDays] = useState(30)
  const { data: weightData, isLoading: weightLoading } = useWeightTrend(days)
  const { data: volumeData, isLoading: volumeLoading } = useVolumeTrend(days)
  const { data: macroData, isLoading: macroLoading } = useMacroHistory(days)
  const { data: prData, isLoading: prLoading } = usePRHistory(undefined, days)
  const { data: goals, isLoading: goalsLoading } = useUserGoals()

  const { era } = useEraFilter()
  // Memoized so charts get stable array identity while inputs are unchanged.
  const inEra = (d: { date: string }) => era === 'all' || eraForDate(d.date) === era
  const wData = useMemo(() => (weightData ?? []).filter(inEra), [weightData, era]) // eslint-disable-line react-hooks/exhaustive-deps
  const vData = useMemo(() => (volumeData ?? []).filter(inEra), [volumeData, era]) // eslint-disable-line react-hooks/exhaustive-deps
  const mData = useMemo(() => (macroData ?? []).filter(inEra), [macroData, era]) // eslint-disable-line react-hooks/exhaustive-deps
  const pData = useMemo(() => (prData ?? []).filter(inEra), [prData, era]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <EraFilterPills />

      <div className="lg:hidden flex items-center gap-2 flex-wrap">
        <RangeSelector value={days} onChange={setDays} />
        <PlanEraButton value={days} onChange={setDays} />
      </div>

      <div className="flex gap-4 items-start">
        <div className="hidden lg:flex flex-col gap-2 shrink-0 sticky top-6 self-start">
          <RangeSelector value={days} onChange={setDays} orientation="vertical" />
          <PlanEraButton value={days} onChange={setDays} />
        </div>
        <div className="flex-1 min-w-0 space-y-6">
          <WidgetBoundary label="Charts" minHeight={280}>
            {/* [&>*]:min-w-0 lets each chart cell shrink below its Recharts
                intrinsic width — without it the X-axis overflows the mobile
                viewport (grid/flex children default to min-width:auto). */}
            <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <WeightTrendChart data={wData} isLoading={weightLoading} showEraBoundary={era === 'all'} />
              <VolumeChart data={vData} isLoading={volumeLoading} era={era} />
              <MacroProgressChart data={mData} goals={goals ?? null} isLoading={macroLoading || goalsLoading} />
              <PRHistoryChart data={pData} isLoading={prLoading} />
            </div>
          </WidgetBoundary>
        </div>
      </div>
    </div>
  )
}
