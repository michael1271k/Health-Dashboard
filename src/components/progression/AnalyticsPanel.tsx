'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { HeartPulse } from 'lucide-react'
import { useWeightTrend, useMacroHistory, usePRHistory, useVolumeTrend } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { RangeSelector } from '@/components/charts/RangeSelector'
import { eraForDate } from '@/lib/programs'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import { VitalsGroups } from '@/components/insights/VitalsGroups'

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
const MuscleAnalyticsSection = dynamic(() => import('@/components/charts/MuscleAnalytics').then((m) => m.MuscleAnalyticsSection), { ssr: false, loading: chartFallback })
const BodyHeatmap = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.BodyHeatmap), { ssr: false, loading: chartFallback })
const VolumeStream = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.VolumeStream), { ssr: false, loading: chartFallback })
const RpeCalendar = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.RpeCalendar), { ssr: false, loading: chartFallback })

/** Analytics view of the Progression tab — every performance & body chart plus
 * the weekly vitals grid, filterable by range and training era. */
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

      <div className="lg:hidden">
        <RangeSelector value={days} onChange={setDays} />
      </div>

      <div className="flex gap-4 items-start">
        <div className="hidden lg:block shrink-0 sticky top-6 self-start">
          <RangeSelector value={days} onChange={setDays} orientation="vertical" />
        </div>
        <div className="flex-1 min-w-0 space-y-6">
          <WidgetBoundary label="Charts" minHeight={280}>
            <div className="grid gap-6 lg:grid-cols-2">
              <WeightTrendChart data={wData} isLoading={weightLoading} showEraBoundary={era === 'all'} />
              <VolumeChart data={vData} isLoading={volumeLoading} era={era} />
              <MacroProgressChart data={mData} goals={goals ?? null} isLoading={macroLoading || goalsLoading} />
              <PRHistoryChart data={pData} isLoading={prLoading} />
            </div>
          </WidgetBoundary>

          <DeferredMount minHeight={480}>
            <WidgetBoundary label="Muscle analytics" minHeight={280}>
              <div>
                <h2 className="font-heading text-fluid-lg font-bold text-text mb-3">Muscle Analytics <span className="text-fluid-xs text-muted font-normal">Hevy-killer</span></h2>
                <div className="space-y-4">
                  <div className="grid lg:grid-cols-2 gap-4">
                    <BodyHeatmap days={days} era={era} />
                    <RpeCalendar days={days} era={era} />
                  </div>
                  <VolumeStream days={days} era={era} />
                  <MuscleAnalyticsSection days={days} era={era} />
                </div>
              </div>
            </WidgetBoundary>
          </DeferredMount>

          <DeferredMount minHeight={320}>
            <div className="flex items-center gap-2 pt-2">
              <HeartPulse className="w-4 h-4 text-primary" aria-hidden="true" />
              <h2 className="font-heading text-fluid-lg font-bold text-text">Weekly Vitals</h2>
              <span className="text-fluid-xs text-muted">this week vs last · 8-week trend</span>
            </div>
            <VitalsGroups />
          </DeferredMount>
        </div>
      </div>
    </div>
  )
}
