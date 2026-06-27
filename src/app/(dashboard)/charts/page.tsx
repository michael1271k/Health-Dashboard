'use client'

import dynamic from 'next/dynamic'
import { useWeightTrend, useMacroHistory, usePRHistory, useVolumeTrend } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'

// Dynamically import the recharts-heavy components (client-only) so they don't
// inflate the route's first-load JS.
const chartFallback = () => (
  <div className="vital-card h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const WeightTrendChart = dynamic(() => import('@/components/charts/WeightTrendChart').then((m) => m.WeightTrendChart), { ssr: false, loading: chartFallback })
const VolumeChart = dynamic(() => import('@/components/charts/VolumeChart').then((m) => m.VolumeChart), { ssr: false, loading: chartFallback })
const MacroProgressChart = dynamic(() => import('@/components/charts/MacroProgressChart').then((m) => m.MacroProgressChart), { ssr: false, loading: chartFallback })
const PRHistoryChart = dynamic(() => import('@/components/charts/PRHistoryChart').then((m) => m.PRHistoryChart), { ssr: false, loading: chartFallback })

export default function ChartsPage() {
  const { data: weightData, isLoading: weightLoading } = useWeightTrend(90)
  const { data: volumeData, isLoading: volumeLoading } = useVolumeTrend(90)
  const { data: macroData, isLoading: macroLoading } = useMacroHistory(14)
  const { data: prData, isLoading: prLoading } = usePRHistory(undefined, 60)
  const { data: goals, isLoading: goalsLoading } = useUserGoals()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text">Charts</h1>
        <p className="text-muted-vital text-sm mt-0.5">Trends &amp; progress over time</p>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <WeightTrendChart data={weightData ?? []} isLoading={weightLoading} />
        <VolumeChart data={volumeData ?? []} isLoading={volumeLoading} />
        <MacroProgressChart
          data={macroData ?? []}
          goals={goals ?? null}
          isLoading={macroLoading || goalsLoading}
        />
        <PRHistoryChart data={prData ?? []} isLoading={prLoading} />
      </div>
    </div>
  )
}
