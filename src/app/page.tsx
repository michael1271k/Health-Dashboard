'use client'

import { Footprints, Flame, Droplets, Moon } from 'lucide-react'
import { BentoGrid, BentoCell } from '@/components/dashboard/BentoGrid'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
import {
  useTodayScore,
  useTodayMetrics,
  useTodayNutrition,
  useTodaySleep,
} from '@/lib/hooks/useDashboard'

function formatSleepHours(minutes: number | null): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function DashboardPage() {
  const { data: score, isLoading: scoreLoading } = useTodayScore()
  const { data: metrics, isLoading: metricsLoading } = useTodayMetrics()
  const { data: nutrition, isLoading: nutritionLoading } = useTodayNutrition()
  const { data: sleep, isLoading: sleepLoading } = useTodaySleep()

  const today = new Intl.DateTimeFormat('en-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-text">Dashboard</h1>
        <p className="text-muted-vital text-sm mt-0.5">{today}</p>
      </div>

      {/* Main bento grid */}
      <BentoGrid>
        {/* Score: 2 cols wide */}
        <BentoCell span={2} rowSpan={2}>
          <ScoreCard score={score ?? null} isLoading={scoreLoading} />
        </BentoCell>

        {/* Battery: 2 cols wide */}
        <BentoCell span={2} rowSpan={2}>
          <BatteryCard battery={score?.battery_pct ?? null} isLoading={scoreLoading} />
        </BentoCell>

        {/* Metric cards row */}
        <BentoCell span={1}>
          <MetricCard
            label="Steps"
            value={metrics?.steps?.toLocaleString() ?? null}
            icon={Footprints}
            iconColor="text-info"
            isLoading={metricsLoading}
          />
        </BentoCell>

        <BentoCell span={1}>
          <MetricCard
            label="Active Cal"
            value={metrics?.active_cal ?? null}
            unit="kcal"
            icon={Flame}
            iconColor="text-warn"
            isLoading={metricsLoading}
          />
        </BentoCell>

        <BentoCell span={1}>
          <MetricCard
            label="Sleep"
            value={formatSleepHours(sleep?.duration_min ?? null)}
            icon={Moon}
            iconColor="text-energy"
            subtext={sleep ? `${sleep.deep_min}m deep · ${sleep.rem_min}m REM` : undefined}
            isLoading={sleepLoading}
          />
        </BentoCell>

        <BentoCell span={1}>
          <MetricCard
            label="Protein"
            value={nutrition ? Math.round(nutrition.protein_g) : null}
            unit="g"
            icon={Droplets}
            iconColor="text-primary"
            isLoading={nutritionLoading}
          />
        </BentoCell>

        {/* Readiness card: full width */}
        <BentoCell span={4}>
          <ReadinessCard
            score={score ?? null}
            sleep={sleep ?? null}
            isLoading={scoreLoading || sleepLoading}
          />
        </BentoCell>
      </BentoGrid>
    </div>
  )
}
