'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Moon, Flame, Dumbbell, Scale, Footprints, Pill } from 'lucide-react'
import { LiquidModal } from '@/components/ui/LiquidModal'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { BioStrip, type BioStripProps } from '@/components/dashboard/BioStrip'
import { ScoreCard } from '@/components/dashboard/ScoreCard'
import { MacroRings } from '@/components/nutrition/MacroRings'
import { TrainingCard } from '@/components/dashboard/TrainingCard'
import { StatTile } from '@/components/dashboard/StatTile'
import { SupplementChecklist } from '@/components/dashboard/SupplementChecklist'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { formatSleep, mlToL } from '@/lib/utils/format'
import { displayWeight, weightUnit, validWeight, fmtVolume } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { EMBER, SAPPHIRE, EMERALD, GOLD, AMETHYST, PLATINUM, STEEL, OXIDE, MUTED } from '@/lib/theme/palette'
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

// Domain accents — all from the single palette source of truth.
const VIOLET = AMETHYST        // Sleep / recovery
const CYAN = STEEL             // data / drivers
const TEAL = EMBER             // Body
const AQUA = SAPPHIRE          // HRV / data
const GOLD_ACCENT = GOLD       // Stack
const TRAIN_GREEN = EMERALD    // Training
const WATER_BLUE = SAPPHIRE    // Water
const ENERGY_RED = OXIDE       // Active Energy
const STEPS_INDIGO = PLATINUM  // Steps

const n0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const n1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | null

export default function DashboardPage() {
  const router = useRouter()
  useEnsureTodayScore()
  const { data: score, isLoading: scoreLoading } = useTodayScore()
  const { data: log, isLoading: logLoading } = useTodayDailyLog()
  const { data: metrics } = useTodayMetrics()
  const { data: nutrition } = useTodayNutrition()
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
  // Already-logged-today: hide the "+ Log session" CTA once a workout exists.
  const loggedToday = sessions?.some((s) => s.started_at.slice(0, 10) === logicalTodayISO()) ?? false

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
  // Last weigh-in — bioSeries is ascending, so the newest valid weight is the
  // current reading. It CARRIES FORWARD: at 00:00 today's row is empty, so the
  // Body tile must still show yesterday's actual weight (never `— — —`). The
  // recency label + a drop/gain delta colour ride alongside it (green = weight
  // dropped, red = gained).
  const lastWeigh = useMemo(() => {
    const withW = (bioSeries ?? []).filter((d) => validWeight(d.weightKg) != null)
    if (!withW.length) return null
    const latestKg = validWeight(withW[withW.length - 1].weightKg)!
    const prevKg = withW.length >= 2 ? validWeight(withW[withW.length - 2].weightKg) : null
    const delta = prevKg != null ? Math.round((latestKg - prevKg) * 100) / 100 : 0
    const ageDays = Math.round((Date.parse(logicalTodayISO() + 'T00:00:00Z') - Date.parse(withW[withW.length - 1].date + 'T00:00:00Z')) / 86400000)
    return {
      kg: latestKg,
      delta,
      // Green when the scale dropped, red when it rose (recomp direction).
      deltaColor: delta < -0.005 ? EMERALD : delta > 0.005 ? OXIDE : null,
      recencyColor: ageDays <= 0 ? EMERALD : ageDays <= 3 ? GOLD : MUTED,
      label: ageDays <= 0 ? 'Weighed today' : ageDays === 1 ? 'Weighed yesterday' : `Weighed ${ageDays}d ago`,
    }
  }, [bioSeries])

  const strips: Array<BioStripProps & { key: Exclude<SheetKey, null> }> = [
    {
      key: 'sleep', icon: Moon, label: 'Sleep', accent: VIOLET,
      value: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null,
      status: log?.avg_rest_heart_rate != null ? `RHR ${log.avg_rest_heart_rate} bpm` : 'recovery',
      series: (bioSeries ?? []).map((d) => d.sleepMin),
    },
    {
      key: 'fuel', icon: Flame, label: 'Fuel', accent: MACRO_COLORS.calories,
      value: calToday, unit: 'kcal',
      status: phase
        ? <span style={{ color: phaseDisplay(phase, logicalTodayISO()).color }}>{phaseDisplay(phase, logicalTodayISO()).label} day{calGoal ? ` · goal ${calGoal.toLocaleString()}` : ''}</span>
        : calGoal ? `goal ${calGoal.toLocaleString()}` : 'no log yet',
      series: kcalSeries,
    },
    {
      key: 'train', icon: Dumbbell, label: 'Train', accent: TRAIN_GREEN,
      value: todayDay === 'rest' ? 'Zone-2 / Rest' : todayDay.label,
      status: todayDay !== 'rest' && todayDay.sub
        ? todayDay.sub
        : lastSession?.total_volume_kg != null
          ? `last: ${lastSplit?.label ?? ''} · ${fmtVolume(displayWeight(lastSession.total_volume_kg))} ${unit}`
          : todayEra === 'axis' ? 'no HELIX sessions yet — fresh slate' : 'no sessions yet',
    },
    {
      // Weight carries forward from the last valid reading (never `— — —` at
      // midnight), never integer-rounded (64.9 stays 64.9), tinted by drop/gain.
      key: 'body', icon: Scale, label: 'Body', accent: lastWeigh?.deltaColor ?? TEAL,
      value: displayWeight(lastWeigh?.kg ?? validWeight(log?.weight_kg)), unit, decimals: 1,
      status: lastWeigh
        ? <span style={{ color: lastWeigh.recencyColor }}>
            {lastWeigh.label}
            {lastWeigh.delta !== 0 && (
              <span style={{ color: lastWeigh.deltaColor ?? undefined }}>
                {' · '}{lastWeigh.delta < 0 ? '▼' : '▲'}{displayWeight(Math.abs(lastWeigh.delta))}{unit}
              </span>
            )}
          </span>
        : log?.body_fat_pct != null ? `${n1(log.body_fat_pct)}% body fat` : 'composition',
      series: (bioSeries ?? []).map((d) => displayWeight(d.weightKg)),
    },
    {
      key: 'steps', icon: Footprints, label: 'Steps', accent: STEPS_INDIGO,
      value: steps,
      status: log?.active_energy != null ? `${n0(log.active_energy)} active kcal` : 'movement',
      series: (bioSeries ?? []).map((d) => d.steps),
    },
    {
      key: 'stack', icon: Pill, label: 'Stack', accent: GOLD_ACCENT,
      value: `${suppCount}/${suppTotal}`,
      status: suppCount >= suppTotal ? 'protocol complete ✓' : 'tap to check off',
    },
  ]

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Training',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
  }

  // The drivers BEHIND the recovery number — the extra desktop width (2-col span)
  // shows the "why" instead of dead space. Real HealthKit fields only.
  const drivers: Array<{ label: string; value: string; color: string }> = [
    { label: 'Sleep', value: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : '—', color: VIOLET },
    { label: 'Resting HR', value: log?.avg_rest_heart_rate != null ? `${log.avg_rest_heart_rate} bpm` : '—', color: '#D5514E' },
    { label: 'HRV', value: log?.hrv_ms != null ? `${Math.round(log.hrv_ms)} ms` : '—', color: AQUA },
    { label: 'Energy left', value: score?.battery_pct != null ? `${score.battery_pct}%` : '—', color: CYAN },
  ]

  return (
    <div className="space-y-6">
      <BrandHeader />

      {/* ── Hero: the master Recovery widget — the breathing pulse/ECG orb (recovery
          + battery merged), spanning both columns on desktop with a driver panel. ── */}
      <AnimatedCard index={0}>
        <button onClick={() => setOpen('readiness')}
          className="helix-card holo-sheen w-full text-left" aria-label="Open recovery details">
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <ReadinessOrb score={score ?? null} isLoading={scoreLoading} />
            </div>
            {/* Driver breakdown — fills the extra 2-col desktop width. */}
            <div className="md:w-60 md:shrink-0 md:border-l md:border-white/[0.07] md:pl-6">
              <span className="hidden md:block text-[10px] uppercase tracking-widest text-muted mb-3">What&apos;s driving it</span>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-2.5">
                {drivers.map((d) => (
                  <div key={d.label}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-0.5 rounded-lg md:rounded-none border md:border-0 border-white/[0.05] bg-white/[0.02] md:bg-transparent px-2.5 py-2 md:px-0 md:py-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{d.label}</span>
                    <span className="helix-num text-fluid-sm font-bold" style={{ color: d.color }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </button>
      </AnimatedCard>

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
            <div className="grid grid-cols-2 gap-2.5">
              {drivers.map((d) => (
                <StatTile key={d.label} label={d.label} value={d.value} accent={d.color} />
              ))}
            </div>
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
          // The elegant hero-calories + 3-macro-ring UI (double-tap any ring to
          // override the day) — replaces the four flat stat squares.
          <MacroRings
            today={nutrition ? {
              calories: nutrition.calories, proteinG: nutrition.protein_g,
              carbsG: nutrition.carbs_g, fatG: nutrition.fat_g,
            } : null}
            logs={fuelLogs ?? []}
            goals={{
              calorie: goals?.calorie_goal ?? 1955,
              protein: goals?.protein_goal_g ?? null,
              carbs: goals?.carbs_goal_g ?? null,
              fat: goals?.fat_goal_g ?? null,
            }}
            date={logicalTodayISO()}
          />
        )}
        {open === 'train' && (
          <TrainingCard
            today={todayDay}
            lastSession={lastSession}
            loggedToday={loggedToday}
            onLog={(dayKey) => { setOpen(null); router.push(`/session?template=${dayKey}`) }}
          />
        )}
        {open === 'body' && (
          <div className="space-y-2.5">
            {lastWeigh && (
              <div className="flex items-center gap-2 text-fluid-xs">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: lastWeigh.recencyColor }} aria-hidden="true" />
                <span style={{ color: lastWeigh.recencyColor }} className="font-medium">{lastWeigh.label}</span>
                {weightWoW != null && (
                  <span className="text-muted">· {weightWoW > 0 ? '+' : ''}{weightWoW} {unit}/wk (7-day avg)</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Weight" value={displayWeight(validWeight(log?.weight_kg))} unit={unit} accent={TEAL} isLoading={logLoading} />
            <StatTile label="BMI" value={n1(log?.bmi)} isLoading={logLoading} />
            <StatTile label="Lean Mass" value={displayWeight(log?.lean_mass_kg)} unit={unit} isLoading={logLoading} />
            <StatTile label="Body Fat" value={n1(log?.body_fat_pct)} unit="%" isLoading={logLoading} />
            {log?.muscle_percent != null && <StatTile label="Muscle" value={n1(log.muscle_percent)} unit="%" />}
            {log?.bmr != null && <StatTile label="BMR" value={n0(log.bmr)} unit="kcal" />}
            </div>
          </div>
        )}
        {open === 'steps' && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Steps" value={steps?.toLocaleString() ?? null} accent={STEPS_INDIGO} />
            <StatTile label="Active Energy" value={n0(log?.active_energy)} unit="kcal" accent={ENERGY_RED} isLoading={logLoading} />
            <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" accent={WATER_BLUE} isLoading={logLoading} />
            <StatTile label="Training" value={log?.training_minutes} unit="min" accent={TRAIN_GREEN} isLoading={logLoading} />
          </div>
        )}
        {open === 'stack' && <SupplementChecklist />}
      </LiquidModal>
    </div>
  )
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
