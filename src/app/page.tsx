'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Moon, Flame, Dumbbell, Scale, Footprints, Pill, Plus } from 'lucide-react'
import { LiquidModal } from '@/components/ui/LiquidModal'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { BioStrip, type BioStripProps } from '@/components/dashboard/BioStrip'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { BatteryCard } from '@/components/dashboard/BatteryCard'
import { StatTile } from '@/components/dashboard/StatTile'
import { SupplementChecklist } from '@/components/dashboard/SupplementChecklist'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { formatSleep, mlToL } from '@/lib/utils/format'
import { displayWeight, weightUnit, validWeight } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { logicalTodayISO } from '@/lib/utils/day'
import { scheduleDayFor, eraForDate, isTrainingDay, type ScheduleDay } from '@/lib/programs'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { supplementCountForDate } from '@/lib/supplements'
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
  const router = useRouter()
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

  // Today's scheduled training day — ERA-AWARE (PPL before Jul 19, HELIX-5 after),
  // shared with the Insight Coach so the whole app agrees.
  const todayDay: ScheduleDay | 'rest' = useMemo(() => scheduleDayFor(logicalTodayISO()), [])

  // STRICT ERA BOUNDARY: "last session" only looks inside the
  // CURRENT era — a fresh HELIX era starts from "None", never from PPL history.
  const todayEra = eraForDate(logicalTodayISO())
  const lastSession = sessions?.find((s) => eraForDate(s.started_at.slice(0, 10)) === todayEra)
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null
  const steps = metrics?.steps ?? log?.steps ?? null
  const calToday = nutrition?.calories != null ? Math.round(nutrition.calories) : null
  const calGoal = goals?.calorie_goal ?? null
  const phase = fuelLogs?.[0]?.date === logicalTodayISO() ? fuelLogs[0].phase : null
  const suppCount = taken?.size ?? 0
  const suppTotal = supplementCountForDate(isTrainingDay(logicalTodayISO()))
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
        ? <span style={{ color: phaseDisplay(phase, logicalTodayISO()).color }}>{phaseDisplay(phase, logicalTodayISO()).label} day{calGoal ? ` · goal ${calGoal.toLocaleString()}` : ''}</span>
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
          : todayEra === 'axis' ? 'no HELIX sessions yet — fresh slate' : 'no sessions yet',
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
      value: `${suppCount}/${suppTotal}`,
      status: suppCount >= suppTotal ? 'protocol complete ✓' : 'tap to check off',
    },
  ]

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Training',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
  }

  return (
    <PullToRefresh>
    <div className="space-y-6">
      <BrandHeader />

      {/* ── Hero: the two prominent daily widgets — Readiness (recovery) + Battery ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AnimatedCard index={0}>
          <button onClick={() => setOpen('readiness')}
            className="helix-card holo-sheen w-full flex items-center justify-center min-h-[300px]" aria-label="Open readiness details">
            <ReadinessOrb score={score ?? null} isLoading={scoreLoading} />
          </button>
        </AnimatedCard>
        <AnimatedCard index={1}>
          <button onClick={() => setOpen('readiness')} className="w-full text-left" aria-label="Open battery details">
            <BatteryCard battery={score?.battery_pct ?? null} isLoading={scoreLoading} />
          </button>
        </AnimatedCard>
      </div>

      {/* Daily domain strips */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {strips.map((s, i) => (
          <AnimatedCard key={s.key} index={i + 2}>
            <BioStrip {...s} onClick={() => setOpen(s.key)} />
          </AnimatedCard>
        ))}
      </div>

      {/* Compact 30-day trends (shrunk from the old tall sidecar) */}
      <div className="hidden md:block">
        <AnimatedCard index={8}><WidgetBoundary label="30-day trends" minHeight={120}><TrendStrip /></WidgetBoundary></AnimatedCard>
      </div>

      {/* Below-the-fold: mount after idle so the hero owns first paint */}
      <DeferredMount minHeight={140}><AnimatedCard index={9}><InsightCoach /></AnimatedCard></DeferredMount>
      <DeferredMount minHeight={120}><AnimatedCard index={10}><WeeklyReviewCard /></AnimatedCard></DeferredMount>

      {/* ── Domain detail: liquid-glass popup ── */}
      <LiquidModal open={!!open} onClose={() => setOpen(null)} title={open ? sheetTitle[open] : undefined}>
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
            {todayDay !== 'rest' && todayDay.dayKey ? (
              <button
                onClick={() => { setOpen(null); router.push(`/session?template=${todayDay.dayKey}`) }}
                className="btn-glass w-full justify-center">
                <Plus className="w-4 h-4" /> Log {todayDay.label}
              </button>
            ) : (
              <p className="text-fluid-xs text-muted text-center py-2">Rest day — Zone-2 recovery. No lifting scheduled.</p>
            )}
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
      </LiquidModal>
    </div>
    </PullToRefresh>
  )
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
