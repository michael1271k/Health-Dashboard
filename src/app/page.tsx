'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui/Sheet'
import { WidgetGrid } from '@/components/dashboard/WidgetGrid'
import { VitalsWidget } from '@/components/dashboard/widgets/VitalsWidget'
import { FuelWidget, MicrosWidget } from '@/components/dashboard/widgets/FuelWidget'
import { WaterWidget } from '@/components/dashboard/widgets/WaterWidget'
import { RecoveryWidget } from '@/components/dashboard/widgets/RecoveryWidget'
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
import { Surface } from '@/components/ui/Zone'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeekSoFarCard } from '@/components/dashboard/WeekSoFarCard'
import { WeeklySummaryCard } from '@/components/dashboard/WeeklySummaryCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { tdeeKcal } from '@/lib/nutrition/energy'
import { BODY, visceralColor, EMBER, SAPPHIRE, EMERALD, GOLD, AMETHYST, PLATINUM, OXIDE, MUTED, STEEL } from '@/lib/theme/palette'
import { logicalTodayISO } from '@/lib/utils/day'
import { useSingleOrDoubleTap } from '@/lib/utils/doubleTap'
import { scheduleDayFor, eraForDate, isTrainingDay, type ScheduleDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { stackForDate } from '@/lib/supplements'
import { useCustomSupplements, customSlotsForDate } from '@/lib/hooks/useCustomSupplements'
import { useBioSeries, useLastWeighIn, useLatestBodyMetrics, useBodyMetricRows, bodyMetricSeries, type BodyMetricField } from '@/lib/hooks/useBioStrips'
import { LineChart } from '@/components/dashboard/widgets/parts'
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
import { useNutritionGoals } from '@/lib/hooks/useNutritionGoals'

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

/** One shared empty Set — `taken ?? new Set()` would be a fresh identity every
 *  render and would defeat the Stack widget's memo for no benefit. */
const EMPTY_TAKEN: ReadonlySet<string> = new Set<string>()

const n0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const n1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | 'vitals'
  | 'deficit' | 'consistency' | null

/** One accent per sheet — the glass picks up its own domain colour. */
const SHEET_ACCENT: Record<Exclude<SheetKey, null>, string> = {
  readiness: EMBER, sleep: AMETHYST, fuel: MACRO_COLORS.calories, train: EMERALD,
  body: BODY.weight, steps: PLATINUM, stack: GOLD, vitals: SAPPHIRE,
  deficit: MACRO_COLORS.calories, consistency: EMERALD,
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
  // The same 30-day window, kept whole, so each body tile can draw its trend.
  const { data: bodyRows } = useBodyMetricRows(30)
  // FIFTEEN, not eight: the Fuel tile's large size draws a fortnight of
  // intake against target, and a fourteen-day chart cannot be built from an
  // eight-day window. One row is the current day, so the window is n+1.
  const { data: fuelLogs } = useDailyLogs(15)

  const [open, setOpen] = useState<SheetKey>(null)
  // Litres, to one decimal: millilitres is a precision nobody drinks in, and
  // "2.4 / 3 L" is the reading. Goal falls back to the same 3,000 ml default the
  // water widget uses, so the two cannot disagree about what full means.
  const waterGoalMl = goals?.water_goal_ml ?? 3000
  const waterL = log?.water_ml == null ? null : Math.round(log.water_ml / 100) / 10
  const waterGoalL = Math.round(waterGoalMl / 100) / 10
  const waterPct = log?.water_ml == null ? 0 : Math.min(1, log.water_ml / waterGoalMl)
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
  /**
   * ── THE FUEL TARGET IS THE RESOLVED ONE, NOT THE STORED ROW ────────────────
   * This read `user_goals.calorie_goal` directly, which is the CACHE of a
   * decision rather than the decision: the active Deficit Lever outranks it and
   * the plan/phase preset outranks it after that. So the dashboard graded the
   * day against 1,955 while `/nutrition` — which has always gone through
   * `useNutritionGoals` — graded the same day against 1,999, and the Fuel tile
   * and its sheet disagreed with the Nutrition page about what the target was.
   *
   * `useNutritionGoals` is the one resolver (lever → plan-phase override →
   * preset → stored row) and is what the server scorer agrees with. Everything
   * on this page that draws a macro target now comes from it, so there is no
   * second answer left to drift.
   */
  const fuelGoals = useNutritionGoals()
  const calGoal = fuelGoals.calorie > 0 ? fuelGoals.calorie : null
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

  /**
   * ── THE WORKOUT TILE OPENS TODAY, NOT A DRAWER ABOUT TODAY ─────────────────
   * It opened the Training sheet, whose body leads with `lastSession` — the most
   * recent PAST session — so tapping the tile that says "Upper B · scheduled
   * today" landed on last Thursday's numbers. The tile's own Log link went to
   * the right place, but that link only exists at medium and large, and it is
   * one 32px target inside a tile whose whole surface reads as tappable.
   *
   * A tile that names today's session should open today's session. Three states,
   * three destinations, and every one of them is about today:
   *
   *   LOGGED   the session that exists → its analysis page
   *   TRAINING the session that does not exist yet → the deck, seeded from
   *            today's template and dated today
   *   REST     there is nothing to open, so the drawer is the honest answer —
   *            it carries the week and the option to log anyway
   */
  const openTraining = useCallback(() => {
    if (loggedToday && todaySession) { router.push(`/session/${todaySession.id}`); return }
    if (todayDay !== 'rest') {
      router.push(`/session?template=${todayDay.dayKey}&date=${logicalTodayISO()}`)
      return
    }
    setOpen('train')
  }, [loggedToday, todaySession, todayDay, router])


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
      // The old fixed hero, now first in the grid — see `RecoveryWidget`.
      case 'recovery':
        return <RecoveryWidget size={size} onOpen={onOpen('readiness')}
          score={score ?? null} isLoading={scoreLoading}
          sleepMin={log?.sleep_minutes ?? null}
          restingHr={log?.avg_rest_heart_rate ?? null}
          hrvMs={log?.hrv_ms ?? null} />

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
          goals={{ protein: fuelGoals.protein, carbs: fuelGoals.carbs, fat: fuelGoals.fat }}
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
        return <TrainWidget size={size} onOpen={openTraining}
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
        // Its own sheet, not Fuel's. The ledger asks what the last month of
        // eating is WORTH as a rate; Fuel asks what is left today. Sending one
        // to the other answered a question nobody had just asked.
        return <DeficitWidget size={size} onOpen={onOpen('deficit')} />

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
        // A sheet, not a navigation. Tapping it used to leave the dashboard
        // for the Progress tab — the tile cost you a journey instead of
        // saving you one, which is the same rule the widget deep links follow.
        return <ConsistencyWidget size={size} onOpen={onOpen('consistency')} />

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
    sleep, log, goals, bioSeries, calToday, calGoal, nutrition, fuelGoals,
    score, scoreLoading,
    kcalSeries, phase, todayDay, loggedToday, todaySession,
    steps, tdeeToday, stackItems, taken, nowMinutes,
    onOpen, onBodyTap, goToday, openMuscle, goMicros, openTraining,
  ])

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Training',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
    vitals: 'Vitals', deficit: 'Deficit Ledger', consistency: 'Consistency',
  }

  return (
    /* Bands, not a bento of floating cards. The SURFACE reaches both screen
       edges — true edge-to-edge on a phone — while `measure="grid"` keeps the
       CONTENT on the same 80rem column the old `max-w-7xl` gave a desktop. */
    <div className="pb-4">
      {/* ── THE DASHBOARD IS THE GRID ──────────────────────────────────────────
          Two fixed bands used to stand above it. The first was the brand header
          — wordmark, greeting, live clock, plan/phase chips, an "Updated" stamp
          — and the second was the Readiness hero: a ~300px orb with a driver
          panel beside it that only rendered at `md` and up, i.e. never on the
          phone this app is used on.

          Between them they took the whole of a 390×844 first screen. Nothing in
          either was actionable: the greeting and the clock are on the status bar
          six pixels above them, the plan chips restate a setting, and the orb's
          own drivers were invisible at that width.

          The grid starts at the top now, and both survive as things you can
          arrange:

            · Readiness is `RecoveryWidget` — the same orb, the first entry in
              the catalogue, the only one that opens at LARGE, and its large face
              finally shows the four drivers on a phone.
            · Plan and phase are `PlanPhaseTags`, which still renders wherever a
              reader needs them stated rather than shown.

          What is genuinely gone is the wordmark and the clock, which is the
          right thing to lose: an app does not need to tell you which app it is,
          and a phone already knows the time. */}
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
              // The RESOLVED target — the active lever's number when a rung is
              // pulled — so this sheet says what `/nutrition` says. It used to
              // read the stored `user_goals` row, which is what made the sheet
              // show 1,955 against the Nutrition page's 1,999.
              //
              // Still 0 rather than a literal when nothing has resolved yet:
              // the bar and the "over" colour are driven by this number, and an
              // invented target would paint a verdict against a goal the user
              // never set. At 0 the bar has no target to draw, which is true.
              calorie: fuelGoals.calorie,
              protein: fuelGoals.protein,
              carbs: fuelGoals.carbs,
              fat: fuelGoals.fat,
            }}
            date={logicalTodayISO()}
          />
        )}
        {/* ── WATER, WHERE FUEL IS ───────────────────────────────────────────
            Hydration had no home in this sheet, so the Steps sheet had been
            carrying it — a reading about intake, reported on the screen about
            movement. It belongs beside the macros, against its own goal, and it
            is now stated in exactly one place. */}
        {open === 'fuel' && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: SAPPHIRE }}>Water</span>
              <span className="ml-auto shrink-0 helix-num font-bold text-fluid-lg tabular-nums leading-none text-text">
                {waterL ?? '—'}
                <span className="text-[10px] font-normal text-muted ml-0.5">/ {waterGoalL} L</span>
              </span>
            </div>
            <span className="mt-2 block h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <span className="block h-full rounded-full origin-left transition-transform duration-500"
                style={{ transform: `scaleX(${waterPct})`, background: waterPct >= 1 ? EMERALD : SAPPHIRE }} />
            </span>
          </div>
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
        {/* ── AND WHAT YOU ARE WALKING INTO ──────────────────────────────────
            The loads to beat for that session, from the Targets tile itself
            rather than a second computation of the same baselines. `prEngine`'s
            `buildBaselines` is what the live logger judges every set against,
            and a sheet that re-derived "the number to beat" would eventually
            promise a record the logger then refused. */}
        {open === 'train' && <BarToBeatWidget size="l" />}
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

            {/* ── EVERY METRIC, EACH WITH ITS OWN TREND ────────────────────────
                This showed FOUR tiles — the ones Apple Health exports on a
                weigh-in — and sent you to a manual-entry screen for the other
                six. The reasoning was that a fresh weigh-in should not sit
                beside stale BMR and visceral rows, but `useLatestBodyMetrics`
                had ALREADY solved that: every field carries forward from its own
                most recent reading and states its own date. So the sheet was
                hiding data it held, and offering a button instead of an answer.

                Each metric now also carries its 30-day line, from the rows the
                same query was already fetching and discarding. A body figure
                without its direction is the number you have to open something
                else to interpret, which is what this sheet exists to stop. */}
            {BODY_TILES.map(({ field, label, unit: u, decimals, accent }) => {
              const m = bodyMetrics?.[field]
              if (!m) return null
              const v = u === unit ? displayWeight(m.value) : decimals === 0 ? n0(m.value) : n1(m.value)
              // Visceral fat has no identity colour — it is graded, because it is
              // the one body metric where a higher number is worse.
              const tone = field === 'visceral_fat' ? visceralColor(m.value) : (accent ?? STEEL)
              const series = bodyMetricSeries(bodyRows, field)
              const measured = series.filter((d: { value: number | null }) => d.value != null).length
              return (
                <div key={field} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] truncate" style={{ color: tone }}>
                      {label}
                    </span>
                    <span className="ml-auto shrink-0 helix-num font-bold text-fluid-lg tabular-nums leading-none text-text">
                      {v ?? '—'}
                      {u && <span className="text-[10px] font-normal text-muted ml-0.5">{u}</span>}
                    </span>
                  </div>
                  {/* Two readings is a line; one is an artefact. A field measured
                      once in thirty days states its date instead. */}
                  {measured >= 2 ? (
                    <div className="mt-1.5">
                      <LineChart series={series} color={tone} height={44} decimals={decimals === 0 ? 0 : 1} unit={u} />
                    </div>
                  ) : (
                    <div className="mt-1 text-[9px] text-muted">measured {m.date}</div>
                  )}
                </div>
              )
            })}

            {bodyMetrics && Object.keys(bodyMetrics).length === 0 && (
              <p className="text-fluid-xs text-muted">No body metrics logged yet — add them under Today.</p>
            )}
          </div>
        )}
        {/* Water is gone from here. It is not activity; it sat in this sheet
            because there was a spare cell, and it meant hydration was reported
            in two places that could disagree — here and Fuel, which owns it. */}
        {open === 'steps' && (
          <StepsJourney
            steps={steps}
            goal={goals?.steps_goal ?? null}
            distanceM={(log as { distance_m?: number | null } | null)?.distance_m ?? null}
            activeKcal={log?.active_energy ?? null}
            trainingMin={log?.training_minutes ?? null}
            series={(bioSeries ?? []).map((d) => d.steps)}
          />
        )}
        {/* The two tiles that used to answer a question by leaving. Each is
            simply its own widget at large — the tile IS the content, and it has
            a size that fits a sheet, so a second implementation of the same
            reading would be a second thing to keep in step. */}
        {open === 'deficit' && <DeficitWidget size="l" />}
        {open === 'consistency' && <ConsistencyWidget size="l" />}
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
