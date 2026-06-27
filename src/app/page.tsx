'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { HeartPulse, Activity, Scale, Dumbbell } from 'lucide-react'
import { BentoGrid, BentoCell } from '@/components/dashboard/BentoGrid'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'
import { DomainWidget } from '@/components/dashboard/DomainWidget'
import { StatTile } from '@/components/dashboard/StatTile'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { Greeting } from '@/components/dashboard/Greeting'
import { formatSleep, mlToL } from '@/lib/utils/format'
import {
  useTodayScore,
  useTodayDailyLog,
  useTodayMetrics,
  useTodayNutrition,
  useTodaySleep,
  useUserGoals,
  useRecentSessions,
} from '@/lib/hooks/useDashboard'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

// Accent hexes (mirrors the @theme tokens in globals.css)
const VIOLET = '#7C5CFF'
const BLUE = '#3D7DFF'
const TEAL = '#2DD4A7'
const CYAN = '#38BDF8'

const n1 = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : Number(v).toFixed(1)
const n0 = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.round(v)

export default function DashboardPage() {
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/auth')
    })
  }, [router])

  const { data: score, isLoading: scoreLoading } = useTodayScore()
  const { data: log, isLoading: logLoading } = useTodayDailyLog()
  const { data: metrics, isLoading: metricsLoading } = useTodayMetrics()
  const { data: nutrition, isLoading: nutritionLoading } = useTodayNutrition()
  const { data: sleep, isLoading: sleepLoading } = useTodaySleep()
  const { data: goals } = useUserGoals()
  const { data: sessions } = useRecentSessions(5)

  const today = new Intl.DateTimeFormat('en-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())

  // ── Derived values (daily_logs is the richest single source; fall back to fan-out tables) ──
  const sleepMin = log?.sleep_minutes ?? sleep?.duration_min ?? null
  const restHr = log?.avg_rest_heart_rate ?? metrics?.rest_hr ?? null
  const steps = log?.steps ?? metrics?.steps ?? null
  const activeKcal = n0(log?.active_energy ?? metrics?.active_cal ?? null)

  const recoveryLoading = logLoading || sleepLoading
  const activityLoading = logLoading || metricsLoading

  // Last real workout (seeds already filtered out of useWorkoutHistory; recent sessions are raw)
  const lastSession = (sessions ?? []).find((s) => !s.notes?.startsWith('__seed_')) ?? null
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null
  const lastSessionDate = lastSession
    ? new Date(lastSession.started_at).toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })
    : undefined

  const calGoal = goals?.calorie_goal ?? null
  const calToday = nutrition?.calories ?? null
  const calPct = calGoal && calToday != null ? Math.round((calToday / calGoal) * 100) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <Greeting />
        <p className="text-muted-vital text-sm">{today}</p>
      </div>

      {/* Hero: Score + Battery */}
      <BentoGrid>
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
      </BentoGrid>

      {/* 2×2 domain widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1 — Recovery & Sleep */}
        <AnimatedCard index={2}>
          <DomainWidget title="Recovery & Sleep" icon={HeartPulse} accent={VIOLET}>
            <StatTile label="Sleep" value={formatSleep(sleepMin)} accent={VIOLET} isLoading={recoveryLoading} />
            <StatTile label="Resting HR" value={restHr} unit="bpm" isLoading={recoveryLoading} />
            <StatTile label="Respiratory" value={n1(log?.respiratory_rate)} unit="br/min" isLoading={logLoading} />
            <StatTile label="Blood O₂" value={n0(log?.blood_oxygen)} unit="%" isLoading={logLoading} />
          </DomainWidget>
        </AnimatedCard>

        {/* 2 — Daily Activity */}
        <AnimatedCard index={3}>
          <DomainWidget title="Daily Activity" icon={Activity} accent={BLUE}>
            <StatTile label="Steps" value={steps?.toLocaleString() ?? null} accent={BLUE} isLoading={activityLoading} />
            <StatTile label="Active Energy" value={activeKcal} unit="kcal" isLoading={activityLoading} />
            <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" isLoading={logLoading} />
            <StatTile label="Training" value={log?.training_minutes} unit="min" isLoading={logLoading} />
          </DomainWidget>
        </AnimatedCard>

        {/* 3 — Body Composition */}
        <AnimatedCard index={4}>
          <DomainWidget title="Body Composition" icon={Scale} accent={TEAL}>
            <StatTile label="Weight" value={n1(log?.weight_kg)} unit="kg" accent={TEAL} isLoading={logLoading} />
            <StatTile label="BMI" value={n1(log?.bmi)} isLoading={logLoading} />
            <StatTile label="Lean Mass" value={n1(log?.lean_mass_kg)} unit="kg" isLoading={logLoading} />
            <StatTile label="Body Fat" value={n1(log?.body_fat_pct)} unit="%" isLoading={logLoading} />
            {log?.muscle_percent != null && <StatTile label="Muscle" value={n1(log.muscle_percent)} unit="%" />}
            {log?.water_percent != null && <StatTile label="Water" value={n1(log.water_percent)} unit="%" />}
            {log?.visceral_fat != null && <StatTile label="Visceral" value={n1(log.visceral_fat)} />}
            {log?.bmr != null && <StatTile label="BMR" value={n0(log.bmr)} unit="kcal" />}
          </DomainWidget>
        </AnimatedCard>

        {/* 4 — Gym & Nutrition */}
        <AnimatedCard index={5}>
          <DomainWidget
            title="Gym & Nutrition"
            icon={Dumbbell}
            accent={CYAN}
            footer={
              calToday != null && calGoal
                ? <>Calories: <span className="text-text">{calToday.toLocaleString()}</span> / {calGoal.toLocaleString()} kcal · {calPct}%{goals?.goal_preset ? <span className="capitalize"> · {goals.goal_preset}</span> : null}</>
                : undefined
            }
          >
            <StatTile
              label="Last Workout"
              value={lastSplit?.label ?? null}
              sub={lastSessionDate}
              accent={lastSplit?.color ?? CYAN}
            />
            <StatTile
              label="Volume"
              value={n0(lastSession?.total_volume_kg)}
              unit="kg"
            />
            <StatTile label="Protein" value={n0(nutrition?.protein_g)} unit="g" isLoading={nutritionLoading} />
            <StatTile label="Carbs" value={n0(nutrition?.carbs_g)} unit="g" isLoading={nutritionLoading} />
          </DomainWidget>
        </AnimatedCard>
      </div>

      {/* Readiness + Weekly review */}
      <AnimatedCard index={6}>
        <ReadinessCard
          score={score ?? null}
          sleep={sleep ?? null}
          isLoading={scoreLoading || sleepLoading}
        />
      </AnimatedCard>

      <AnimatedCard index={7}>
        <WeeklyReviewCard />
      </AnimatedCard>
    </div>
  )
}
