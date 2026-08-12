'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Moon, Flame, Dumbbell, Scale, Footprints, Pill } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { BioStrip, type BioStripProps } from '@/components/dashboard/BioStrip'
import { MacroCards } from '@/components/nutrition/MacroCards'
import { Surface, Tile } from '@/components/ui/Zone'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeeklyReviewCard } from '@/components/dashboard/WeeklyReviewCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { formatSleep } from '@/lib/utils/format'
import { displayWeight, weightUnit, validWeight, fmtVolume } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { tdeeKcal } from '@/lib/nutrition/energy'
import { BODY, visceralColor, EMBER, SAPPHIRE, EMERALD, GOLD, AMETHYST, PLATINUM, STEEL, OXIDE, MUTED } from '@/lib/theme/palette'
import { logicalTodayISO } from '@/lib/utils/day'
import { useSingleOrDoubleTap } from '@/lib/utils/doubleTap'
import { scheduleDayFor, eraForDate, isTrainingDay, type ScheduleDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { supplementCountForDate } from '@/lib/supplements'
import { useCustomSupplements, customSlotsForDate } from '@/lib/hooks/useCustomSupplements'
import { useBioSeries, useLastWeighIn, useLatestBodyMetrics, type BodyMetricField } from '@/lib/hooks/useBioStrips'
import { SleepStages } from '@/components/dashboard/SleepStages'

// Modal-only bodies (522 lines between them) that were in the dashboard's
// first-load bundle even though they render only once the domain sheet opens.
//
// ── THEY NOW HAVE A FALLBACK AND A PREFETCH, AND BOTH MATTER ────────────────
// Splitting them out was right, but nothing covered the gap it created: no
// `loading` fallback, and no prefetch. So the first tap on Readiness, Train or
// Stack played the sheet's open spring over a COMPLETELY EMPTY PANEL while the
// chunk was still downloading and parsing. That is the other half of "it takes
// a second to load when tapped" — the panel really was empty, and no amount of
// tuning the animation would have found it.
//
// `SheetSkeleton` means the panel is never blank, and `prefetchSheetBodies()`
// (called from the same idle window the deferred cards use) means that on a
// normal boot the chunk has been sitting in the module cache since long before
// the finger arrives. The fallback is the safety net for a cold, throttled
// first tap; the prefetch is what makes it almost never appear.
const ScoreCard = dynamic(() => import('@/components/dashboard/ScoreCard').then((m) => m.ScoreCard), { ssr: false, loading: SheetSkeleton })
const TrainingCard = dynamic(() => import('@/components/dashboard/TrainingCard').then((m) => m.TrainingCard), { ssr: false, loading: SheetSkeleton })
const SupplementChecklist = dynamic(() => import('@/components/dashboard/SupplementChecklist').then((m) => m.SupplementChecklist), { ssr: false, loading: SheetSkeleton })

/** Warm the three sheet chunks once the boot is done. Idempotent — the module
 *  cache dedupes, so calling it twice costs nothing. */
function prefetchSheetBodies() {
  void import('@/components/dashboard/ScoreCard')
  void import('@/components/dashboard/TrainingCard')
  void import('@/components/dashboard/SupplementChecklist')
}

/** Placeholder while a sheet body's chunk resolves. Sized so the panel does not
 *  jump when the real content lands. Hoisted — `dynamic()` above reads it at
 *  module init. */
function SheetSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-hidden="true">
      <div className="h-24 rounded-2xl border border-white/[0.07] bg-white/[0.03] animate-pulse" />
      <div className="h-16 rounded-2xl border border-white/[0.07] bg-white/[0.03] animate-pulse" />
    </div>
  )
}
import { StepsJourney } from '@/components/dashboard/StepsJourney'
import { ProgressionAlerts } from '@/components/command-center/ProgressionAlerts'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
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
import { useIsDesktop } from '@/lib/hooks/useBreakpoint'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

const TrendStrip = dynamic(
  () => import('@/components/dashboard/TrendStrip').then((m) => ({ default: m.TrendStrip })),
  { ssr: false, loading: () => <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 min-h-[280px] animate-pulse" /> },
)

// Domain accents — all from the single palette source of truth.
const VIOLET = AMETHYST        // Sleep / recovery
const CYAN = STEEL             // data / drivers
const TEAL = EMBER             // Body
const AQUA = SAPPHIRE          // HRV / data
const GOLD_ACCENT = GOLD       // Stack
const TRAIN_GREEN = EMERALD    // Training
const STEPS_INDIGO = PLATINUM  // Steps

const n0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const n1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | null

/** One accent per sheet — the glass picks up its own domain colour. */
const SHEET_ACCENT: Record<Exclude<SheetKey, null>, string> = {
  readiness: EMBER, sleep: AMETHYST, fuel: MACRO_COLORS.calories, train: EMERALD,
  body: EMBER, steps: PLATINUM, stack: GOLD,
}

/**
 * Body-sheet tiles, in display order. `unit: 'kg'` marks a weight to convert.
 * `synced` marks the four metrics Apple Health actually exports on a weigh-in
 * (Weight, BMI, Body-Fat %, Fat-Free Mass) — the dashboard popup shows ONLY those, so
 * a fresh weigh-in never sits next to stale BMR/visceral/muscle%/water% rows that
 * only refresh on a manual InBody entry. The manual metrics live in the Nexus.
 */
const BODY_TILES: Array<{
  field: BodyMetricField; label: string; unit?: string; decimals?: 0 | 1; accent?: string; synced?: boolean
}> = [
  // Every tile carries its substance's colour. Nine of these ten had NO accent
  // at all — a grid of identical grey numbers where the chart two taps away
  // colour-codes the same quantities. Same hues here as there, so a reading
  // means the same thing wherever you meet it.
  { field: 'weight_kg', label: 'Weight', unit: 'kg', decimals: 1, accent: BODY.weight, synced: true },
  { field: 'bmi', label: 'BMI', decimals: 1, accent: BODY.bmi, synced: true },
  { field: 'fat_free_mass_kg', label: 'Fat-Free Mass', unit: 'kg', decimals: 1, accent: BODY.lean, synced: true },
  { field: 'body_fat_pct', label: 'Body Fat', unit: '%', decimals: 1, accent: BODY.fat, synced: true },
  { field: 'muscle_mass_kg', label: 'Muscle Mass', unit: 'kg', decimals: 1, accent: BODY.muscle },
  { field: 'muscle_percent', label: 'Muscle', unit: '%', decimals: 1, accent: BODY.muscle },
  { field: 'water_percent', label: 'Water', unit: '%', decimals: 1, accent: BODY.water },
  // Visceral fat is graded, not identified — see visceralColor().
  { field: 'visceral_fat', label: 'Visceral Fat', decimals: 1 },
  { field: 'bone_mineral', label: 'Bone Mineral', decimals: 1, accent: BODY.mineral },
  { field: 'bmr', label: 'BMR', unit: 'kcal', decimals: 0, accent: BODY.bmr },
]

export default function DashboardPage() {
  const router = useRouter()
  useEnsureTodayScore()
  const isDesktop = useIsDesktop()

  // Warm the three sheet chunks after first paint, so a tap opens onto content
  // rather than onto the skeleton. Same idle window the deferred cards use, and
  // deliberately AFTER them in priority — a card the user can already see beats
  // a sheet they have not opened.
  useEffect(() => {
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const w = window as IdleWindow
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetchSheetBodies, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    // iOS has no requestIdleCallback at all, so this timeout is the real path
    // on the target device — see DeferredMount for the same caveat.
    const t = setTimeout(prefetchSheetBodies, 1500)
    return () => clearTimeout(t)
  }, [])
  const { data: score, isLoading: scoreLoading } = useTodayScore()
  const { data: log } = useTodayDailyLog()
  const { data: metrics } = useTodayMetrics()
  const { data: nutrition } = useTodayNutrition()
  const { data: sleep } = useTodaySleep()
  const { data: goals } = useUserGoals()
  const { data: sessions } = useRecentSessions(3)
  const { data: taken } = useSupplements()
  const { data: customSupps } = useCustomSupplements()
  const { data: bioSeries } = useBioSeries()
  const { data: weighIn } = useLastWeighIn()
  const { data: bodyMetrics } = useLatestBodyMetrics()
  const { data: fuelLogs } = useDailyLogs(8)

  const [open, setOpen] = useState<SheetKey>(null)
  // Body strip: single tap → composition popup · double tap → Nexus InBody entry.
  const onBodyTap = useSingleOrDoubleTap(
    () => setOpen('body'),
    () => router.push(`/day/${logicalTodayISO()}?section=inbody`),
  )

  // Today's scheduled training day — ERA-AWARE (PPL before Jul 19, HELIX-5 after),
  // shared with the Insight Coach so the whole app agrees.
  //
  // `scheduleVersion` is a real dependency, not decoration: scheduleDayFor reads
  // a synchronous cache that the DB fetch replaces AFTER first paint. With `[]`
  // this memo froze whatever the cache held at mount, so a swap made on another
  // device never appeared here.
  const scheduleVersion = useScheduleVersion()
  const todayDay: ScheduleDay | 'rest' = useMemo(() => {
    void scheduleVersion   // scheduleDayFor reads the store; this is the read
    return scheduleDayFor(logicalTodayISO())
  }, [scheduleVersion])

  // STRICT ERA BOUNDARY: "last session" only looks inside the
  // CURRENT era — a fresh HELIX era starts from "None", never from PPL history.
  const todayEra = eraForDate(logicalTodayISO())
  const eraSessions = sessions?.filter((s) => eraForDate(s.started_at.slice(0, 10)) === todayEra)
  const todaySession = eraSessions?.find((s) => s.started_at.slice(0, 10) === logicalTodayISO()) ?? null
  // The Train card's "last session" is the most recent PAST one (what to beat);
  // once today is logged the card shows today's completed hero instead.
  const lastSession = eraSessions?.find((s) => s.started_at.slice(0, 10) !== logicalTodayISO()) ?? null
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null
  const steps = metrics?.steps ?? log?.steps ?? null
  const calToday = nutrition?.calories != null ? Math.round(nutrition.calories) : null
  const calGoal = goals?.calorie_goal ?? null
  // BMR + active + TEF — one shared formula, see nutrition/energy.ts.
  const tdeeToday = tdeeKcal(log?.bmr, log?.active_energy, nutrition?.calories)
  const phase = fuelLogs?.[0]?.date === logicalTodayISO() ? fuelLogs[0].phase : null
  const suppCount = taken?.size ?? 0
  // The denominator has to be the USER's stack, not the seed constant, or the
  // tile reads 9/11 forever the moment two supplements are added.
  const suppTotal = supplementCountForDate(
    isTrainingDay(logicalTodayISO()),
    customSlotsForDate(
      customSupps ?? [],
      new Date(`${logicalTodayISO()}T12:00:00`).getDay(),
      isTrainingDay(logicalTodayISO()),
    ),
  )
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
  // Last weigh-in. Sourced from the body_composition ledger (a row exists only
  // when a weight was actually entered) and de-duplicated by VALUE, so a
  // re-synced or carried-forward reading can't reset the clock to "today" — the
  // old label read `daily_logs` and said "Weighed yesterday" two days after the
  // real weigh-in. It still CARRIES FORWARD for display: at 00:00 today's row is
  // empty, so the Body tile shows the last real reading rather than `— — —`.
  const lastWeigh = useMemo(() => {
    if (!weighIn) return null
    const { delta, ageDays } = weighIn
    return {
      kg: weighIn.kg,
      delta,
      // Green when the scale dropped, red when it rose (recomp direction).
      deltaColor: delta < -0.005 ? EMERALD : delta > 0.005 ? OXIDE : null,
      recencyColor: ageDays <= 0 ? EMERALD : ageDays <= 3 ? GOLD : MUTED,
      label: ageDays <= 0 ? 'Weighed today' : ageDays === 1 ? 'Weighed yesterday' : `Weighed ${ageDays}d ago`,
    }
  }, [weighIn])

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
      // Once logged, the strip reflects the completed session rather than still
      // prompting for it (the card behind it shows the full completed hero).
      status: loggedToday && todaySession?.total_volume_kg != null
        ? <span style={{ color: EMERALD }}>done ✓ · {fmtVolume(displayWeight(todaySession.total_volume_kg))} {unit}</span>
        : todayDay !== 'rest' && todayDay.sub
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
      // TDEE, not just the watch's active burn. `active kcal` alone is the half
      // of expenditure the watch happens to measure; the day's real cost is
      // BMR + active + TEF, and showing only the active term is what made the
      // deficit read ~200 kcal small every day. Falls back to the active figure
      // when BMR or intake is missing, because a partial TDEE is not a TDEE.
      status: tdeeToday != null
        ? `${n0(tdeeToday)} kcal TDEE · BMR + active + TEF`
        : log?.active_energy != null ? `${n0(log.active_energy)} active kcal` : 'movement',
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
    { label: 'Resting HR', value: log?.avg_rest_heart_rate != null ? `${log.avg_rest_heart_rate} bpm` : '—', color: '#C4514E' },
    { label: 'HRV', value: log?.hrv_ms != null ? `${Math.round(log.hrv_ms)} ms` : '—', color: AQUA },
    { label: 'Energy left', value: score?.battery_pct != null ? `${score.battery_pct}%` : '—', color: CYAN },
  ]

  return (
    /* Bands, not a bento of floating cards. The SURFACE reaches both screen
       edges — true edge-to-edge on a phone — while `measure="grid"` keeps the
       CONTENT on the same 80rem column the old `max-w-7xl` gave a desktop. */
    <div className="pb-4">
      <Surface measure="grid" pad="snug" variant="band">
        <BrandHeader />
      </Surface>

      {/* ── Hero: the master Recovery widget — the breathing pulse/ECG orb (recovery
          + battery merged), spanning both columns on desktop with a driver panel. ── */}
      <AnimatedCard index={0}>
        <Surface
          variant="hero"
          measure="grid"
          pad="card"
          accent={EMBER}
          as="button"
          onPress={() => setOpen('readiness')}
          label="Open recovery details"
        >
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
        </Surface>
      </AnimatedCard>

      {/* Daily domain strips. The Body strip is dual-action: tap opens the
          composition popup, double-tap jumps to today's Nexus InBody entry. */}
      <Surface measure="grid" pad="snug" variant="band">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {strips.map((s, i) => (
            <AnimatedCard key={s.key} index={i + 2}>
              <BioStrip {...s} onClick={s.key === 'body' ? onBodyTap : () => setOpen(s.key)} />
            </AnimatedCard>
          ))}
        </div>
      </Surface>

      {/* Smart Coach — lifts due a load bump next session (renders nothing when empty). */}
      <ProgressionAlerts />

      {/* Compact 30-day trends (shrunk from the old tall sidecar).
          GATED ON A REAL BREAKPOINT, not `hidden md:block`. That class hid the
          strip on a phone but still mounted it, so the primary device paid for
          three Supabase selects on every cold start to render display:none. */}
      {isDesktop && (
        <AnimatedCard index={8}><WidgetBoundary label="30-day trends" minHeight={120}><TrendStrip /></WidgetBoundary></AnimatedCard>
      )}

      {/* Below-the-fold: mount after idle so the hero owns first paint */}
      <DeferredMount minHeight={140}><AnimatedCard index={9}><InsightCoach /></AnimatedCard></DeferredMount>
      <DeferredMount minHeight={120}><AnimatedCard index={10}><WeeklyReviewCard /></AnimatedCard></DeferredMount>

      {/* ── Domain detail: liquid-glass popup, tinted by its own domain accent ── */}
      {/* ONE drawer, seven contents. Every domain strip and the readiness hero
          open into it, so a tap always produces the same object arriving the
          same way from the same edge — and every one of them can be thrown
          away with a flick instead of aimed at an X.

          No per-key maxHeight: these range from a ~220px body summary to the
          full supplement stack, and a sheet that hugs its content is the
          better default at both ends. */}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? sheetTitle[open] : undefined}
        accent={open ? SHEET_ACCENT[open] : undefined}
      >
        {/* Just the score widget. The sleep/energy driver tiles were a duplicate
            of the hero's own "What's driving it" panel one tap behind it, and
            pushed the actual breakdown below the fold. */}
        {open === 'readiness' && <ScoreCard score={score ?? null} />}
        {open === 'sleep' && (
          <SleepStages sleep={sleep ?? null} log={log ?? null} goalHours={goals?.sleep_goal_hours ?? null} />
        )}
        {open === 'fuel' && (
          // Calories card + macro card (double-tap either to override the day).
          // Compact matters more here than anywhere: this is inside a sheet, so
          // the taller the content the more of it starts below the fold.
          <MacroCards
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
            todaySession={todaySession}
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
            {/* Every metric carries forward from its OWN most recent reading.
                Reading only today's daily_logs row meant anything entered in the
                Nexus on another day rendered as "—", so the card looked like it
                only knew the weight. Metrics with no reading are hidden, not
                shown as an empty grid. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {BODY_TILES.filter((t) => t.synced).map(({ field, label, unit: u, decimals, accent }) => {
                const m = bodyMetrics?.[field]
                if (!m) return null
                const v = u === unit ? displayWeight(m.value) : decimals === 0 ? n0(m.value) : n1(m.value)
                // Visceral fat has no identity colour — it is graded, because it is the
                // one body metric where a higher number is worse.
                const tone = field === 'visceral_fat' ? visceralColor(m.value) : accent
                return <Tile key={field} label={label} value={v} unit={u} accent={tone} />
              })}
            </div>
            {bodyMetrics && Object.keys(bodyMetrics).length === 0 && (
              <p className="text-fluid-xs text-muted">No body metrics logged yet — add them under Today.</p>
            )}
            {/* Only the auto-synced four live here; BMR, visceral, muscle % and
                water % are entered by hand in the Nexus InBody card. */}
            <button
              onClick={() => { setOpen(null); router.push(`/day/${logicalTodayISO()}?section=inbody`) }}
              className="btn-glass w-full justify-between min-h-[40px] text-fluid-xs">
              <span>InBody &amp; scale metrics →</span>
              <span className="text-muted">manual entry</span>
            </button>
          </div>
        )}
        {open === 'steps' && (
          <StepsJourney
            steps={steps}
            goal={goals?.steps_goal ?? null}
            distanceM={(log as { distance_m?: number | null } | null)?.distance_m ?? null}
            activeKcal={log?.active_energy ?? null}
            trainingMin={log?.training_minutes ?? null}
            waterMl={log?.water_ml ?? null}
            series={(bioSeries ?? []).map((d) => d.steps)}
          />
        )}
        {open === 'stack' && <SupplementChecklist />}
      </Sheet>
    </div>
  )
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
