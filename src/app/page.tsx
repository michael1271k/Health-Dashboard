'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { HeartPulse, Activity, Scale, Dumbbell, Salad, Pill, Plus } from 'lucide-react'
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
import { MasonryDashboard, type MasonryTile } from '@/components/dashboard/MasonryDashboard'
import { StatTile } from '@/components/dashboard/StatTile'
import { SupplementChecklist } from '@/components/dashboard/SupplementChecklist'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { TOTAL_SUPPLEMENTS } from '@/lib/supplements'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { formatSleep, mlToL } from '@/lib/utils/format'
import { displayWeight, weightUnit } from '@/lib/utils/units'
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

// Cyber Mint domain accents
const VIOLET = '#43F59B' // Recovery — mint green
const BLUE = '#4FC3FF'   // Activity — aqua-blue
const TEAL = '#19E3D0'   // Body — teal
const CYAN = '#38E1FF'   // Gym — cyan
const GOLD = '#E8C57A'   // Nutrition — warm gold
const SUPP = '#7C8CFF'   // Supplements — indigo

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
  // Recompute the time-of-day battery on mount + visibility (and backfill the week).
  useEnsureTodayScore()

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

  // ── Domains: masonry tiles on mobile (Gym & Nutrition distinct), grid on desktop ──
  const domains: Array<{ id: string; title: string; icon: typeof HeartPulse; accent: string; headline: React.ReactNode; sub?: React.ReactNode; footer?: React.ReactNode; tiles: React.ReactNode }> = [
    {
      id: 'recovery', title: 'Recovery', icon: HeartPulse, accent: VIOLET,
      headline: formatSleep(sleepMin),
      sub: restHr != null ? `RHR ${restHr} bpm` : 'sleep & recovery',
      tiles: (<>
        <StatTile label="Sleep" value={formatSleep(sleepMin)} accent={VIOLET} isLoading={recoveryLoading} />
        <StatTile label="Resting HR" value={restHr} unit="bpm" isLoading={recoveryLoading} />
        <StatTile label="Respiratory" value={n1(log?.respiratory_rate)} unit="br/min" isLoading={logLoading} />
        <StatTile label="Blood O₂" value={n0(log?.blood_oxygen)} unit="%" isLoading={logLoading} />
      </>),
    },
    {
      id: 'activity', title: 'Activity', icon: Activity, accent: BLUE,
      headline: steps?.toLocaleString() ?? '—',
      sub: activeKcal != null ? `${activeKcal} active kcal` : 'steps & energy',
      tiles: (<>
        <StatTile label="Steps" value={steps?.toLocaleString() ?? null} accent={BLUE} isLoading={activityLoading} />
        <StatTile label="Active Energy" value={activeKcal} unit="kcal" isLoading={activityLoading} />
        <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" isLoading={logLoading} />
        <StatTile label="Training" value={log?.training_minutes} unit="min" isLoading={logLoading} />
      </>),
    },
    {
      id: 'body', title: 'Body', icon: Scale, accent: TEAL,
      headline: <>{displayWeight(log?.weight_kg) ?? '—'}{log?.weight_kg != null && <span className="text-fluid-sm"> {weightUnit()}</span>}</>,
      sub: log?.body_fat_pct != null ? `${n1(log.body_fat_pct)}% body fat` : 'composition',
      footer: log?.date && log?.weight_kg != null
        ? <>Weighed in {new Date(log.date + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })}</>
        : undefined,
      tiles: (<>
        <StatTile label="Weight" value={displayWeight(log?.weight_kg)} unit={weightUnit()} accent={TEAL} isLoading={logLoading} />
        <StatTile label="BMI" value={n1(log?.bmi)} isLoading={logLoading} />
        <StatTile label="Lean Mass" value={displayWeight(log?.lean_mass_kg)} unit={weightUnit()} isLoading={logLoading} />
        <StatTile label="Body Fat" value={n1(log?.body_fat_pct)} unit="%" isLoading={logLoading} />
        {log?.muscle_percent != null && <StatTile label="Muscle" value={n1(log.muscle_percent)} unit="%" />}
        {log?.water_percent != null && <StatTile label="Water" value={n1(log.water_percent)} unit="%" />}
        {log?.visceral_fat != null && <StatTile label="Visceral" value={n1(log.visceral_fat)} />}
        {log?.bmr != null && <StatTile label="BMR" value={n0(log.bmr)} unit="kcal" />}
      </>),
    },
    {
      id: 'gym', title: 'Gym', icon: Dumbbell, accent: CYAN,
      headline: <span style={{ color: lastSplit?.color ?? CYAN }}>{lastSplit?.label ?? '—'}</span>,
      sub: lastSession?.total_volume_kg != null ? `${n0(lastSession.total_volume_kg)?.toLocaleString()} kg · ${lastSessionDate ?? ''}` : 'last session',
      tiles: (<>
        <StatTile label="Last Workout" value={lastSplit?.label ?? null} sub={lastSessionDate} accent={lastSplit?.color ?? CYAN} />
        <StatTile label="Volume" value={n0(lastSession?.total_volume_kg)} unit="kg" />
        <StatTile label="Split" value={lastSplit?.label ?? null} accent={lastSplit?.color ?? CYAN} />
        <StatTile label="When" value={lastSessionDate ?? null} />
      </>),
    },
    {
      id: 'nutrition', title: 'Nutrition', icon: Salad, accent: GOLD,
      headline: <>{calToday?.toLocaleString() ?? '—'}{calToday != null && <span className="text-fluid-sm"> kcal</span>}</>,
      sub: calGoal && calPct != null ? `${calPct}% of goal` : 'macros',
      footer: calToday != null && calGoal
        ? <>Calories: <span className="text-text">{calToday.toLocaleString()}</span> / {calGoal.toLocaleString()} kcal · {calPct}%{goals?.goal_preset ? <span className="capitalize"> · {goals.goal_preset}</span> : null}</>
        : undefined,
      tiles: (<>
        <StatTile label="Calories" value={calToday} unit="kcal" accent={GOLD} isLoading={nutritionLoading} />
        <StatTile label="Protein" value={n0(nutrition?.protein_g)} unit="g" isLoading={nutritionLoading} />
        <StatTile label="Carbs" value={n0(nutrition?.carbs_g)} unit="g" isLoading={nutritionLoading} />
        <StatTile label="Fats" value={n0(nutrition?.fat_g)} unit="g" isLoading={nutritionLoading} />
      </>),
    },
  ]

  const { data: takenSupps } = useSupplements()
  const suppCount = takenSupps?.size ?? 0

  const masonryTiles: MasonryTile[] = [
    ...domains.map((d) => ({
      id: d.id, title: d.title, icon: d.icon, accent: d.accent,
      headline: d.headline, sub: d.sub, footer: d.footer,
      detail: <div className="grid grid-cols-2 gap-2.5">{d.tiles}</div>,
    })),
    {
      id: 'supplements', title: 'Supplements', icon: Pill, accent: SUPP,
      headline: <>{suppCount}<span className="text-fluid-sm text-muted-vital">/{TOTAL_SUPPLEMENTS}</span></>,
      sub: suppCount >= TOTAL_SUPPLEMENTS ? 'all taken ✓' : 'tap to check off',
      detail: <SupplementChecklist />,
    },
  ]

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

      {/* Mobile: fluid masonry hub (Gym & Nutrition are distinct tiles) */}
      <div className="md:hidden">
        <MasonryDashboard tiles={masonryTiles} />
      </div>

      {/* Desktop/tablet: deliberate bento — Body + Supplements span full width */}
      <div className="hidden md:grid grid-cols-2 gap-4">
        {domains.map((d, i) => (
          <div key={d.id} className={d.id === 'body' ? 'col-span-2' : ''}>
            <AnimatedCard index={i + 2}>
              <DomainWidget title={d.title} icon={d.icon} accent={d.accent} footer={d.footer}>{d.tiles}</DomainWidget>
            </AnimatedCard>
          </div>
        ))}
        <div className="col-span-2">
          <AnimatedCard index={7}>
            <div className="vital-card">
              <h2 className="font-heading font-semibold text-text flex items-center gap-2 mb-3">
                <Pill className="w-4 h-4" style={{ color: SUPP }} /> Supplement Protocol
                <span className="text-fluid-xs text-muted-vital font-normal">{suppCount}/{TOTAL_SUPPLEMENTS} today</span>
              </h2>
              <SupplementChecklist />
            </div>
          </AnimatedCard>
        </div>
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
