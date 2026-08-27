'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui/Sheet'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { WidgetGrid } from '@/components/dashboard/WidgetGrid'
import { VitalsWidget } from '@/components/dashboard/widgets/VitalsWidget'
import { FuelWidget, MicrosWidget } from '@/components/dashboard/widgets/FuelWidget'
import { WaterWidget } from '@/components/dashboard/widgets/WaterWidget'
import {
  DeficitWidget, BarToBeatWidget, ConsistencyWidget,
} from '@/components/dashboard/widgets/PlanWidgets'
import { WeeklyMuscleSheet } from '@/components/body/WeeklyMuscleSheet'
import { BodyWidget } from '@/components/dashboard/widgets/BodyWidget'
import {
  SleepWidget, StepsWidget, CardioWidget, StackWidget,
} from '@/components/dashboard/widgets/DailyWidgets'
import {
  MuscleWidget, VolumeWidget, PrWidget, TrainWidget,
} from '@/components/dashboard/widgets/TrainingWidgets'
import type { WidgetId, WidgetSize } from '@/lib/dashboard/layout'
import { MacroCards } from '@/components/nutrition/MacroCards'
import { Surface, Tile } from '@/components/ui/Zone'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeekSoFarCard } from '@/components/dashboard/WeekSoFarCard'
import { WeeklySummaryCard } from '@/components/dashboard/WeeklySummaryCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { formatSleep } from '@/lib/utils/format'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { tdeeKcal } from '@/lib/nutrition/energy'
import { BODY, visceralColor, EMBER, SAPPHIRE, EMERALD, GOLD, AMETHYST, PLATINUM, STEEL, OXIDE, MUTED } from '@/lib/theme/palette'
import { logicalTodayISO } from '@/lib/utils/day'
import { useSingleOrDoubleTap } from '@/lib/utils/doubleTap'
import { scheduleDayFor, eraForDate, isTrainingDay, type ScheduleDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { stackForDate } from '@/lib/supplements'
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

// The Vitals sheet body — 56 days of readings and a chart per row. It has no
// business in the dashboard's first-load bundle: nothing renders it until a
// widget is tapped.
const VitalsGroups = dynamic(
  () => import('@/components/insights/VitalsGroups').then((m) => ({ default: m.VitalsGroups })),
  { ssr: false, loading: () => <div className="h-40 rounded-2xl border border-white/[0.07] bg-white/[0.03] animate-pulse" /> },
)

const TrendStrip = dynamic(
  () => import('@/components/dashboard/TrendStrip').then((m) => ({ default: m.TrendStrip })),
  { ssr: false, loading: () => <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 min-h-[280px] animate-pulse" /> },
)

// Domain accents — all from the single palette source of truth.
const VIOLET = AMETHYST        // Sleep / recovery
const CYAN = STEEL             // data / drivers

/** One shared empty Set — `taken ?? new Set()` would be a fresh identity every
 *  render and would defeat the Stack widget's memo for no benefit. */
const EMPTY_TAKEN: ReadonlySet<string> = new Set<string>()

const n0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const n1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | 'vitals' | null

/** One accent per sheet — the glass picks up its own domain colour. */
const SHEET_ACCENT: Record<Exclude<SheetKey, null>, string> = {
  readiness: EMBER, sleep: AMETHYST, fuel: MACRO_COLORS.calories, train: EMERALD,
  body: EMBER, steps: PLATINUM, stack: GOLD, vitals: SAPPHIRE,
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
  // FIFTEEN, not eight: the Fuel tile's large size draws a fortnight of
  // intake against target, and a fourteen-day chart cannot be built from an
  // eight-day window. One row is the current day, so the window is n+1.
  const { data: fuelLogs } = useDailyLogs(15)

  const [open, setOpen] = useState<SheetKey>(null)
  // Body strip: single tap → composition popup · double tap → Nexus InBody entry.
  /** One stable handler per strip key, cached — see the note on `strips`. */
  const openers = useRef(new Map<Exclude<SheetKey, null>, () => void>())
  const onOpen = useCallback((key: Exclude<SheetKey, null>) => {
    const hit = openers.current.get(key)
    if (hit) return hit
    const fn = () => setOpen(key)
    openers.current.set(key, fn)
    return fn
  }, [])

  /** Cardio is logged on the day it happened, not in a dashboard drawer. */
  const goToday = useCallback(() => router.push(`/day/${logicalTodayISO()}`), [router])
  /** The micro table has a page of its own; the tile is its glance. */
  const goMicros = useCallback(() => router.push('/nutrition/micros'), [router])
  /** A year of adherence reads next to the week-by-week timeline. */
  const goTimeline = useCallback(() => router.push('/pathfinder'), [router])

  // The weekly muscle sheet is its own component rather than another `SheetKey`
  // case: it owns its query and is mounted by two different surfaces (here and
  // the Workout tab), so folding it into this page's drawer would make the
  // Workout tab's copy a second implementation.
  const [muscleOpen, setMuscleOpen] = useState(false)
  const openMuscle = useCallback(() => setMuscleOpen(true), [])

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
  const steps = metrics?.steps ?? log?.steps ?? null
  const calToday = nutrition?.calories != null ? Math.round(nutrition.calories) : null
  const calGoal = goals?.calorie_goal ?? null
  // BMR + active + TEF — one shared formula, see nutrition/energy.ts.
  const tdeeToday = tdeeKcal(log?.bmr, log?.active_energy, nutrition?.calories)
  const phase = fuelLogs?.[0]?.date === logicalTodayISO() ? fuelLogs[0].phase : null
  /**
   * Today's stack, flattened to the ITEMS the log is keyed by.
   *
   * `taken` is a Set of item keys, not slot keys — so a widget that reasoned in
   * slots would report a whole slot outstanding because one of its three tablets
   * was unticked. The slot's TIME rides along on each item, because that is what
   * makes "next" answerable.
   *
   * `stackForDate` prefers the user's own stack and falls back to the seed, which
   * is why the denominator cannot be the seed constant: the tile read 9/11
   * forever the moment two supplements were added.
   */
  const stackItems = useMemo(() => {
    const today = logicalTodayISO()
    const training = isTrainingDay(today)
    const weekday = new Date(`${today}T12:00:00`).getDay()
    const slots = stackForDate(customSlotsForDate(customSupps ?? [], weekday, training), training, weekday)
    return slots.flatMap((slot) => slot.items.map((it) => ({ key: it.key, name: it.name, time: slot.time })))
  }, [customSupps])
  /**
   * Minutes since local midnight, for the Stack's "next dose".
   *
   * A state value ticked once a minute rather than `Date.now()` read during
   * render: a value read in the body would be a different number on every
   * render, which defeats the memo the widget switch exists for, and a 1 Hz
   * interval would redraw the whole grid sixty times for a figure that changes
   * once. The interval is cleared on unmount and nothing else on this page
   * depends on it.
   */
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const unit = weightUnit()
  // Already-logged-today: hide the "+ Log session" CTA once a workout exists.
  const loggedToday = sessions?.some((s) => s.started_at.slice(0, 10) === logicalTodayISO()) ?? false

  // Sparkline series (ascending 7d)
  const kcalSeries = useMemo(() => {
    const asc = [...(fuelLogs ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    return asc.map((d) => d.calories)
  }, [fuelLogs])
  /**
   * Week-on-week weight drift — and it really is a WEEK on a week.
   *
   * It used to halve whatever `useBioSeries` happened to return and diff the two
   * halves, under a label that says "(7-day avg)". At a 21-day window that was
   * already a 10-day mean against an 11-day one; at 30 it would be 15 against
   * 15, which on a cut is half a phase, not a week. A trend line is only a rate
   * if you know what it is per, so the window is stated here rather than
   * inherited from whatever the query was widened to.
   *
   * The two halves are taken from the last FOURTEEN days by date, not the last
   * fourteen readings — days without a weigh-in are gaps, and compacting them
   * away would silently reach further back the more days you skipped.
   */
  const weightWoW = useMemo(() => {
    const days = (bioSeries ?? []).slice(-14)
    const older = days.slice(0, 7).map((d) => d.weightKg).filter((v): v is number => v != null)
    const recent = days.slice(7).map((d) => d.weightKg).filter((v): v is number => v != null)
    if (!older.length || !recent.length) return null
    return Math.round((avg(recent) - avg(older)) * 100) / 100
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

  /**
   * The drivers BEHIND the recovery number — the extra desktop width beside the
   * hero shows the "why" instead of dead space, and the Energy widget's large
   * face shows the same four. Real HealthKit fields only.
   *
   * Memoised because the widget map depends on it: a fresh array every render would
   * rebuild all nine widget objects and defeat their `memo`.
   */
  const drivers: Array<{ label: string; value: string; color: string }> = useMemo(() => [
    { label: 'Sleep', value: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : '—', color: VIOLET },
    { label: 'Resting HR', value: log?.avg_rest_heart_rate != null ? `${log.avg_rest_heart_rate} bpm` : '—', color: OXIDE },
    { label: 'HRV', value: log?.hrv_ms != null ? `${Math.round(log.hrv_ms)} ms` : '—', color: SAPPHIRE },
    { label: 'Energy left', value: score?.battery_pct != null ? `${score.battery_pct}%` : '—', color: CYAN },
  ], [log, score])

  /**
   * ── ONE SWITCH, THIRTEEN BODIES ─────────────────────────────────────────────
   * This was a `Record<WidgetId, DashboardWidgetProps>` — thirteen objects
   * memoised together and fed to one generic shell. That shape is what made
   * every widget look like every other: a props bag of `value / status /
   * series / detail` can only ever express one number, so Vitals showed one of
   * its four readings and Fuel showed one of its five ratios.
   *
   * Each domain owns its body now and decides what its three sizes mean, so
   * this is a switch rather than a table. Most bodies also fetch their own data
   * (`useWeeklyVolume`, `useLatestPr`, `useVitalsDays`, `useCardioLogs`) instead
   * of being handed it, which is what stops this page growing a query per
   * widget; the ones below take props only because the value is already on this
   * page for the hero or another card.
   *
   * It is a function, not a memo: `WidgetGrid` calls it per tile with that
   * tile's size, and the components underneath are memoised where it pays.
   */
  const renderWidget = useCallback((id: WidgetId, size: WidgetSize) => {
    switch (id) {
      case 'vitals':
        return <VitalsWidget size={size} onOpen={onOpen('vitals')} />

      case 'sleep':
        return <SleepWidget size={size} onOpen={onOpen('sleep')}
          sleep={sleep ?? null} sleepMin={log?.sleep_minutes ?? null}
          goalHours={goals?.sleep_goal_hours ?? null}
          nightly={(bioSeries ?? []).map((d) => d.sleepMin)} />

      case 'fuel':
        return <FuelWidget size={size} onOpen={onOpen('fuel')}
          kcal={calToday} kcalGoal={calGoal}
          protein={nutrition?.protein_g ?? null} carbs={nutrition?.carbs_g ?? null} fat={nutrition?.fat_g ?? null}
          goals={{ protein: goals?.protein_goal_g ?? null, carbs: goals?.carbs_goal_g ?? null, fat: goals?.fat_goal_g ?? null }}
          waterMl={log?.water_ml ?? null} waterGoalMl={goals?.water_goal_ml ?? 3000}
          series={kcalSeries}
          phaseLabel={phase ? phaseDisplay(phase, logicalTodayISO()).label : null}
          phaseColor={phase ? phaseDisplay(phase, logicalTodayISO()).color : null} />

      // Hydration is a row of the Fuel tile AND a tile of its own — see the
      // note on `WaterWidget` for why that is not a duplicate.
      case 'water':
        return <WaterWidget size={size} onOpen={onOpen('fuel')}
          waterMl={log?.water_ml ?? null} goalMl={goals?.water_goal_ml ?? 3000} />

      // `next` and `train` were two tiles for one question — see the note on
      // `WIDGET_IDS`. Today's totals are passed raw in kg; the tile converts and
      // shortens them, and fetches the LAST run of this same `day_key` itself.
      case 'train':
        return <TrainWidget size={size} onOpen={onOpen('train')}
          day={todayDay} logged={loggedToday}
          today={loggedToday && todaySession ? {
            sessionId: todaySession.id,
            volumeKg: todaySession.total_volume_kg,
            setCount: todaySession.set_count,
            prCount: todaySession.pr_count,
            durationMin: todaySession.duration_min,
            avgBpm: todaySession.avg_bpm,
            calories: todaySession.calories_burned,
          } : null} />

      case 'body':
        return <BodyWidget size={size} onOpen={onBodyTap}
          weightSeries={(bioSeries ?? []).map((d) => ({ date: d.date, value: displayWeight(d.weightKg) }))} />

      // ── THE TAP THAT WENT TO THE WRONG SCREEN ──
      // This routed to `/day/<today>`, which carries a DOMS map and the day's
      // session and contains no weekly muscle breakdown anywhere on it. A
      // widget whose tap lands somewhere that cannot answer its own question is
      // worse than one that does nothing. It opens the week's focus now — the
      // same sheet the Workout tab's atlas opens.
      case 'muscle':
        return <MuscleWidget size={size} onOpen={openMuscle} />

      case 'volume':
        return <VolumeWidget size={size} onOpen={onOpen('train')} />

      case 'pr':
        return <PrWidget size={size} onOpen={onOpen('train')} />

      // Energy balance is a fuel question, so it opens the fuel drawer where
      // the calorie history and the override live.
      case 'deficit':
        return <DeficitWidget size={size} onOpen={onOpen('fuel')} />

      // The micro table is genuinely a PAGE — twenty nutrients in four bands,
      // each with its evidence — so this is the one tile that routes rather
      // than opening a drawer. A sheet would be a page in a smaller box.
      case 'micros':
        return <MicrosWidget size={size} onOpen={goMicros} />

      case 'bar':
        return <BarToBeatWidget size={size} onOpen={onOpen('train')} />

      // A year of adherence belongs beside the weekly timeline, which is the
      // surface that explains any individual gap in it.
      case 'consistency':
        return <ConsistencyWidget size={size} onOpen={goTimeline} />

      case 'steps':
        return <StepsWidget size={size} onOpen={onOpen('steps')}
          steps={steps} goal={goals?.steps_goal ?? 10_000}
          tdee={tdeeToday} activeKcal={log?.active_energy ?? null}
          series={(bioSeries ?? []).map((d) => d.steps)} />

      // Cardio has no sheet of its own: logging one belongs on the day it
      // happened, beside the walk's own entry form. The widget's own repeat
      // button is the shortcut; the tile still routes there.
      case 'cardio':
        return <CardioWidget size={size} onOpen={goToday} />

      case 'stack':
        return <StackWidget size={size} onOpen={onOpen('stack')}
          slots={stackItems} taken={taken ?? EMPTY_TAKEN} nowMinutes={nowMinutes} />
    }
  }, [
    sleep, log, goals, bioSeries, calToday, calGoal, nutrition,
    kcalSeries, phase, todayDay, loggedToday, todaySession,
    steps, tdeeToday, stackItems, taken, nowMinutes,
    onOpen, onBodyTap, goToday, openMuscle, goMicros, goTimeline,
  ])

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Training',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
    vitals: 'Vitals',
  }

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

      {/* Week-complete CTA — the FINAL day of the week, once every training day
          the plan asked for is logged. Renders nothing on every other day, so it
          needs no reserved height. Moved here from the Workout tab: the day it
          fires is a scheduled rest day, which is the one day Workout has no
          reason to be opened. */}
      <WeeklySummaryCard />

      {/* ── THE GRID ──
          These were six full-width `BioStrip` bands in a fixed order, which
          meant every domain claimed exactly as much of the screen as every
          other and none of them could be moved. A dashboard is the one screen
          whose right arrangement is different for different people on different
          days, so it is arranged by the person looking at it: long-press to
          lift, drag to reorder, tap the badge to resize.

          The Body widget stays dual-action: tap opens the composition popup,
          double-tap jumps to today's Nexus InBody entry. */}
      <Surface measure="grid" pad="snug" variant="band">
        <WidgetGrid>{renderWidget}</WidgetGrid>
      </Surface>

      {/* Smart Coach — lifts due a load bump next session (renders nothing when empty).
          DEFERRED. It queries `workout_sets` on mount, and it was doing so
          eagerly, competing with the hero for the cold-start network. Nothing
          above it depends on the result, and it renders nothing at all on a
          week with no progressions — so it had the cost of an above-the-fold
          card and, most days, none of the presence.
          `minHeight={0}`: the empty case is genuinely zero-height, so reserving
          space would introduce the layout gap the placeholder exists to avoid. */}
      <DeferredMount minHeight={0}><ProgressionAlerts /></DeferredMount>

      {/* Compact 30-day trends (shrunk from the old tall sidecar).
          GATED ON A REAL BREAKPOINT, not `hidden md:block`. That class hid the
          strip on a phone but still mounted it, so the primary device paid for
          three Supabase selects on every cold start to render display:none. */}
      {isDesktop && (
        <AnimatedCard index={8}><WidgetBoundary label="30-day trends" minHeight={120}><TrendStrip /></WidgetBoundary></AnimatedCard>
      )}

      {/* Below-the-fold: mount after idle so the hero owns first paint */}
      <DeferredMount minHeight={140}><AnimatedCard index={9}><InsightCoach /></AnimatedCard></DeferredMount>
      <DeferredMount minHeight={120}><AnimatedCard index={10}><WeekSoFarCard /></AnimatedCard></DeferredMount>

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
              // 0, not a hardcoded 1,955. The bar and the "over" colour are
              // driven by this number now, so an invented target would paint a
              // verdict against a goal the user never set. At 0 the bar simply
              // has no target to draw, which is the truth until goals load.
              calorie: goals?.calorie_goal ?? 0,
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
        {/* The whole Vitals panel, unchanged, moved off the Progress tab where
            it was one of three things behind a segmented control and got the
            attention a third option gets. */}
        {open === 'vitals' && <VitalsGroups />}
      </Sheet>

      <WeeklyMuscleSheet open={muscleOpen} onClose={() => setMuscleOpen(false)} />
    </div>
  )
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
