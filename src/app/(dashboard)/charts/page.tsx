'use client'

import { WeightTrendChart } from '@/components/charts/WeightTrendChart'
import { MacroProgressChart } from '@/components/charts/MacroProgressChart'
import { PRHistoryChart } from '@/components/charts/PRHistoryChart'
import { useWeightTrend, useMacroHistory, usePRHistory } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'

export default function ChartsPage() {
  const { data: weightData, isLoading: weightLoading } = useWeightTrend(30)
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
        <MacroProgressChart
          data={macroData ?? []}
          goals={goals ?? null}
          isLoading={macroLoading || goalsLoading}
        />
        <div className="lg:col-span-2">
          <PRHistoryChart data={prData ?? []} isLoading={prLoading} />
        </div>
      </div>
    </div>
  )
}
