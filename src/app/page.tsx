'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Footprints, Flame, Droplets, Moon } from 'lucide-react'
import { BentoGrid, BentoCell } from '@/components/dashboard/BentoGrid'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { Greeting } from '@/components/dashboard/Greeting'
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
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/auth')
      }
    })
  }, [router])

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
      <div className="flex flex-col gap-0.5">
        <Greeting />
        <p className="text-muted-vital text-sm">{today}</p>
      </div>

      {/* Main bento grid */}
      <BentoGrid>
        {/* Score + Battery: equal-height pair in a 2-col sub-grid */}
        <BentoCell span={4}>
          <div className="grid grid-cols-2 gap-4 items-stretch h-full">
            <AnimatedCard index={0}>
              <ScoreCard score={score ?? null} isLoading={scoreLoading} />
            </AnimatedCard>
            <AnimatedCard index={1}>
              <BatteryCard battery={score?.battery_pct ?? null} isLoading={scoreLoading} />
            </AnimatedCard>
          </div>
        </BentoCell>

        {/* Metric cards row */}
        <BentoCell span={1}>
          <AnimatedCard index={2}>
            <MetricCard
              label="Steps"
              value={metrics?.steps?.toLocaleString() ?? null}
              icon={Footprints}
              iconColor="text-info"
              isLoading={metricsLoading}
            />
          </AnimatedCard>
        </BentoCell>

        <BentoCell span={1}>
          <AnimatedCard index={3}>
            <MetricCard
              label="Active Cal"
              value={metrics?.active_cal ?? null}
              unit="kcal"
              icon={Flame}
              iconColor="text-warn"
              isLoading={metricsLoading}
            />
          </AnimatedCard>
        </BentoCell>

        <BentoCell span={1}>
          <AnimatedCard index={4}>
            <MetricCard
              label="Sleep"
              value={formatSleepHours(sleep?.duration_min ?? null)}
              icon={Moon}
              iconColor="text-energy"
              subtext={sleep ? `${sleep.deep_min}m deep · ${sleep.rem_min}m REM` : undefined}
              isLoading={sleepLoading}
            />
          </AnimatedCard>
        </BentoCell>

        <BentoCell span={1}>
          <AnimatedCard index={5}>
            <MetricCard
              label="Protein"
              value={nutrition ? Math.round(nutrition.protein_g) : null}
              unit="g"
              icon={Droplets}
              iconColor="text-primary"
              isLoading={nutritionLoading}
            />
          </AnimatedCard>
        </BentoCell>

        {/* Readiness card: full width */}
        <BentoCell span={4}>
          <AnimatedCard index={6}>
            <ReadinessCard
              score={score ?? null}
              sleep={sleep ?? null}
              isLoading={scoreLoading || sleepLoading}
            />
          </AnimatedCard>
        </BentoCell>

        {/* Weekly Review: full width */}
        <BentoCell span={4}>
          <AnimatedCard index={7}>
            <WeeklyReviewCard />
          </AnimatedCard>
        </BentoCell>
      </BentoGrid>
    </div>
  )
}
