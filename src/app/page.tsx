'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { HeartPulse, Activity, Scale, Dumbbell, Plus } from 'lucide-react'
import { Fab } from '@/components/ui/Fab'
import { Sheet } from '@/components/ui/Sheet'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { getTodaysSplit } from '@/lib/types/workout'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'

// Desktop-only trends sidecar — recharts lazy-loads as a deferred chunk so it
// never weighs down the mobile first-load.
const TrendStrip = dynamic(
  () => import('@/components/dashboard/TrendStrip').then((m) => ({ default: m.TrendStrip })),
  { ssr: false, loading: () => <div className="vital-card min-h-[280px] animate-pulse" /> },
)
import { DomainWidget } from '@/components/dashboard/DomainWidget'
import { StatTile } from '@/components/dashboard/StatTile'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { WidgetDeck, type DeckItem } from '@/components/ui/WidgetDeck'
import { formatSleep, mlToL, formatRelativeTime } from '@/lib/utils/format'
import {
  useTodayScore,
  useEnsureTodayScore,
  useTodayDailyLog,
  useTodayMetrics,
  useTodayNutrition,
  useTodaySleep,
  useUserGoals,
  useRecentSessions,
} from '@/lib/hooks/useDashboard'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

// Midnight Luxe accents
const VIOLET = '#8B7BFF'
const BLUE = '#6D5BFF'
const TEAL = '#19E3B1'
const CYAN = '#5AD7FF'

const n1 = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : Number(v).toFixed(1)
const n0 = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.round(v)

export default function DashboardPage() {
  const router = useRouter()
  const [logOpen, setLogOpen] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/auth')
    })
  }, [router])

  const todaySplit = getTodaysSplit()
  const logSplit = todaySplit === 'rest' ? 'push' : todaySplit

  const { data: score, isLoading: scoreLoading } = useTodayScore()
  // Compute today's score once if it doesn't exist yet (fixes the "0%" battery).
  useEnsureTodayScore(!scoreLoading && score === null)

  const { data: log, isLoading: logLoading } = useTodayDailyLog()
  const { data: metrics, isLoading: metricsLoading } = useTodayMetrics()
  const { data: nutrition, isLoading: nutritionLoading } = useTodayNutrition()
  const { data: sleep, isLoading: sleepLoading } = useTodaySleep()
  const { data: goals } = useUserGoals()
  const { data: sessions } = useRecentSessions(5)

  // Derived (daily_logs is the richest source; fall back to fan-out tables)
  const sleepMin = log?.sleep_minutes ?? sleep?.duration_min ?? null
  const restHr = log?.avg_rest_heart_rate ?? metrics?.rest_hr ?? null
  const steps = log?.steps ?? metrics?.steps ?? null
  const activeKcal = n0(log?.active_energy ?? metrics?.active_cal ?? null)
  const recoveryLoading = logLoading || sleepLoading
  const activityLoading = logLoading || metricsLoading

  const lastSession = (sessions ?? []).find((s) => !s.notes?.startsWith('__seed_')) ?? null
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null
  const lastSessionDate = lastSession
    ? new Date(lastSession.started_at).toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })
    : undefined

  const calGoal = goals?.calorie_goal ?? null
  const calToday = nutrition?.calories ?? null
  const calPct = calGoal && calToday != null ? Math.round((calToday / calGoal) * 100) : null

  // ── Build the four domain widgets once; reused by mobile deck + desktop grid ──
  const widgets: Array<{ id: string; label: string; icon: typeof HeartPulse; node: React.ReactNode }> = [
    {
      id: 'recovery', label: 'Recovery', icon: HeartPulse,
      node: (
        <DomainWidget title="Recovery & Sleep" icon={HeartPulse} accent={VIOLET}>
          <StatTile label="Sleep" value={formatSleep(sleepMin)} accent={VIOLET} isLoading={recoveryLoading} />
          <StatTile label="Resting HR" value={restHr} unit="bpm" isLoading={recoveryLoading} />
          <StatTile label="Respiratory" value={n1(log?.respiratory_rate)} unit="br/min" isLoading={logLoading} />
          <StatTile label="Blood O₂" value={n0(log?.blood_oxygen)} unit="%" isLoading={logLoading} />
        </DomainWidget>
      ),
    },
    {
      id: 'activity', label: 'Activity', icon: Activity,
      node: (
        <DomainWidget title="Daily Activity" icon={Activity} accent={BLUE}>
          <StatTile label="Steps" value={steps?.toLocaleString() ?? null} accent={BLUE} isLoading={activityLoading} />
          <StatTile label="Active Energy" value={activeKcal} unit="kcal" isLoading={activityLoading} />
          <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" isLoading={logLoading} />
          <StatTile label="Training" value={log?.training_minutes} unit="min" isLoading={logLoading} />
        </DomainWidget>
      ),
    },
    {
      id: 'body', label: 'Body', icon: Scale,
      node: (
        <DomainWidget
          title="Body Composition" icon={Scale} accent={TEAL}
          footer={log?.updated_at ? <>Updated {formatRelativeTime(log.updated_at)}</> : undefined}
        >
          <StatTile label="Weight" value={n1(log?.weight_kg)} unit="kg" accent={TEAL} isLoading={logLoading} />
          <StatTile label="BMI" value={n1(log?.bmi)} isLoading={logLoading} />
          <StatTile label="Lean Mass" value={n1(log?.lean_mass_kg)} unit="kg" isLoading={logLoading} />
          <StatTile label="Body Fat" value={n1(log?.body_fat_pct)} unit="%" isLoading={logLoading} />
          {log?.muscle_percent != null && <StatTile label="Muscle" value={n1(log.muscle_percent)} unit="%" />}
          {log?.water_percent != null && <StatTile label="Water" value={n1(log.water_percent)} unit="%" />}
          {log?.visceral_fat != null && <StatTile label="Visceral" value={n1(log.visceral_fat)} />}
          {log?.bmr != null && <StatTile label="BMR" value={n0(log.bmr)} unit="kcal" />}
        </DomainWidget>
      ),
    },
    {
      id: 'gym', label: 'Gym', icon: Dumbbell,
      node: (
        <DomainWidget
          title="Gym & Nutrition" icon={Dumbbell} accent={CYAN}
          footer={
            calToday != null && calGoal
              ? <>Calories: <span className="text-text">{calToday.toLocaleString()}</span> / {calGoal.toLocaleString()} kcal · {calPct}%{goals?.goal_preset ? <span className="capitalize"> · {goals.goal_preset}</span> : null}</>
              : undefined
          }
        >
          <StatTile label="Last Workout" value={lastSplit?.label ?? null} sub={lastSessionDate} accent={lastSplit?.color ?? CYAN} />
          <StatTile label="Volume" value={n0(lastSession?.total_volume_kg)} unit="kg" />
          <StatTile label="Protein" value={n0(nutrition?.protein_g)} unit="g" isLoading={nutritionLoading} />
          <StatTile label="Carbs" value={n0(nutrition?.carbs_g)} unit="g" isLoading={nutritionLoading} />
        </DomainWidget>
      ),
    },
  ]

  const deckItems: DeckItem[] = widgets.map((w) => ({ id: w.id, label: w.label, icon: w.icon, content: w.node }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <BrandHeader />

      {/* Command-center hero: stacks on mobile, pairs on sm, gains a trends column on xl */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1.3fr]">
        <AnimatedCard index={0}><ScoreCard score={score ?? null} isLoading={scoreLoading} /></AnimatedCard>
        <AnimatedCard index={1}><BatteryCard battery={score?.battery_pct ?? null} sleepScore={score?.sleep_score ?? null} recoveryScore={score?.recovery_score ?? null} isLoading={scoreLoading} /></AnimatedCard>
        <div className="hidden xl:block"><AnimatedCard index={2}><TrendStrip /></AnimatedCard></div>
      </div>

      {/* Mobile: swipeable widget deck */}
      <div className="md:hidden">
        <WidgetDeck items={deckItems} />
      </div>

      {/* Desktop/tablet: 2×2 widget grid */}
      <div className="hidden md:grid grid-cols-2 gap-4">
        {widgets.map((w, i) => (
          <AnimatedCard key={w.id} index={i + 2}>{w.node}</AnimatedCard>
        ))}
      </div>

      {/* Insight Coach + Weekly review */}
      <AnimatedCard index={6}>
        <InsightCoach />
      </AnimatedCard>
      <AnimatedCard index={7}>
        <WeeklyReviewCard />
      </AnimatedCard>

      {/* Thumb-reachable quick-log (mobile) */}
      <Fab icon={Plus} label="Log" onClick={() => setLogOpen(true)} />
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Quick Log">
        <WorkoutChat splitDay={logSplit} onClose={() => setLogOpen(false)} />
      </Sheet>
    </div>
  )
}
