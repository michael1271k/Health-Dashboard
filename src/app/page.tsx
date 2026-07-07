'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Moon, Flame, Dumbbell, Scale, Footprints, Pill, Plus } from 'lucide-react'
import { Fab } from '@/components/ui/Fab'
import { Sheet } from '@/components/ui/Sheet'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { BioStrip, type BioStripProps } from '@/components/dashboard/BioStrip'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'
import { StatTile } from '@/components/dashboard/StatTile'
import { SupplementChecklist } from '@/components/dashboard/SupplementChecklist'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { formatSleep, mlToL } from '@/lib/utils/format'
import { displayWeight, weightUnit, validWeight } from '@/lib/utils/units'
import { PHASE_META } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { logicalTodayISO } from '@/lib/utils/day'
import { scheduleDayFor, daySplitEnum, type ScheduleDay } from '@/lib/programs'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { TOTAL_SUPPLEMENTS } from '@/lib/supplements'
import { useBioSeries } from '@/lib/hooks/useBioStrips'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
import {
  useTodayScore,
  useEnsureTodayScore,
  useTodayDailyLog,
  useTodayMetrics,
  useTodayNutrition,
  useUserGoals,
  useRecentSessions,
} from '@/lib/hooks/useDashboard'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

const TrendStrip = dynamic(
  () => import('@/components/dashboard/TrendStrip').then((m) => ({ default: m.TrendStrip })),
  { ssr: false, loading: () => <div className="helix-card min-h-[280px] animate-pulse" /> },
)

// Bioluminescence domain accents
const VIOLET = '#8B7CFF' // Sleep / recovery
const EMBER = '#FFB86B'  // Fuel
const CYAN = '#3EE0FF'   // Train
const TEAL = '#16F5C3'   // Body
const AQUA = '#4FC3FF'   // Steps
const GOLD = '#E8C57A'   // Stack

const n0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const n1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | null

export default function DashboardPage() {
  useEnsureTodayScore()
  const { data: score, isLoading: scoreLoading } = useTodayScore()
  const { data: log, isLoading: logLoading } = useTodayDailyLog()
  const { data: metrics } = useTodayMetrics()
  const { data: nutrition, isLoading: nutritionLoading } = useTodayNutrition()
  const { data: goals } = useUserGoals()
  const { data: sessions } = useRecentSessions(3)
  const { data: taken } = useSupplements()
  const { data: bioSeries } = useBioSeries()
  const { data: fuelLogs } = useDailyLogs(8)

  const [open, setOpen] = useState<SheetKey>(null)
  const [logOpen, setLogOpen] = useState(false)

  // Today's scheduled training day — ERA-AWARE (PPL before Jul 19, HELIX-5 after),
  // shared with the Insight Coach so the whole app agrees.
  const todayDay: ScheduleDay | 'rest' = useMemo(() => scheduleDayFor(logicalTodayISO()), [])

  const lastSession = sessions?.[0]
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null
  const steps = metrics?.steps ?? log?.steps ?? null
  const calToday = nutrition?.calories != null ? Math.round(nutrition.calories) : null
  const calGoal = goals?.calorie_goal ?? null
  const phase = fuelLogs?.[0]?.date === logicalTodayISO() ? fuelLogs[0].phase : null
  const suppCount = taken?.size ?? 0
  const unit = weightUnit()

  // Sparkline series (ascending 7d)
  const kcalSeries = useMemo(() => {
    const asc = [...(fuelLogs ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    return asc.map((d) => d.calories)
  }, [fuelLogs])
  const weightWoW = useMemo(() => {
    const w = (bioSeries ?? []).map((d) => d.weightKg).filter((v): v is number => v != null)
    if (w.length < 4) return null
    const half = Math.floor(w.length / 2)
    return Math.round((avg(w.slice(half)) - avg(w.slice(0, half))) * 100) / 100
  }, [bioSeries])

  const strips: Array<BioStripProps & { key: Exclude<SheetKey, null> }> = [
    {
      key: 'sleep', icon: Moon, label: 'Sleep', accent: VIOLET,
      value: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null,
      status: log?.avg_rest_heart_rate != null ? `RHR ${log.avg_rest_heart_rate} bpm` : 'recovery',
      series: (bioSeries ?? []).map((d) => d.sleepMin),
    },
    {
      key: 'fuel', icon: Flame, label: 'Fuel', accent: EMBER,
      value: calToday, unit: 'kcal',
      status: phase
        ? <span style={{ color: PHASE_META[phase].color }}>{PHASE_META[phase].label} day{calGoal ? ` · goal ${calGoal.toLocaleString()}` : ''}</span>
        : calGoal ? `goal ${calGoal.toLocaleString()}` : 'no log yet',
      series: kcalSeries,
    },
    {
      key: 'train', icon: Dumbbell, label: 'Train', accent: CYAN,
      value: todayDay === 'rest' ? 'Zone-2 / Rest' : todayDay.label,
      status: todayDay !== 'rest' && todayDay.sub
        ? todayDay.sub
        : lastSession?.total_volume_kg != null
          ? `last: ${lastSplit?.label ?? ''} · ${Math.round(displayWeight(lastSession.total_volume_kg) ?? 0).toLocaleString()} ${unit}`
          : 'no sessions yet',
    },
    {
      key: 'body', icon: Scale, label: 'Body', accent: TEAL,
      value: displayWeight(validWeight(log?.weight_kg)), unit,
      status: weightWoW != null
        ? <span className={weightWoW <= 0 ? 'text-success' : 'text-warn'}>{weightWoW > 0 ? '+' : ''}{weightWoW} {unit}/wk (7-day avg)</span>
        : log?.body_fat_pct != null ? `${n1(log.body_fat_pct)}% body fat` : 'composition',
      series: (bioSeries ?? []).map((d) => displayWeight(d.weightKg)),
    },
    {
      key: 'steps', icon: Footprints, label: 'Steps', accent: AQUA,
      value: steps,
      status: log?.active_energy != null ? `${n0(log.active_energy)} active kcal` : 'movement',
      series: (bioSeries ?? []).map((d) => d.steps),
    },
    {
      key: 'stack', icon: Pill, label: 'Stack', accent: GOLD,
      value: `${suppCount}/${TOTAL_SUPPLEMENTS}`,
      status: suppCount >= TOTAL_SUPPLEMENTS ? 'protocol complete ✓' : 'tap to check off',
    },
  ]

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Training',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
  }

  return (
    <div className="space-y-6">
      <BrandHeader />

      {/* ── Bio-Command hero: breathing orb + live strips ── */}
      <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-start">
        <AnimatedCard index={0}>
          <button onClick={() => setOpen('readiness')} className="block mx-auto" aria-label="Open readiness details">
            <ReadinessOrb score={score ?? null} isLoading={scoreLoading} />
          </button>
        </AnimatedCard>
        <div className="space-y-2.5">
          {strips.map((s, i) => (
            <AnimatedCard key={s.key} index={i + 1}>
              <BioStrip {...s} onClick={() => setOpen(s.key)} />
            </AnimatedCard>
          ))}
        </div>
      </div>

      {/* Desktop trends sidecar */}
      <div className="hidden xl:block"><AnimatedCard index={7}><TrendStrip /></AnimatedCard></div>

      <AnimatedCard index={8}><InsightCoach /></AnimatedCard>
      <AnimatedCard index={9}><WeeklyReviewCard /></AnimatedCard>

      {/* ── Domain detail sheet ── */}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? sheetTitle[open] : undefined}>
        {open === 'readiness' && (
          <div className="space-y-4">
            <ScoreCard score={score ?? null} />
            <BatteryCard battery={score?.battery_pct ?? null} />
          </div>
        )}
        {open === 'sleep' && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Sleep" value={log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null} accent={VIOLET} isLoading={logLoading} />
            <StatTile label="Resting HR" value={log?.avg_rest_heart_rate} unit="bpm" isLoading={logLoading} />
            <StatTile label="Respiratory" value={n1(log?.respiratory_rate)} unit="br/min" isLoading={logLoading} />
            <StatTile label="Blood O₂" value={n0(log?.blood_oxygen)} unit="%" isLoading={logLoading} />
          </div>
        )}
        {open === 'fuel' && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Calories" value={calToday} unit="kcal" accent={MACRO_COLORS.calories} isLoading={nutritionLoading} />
            <StatTile label="Protein" value={n0(nutrition?.protein_g)} unit="g" accent={MACRO_COLORS.protein} isLoading={nutritionLoading} />
            <StatTile label="Carbs" value={n0(nutrition?.carbs_g)} unit="g" accent={MACRO_COLORS.carbs} isLoading={nutritionLoading} />
            <StatTile label="Fats" value={n0(nutrition?.fat_g)} unit="g" accent={MACRO_COLORS.fat} isLoading={nutritionLoading} />
          </div>
        )}
        {open === 'train' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile label="Today" value={todayDay === 'rest' ? 'Zone-2 / Rest' : todayDay.label} sub={todayDay !== 'rest' ? todayDay.sub : undefined} accent={CYAN} />
              <StatTile label="Last Volume" value={n0(displayWeight(lastSession?.total_volume_kg ?? null))} unit={unit} />
            </div>
            <button onClick={() => { setOpen(null); setLogOpen(true) }} className="btn-glass w-full justify-center">
              <Plus className="w-4 h-4" /> Log {todayDay === 'rest' ? 'Session' : todayDay.label}
            </button>
          </div>
        )}
        {open === 'body' && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Weight" value={displayWeight(validWeight(log?.weight_kg))} unit={unit} accent={TEAL} isLoading={logLoading} />
            <StatTile label="BMI" value={n1(log?.bmi)} isLoading={logLoading} />
            <StatTile label="Lean Mass" value={displayWeight(log?.lean_mass_kg)} unit={unit} isLoading={logLoading} />
            <StatTile label="Body Fat" value={n1(log?.body_fat_pct)} unit="%" isLoading={logLoading} />
            {log?.muscle_percent != null && <StatTile label="Muscle" value={n1(log.muscle_percent)} unit="%" />}
            {log?.bmr != null && <StatTile label="BMR" value={n0(log.bmr)} unit="kcal" />}
          </div>
        )}
        {open === 'steps' && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Steps" value={steps?.toLocaleString() ?? null} accent={AQUA} />
            <StatTile label="Active Energy" value={n0(log?.active_energy)} unit="kcal" isLoading={logLoading} />
            <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" isLoading={logLoading} />
            <StatTile label="Training" value={log?.training_minutes} unit="min" isLoading={logLoading} />
          </div>
        )}
        {open === 'stack' && <SupplementChecklist />}
      </Sheet>

      {/* Thumb-reachable quick-log */}
      <Fab icon={Plus} label="Log" onClick={() => setLogOpen(true)} />
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Quick Log">
        <WorkoutChat splitDay={todayDay !== 'rest' && todayDay.dayKey ? daySplitEnum(todayDay.dayKey) : 'upper'} onClose={() => setLogOpen(false)} />
      </Sheet>
    </div>
  )
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
