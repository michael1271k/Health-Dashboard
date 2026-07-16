'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useWeightTrend, useMacroHistory, usePRHistory, useVolumeTrend } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { RangeSelector } from '@/components/charts/RangeSelector'
import { eraForDate } from '@/lib/programs'
import { DeferredMount } from '@/components/fx/DeferredMount'

const ERA_TABS = [['all', 'All', '#19E3B1'], ['axis', 'HELIX-5', '#3EE0FF'], ['ppl', 'PPL Legacy', '#8B97B2']] as const

// Dynamically import the recharts-heavy components (client-only) so they don't
// inflate the route's first-load JS.
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

export default function ChartsPage() {
  const [days, setDays] = useState(30) // 1 Month default
  const { data: weightData, isLoading: weightLoading } = useWeightTrend(days)
  const { data: volumeData, isLoading: volumeLoading } = useVolumeTrend(days)
  const { data: macroData, isLoading: macroLoading } = useMacroHistory(days)
  const { data: prData, isLoading: prLoading } = usePRHistory(undefined, days)
  const { data: goals, isLoading: goalsLoading } = useUserGoals()

  const [era, setEra] = useState<'all' | 'ppl' | 'axis'>('all')
  const inEra = (d: { date: string }) => era === 'all' || eraForDate(d.date) === era
  const wData = (weightData ?? []).filter(inEra)
  const vData = (volumeData ?? []).filter(inEra)
  const mData = (macroData ?? []).filter(inEra)
  const pData = (prData ?? []).filter(inEra)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Charts</h1>
        <p className="text-muted text-fluid-sm mt-0.5">Trends &amp; progress · filter by training era</p>
      </div>

      {/* Era filter (PPL Legacy vs AXIS) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-fluid-xs text-muted mr-1">Era:</span>
        {ERA_TABS.map(([k, label, color]) => {
          const active = era === k
          return (
            <button key={k} onClick={() => setEra(k)}
              className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold border transition-colors"
              style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#8B97B2', borderColor: 'transparent' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Mobile: horizontal range pills */}
      <div className="lg:hidden">
        <RangeSelector value={days} onChange={setDays} />
      </div>

      <div className="flex gap-4 items-start">
        {/* Desktop: sticky vertical glass range rail (top-aligned with the charts) */}
        <div className="hidden lg:block shrink-0 sticky top-6 self-start">
          <RangeSelector value={days} onChange={setDays} orientation="vertical" />
        </div>
        <div className="flex-1 min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <WeightTrendChart data={wData} isLoading={weightLoading} />
            <VolumeChart data={vData} isLoading={volumeLoading} era={era} />
            <MacroProgressChart
              data={mData}
              goals={goals ?? null}
              isLoading={macroLoading || goalsLoading}
            />
            <PRHistoryChart data={pData} isLoading={prLoading} />
          </div>
          <DeferredMount minHeight={480}>
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
          </DeferredMount>
        </div>
      </div>
    </div>
  )
}
