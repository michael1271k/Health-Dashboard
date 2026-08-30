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
  SleepWidget, StepsWidget, CardioWidget, StackWidget, FatigueWidget,
} from '@/components/dashboard/widgets/DailyWidgets'
import {
  MuscleWidget, VolumeWidget, PrWidget, TrainWidget,
} from '@/components/dashboard/widgets/TrainingWidgets'
import type { WidgetId, WidgetSize } from '@/lib/dashboard/layout'
import { MacroCards } from '@/components/nutrition/MacroCards'
import { BrandHeader } from '@/components/dashboard/BrandHeader'
import { Surface } from '@/components/ui/Zone'
import { InsightCoach } from '@/components/dashboard/InsightCoach'
import { AnimatedCard } from '@/components/dashboard/AnimatedBento'
import { WeekSoFarCard } from '@/components/dashboard/WeekSoFarCard'
import { WeeklySummaryCard } from '@/components/dashboard/WeeklySummaryCard'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { displayWeight } from '@/lib/utils/units'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { tdeeKcal } from '@/lib/nutrition/energy'
import { BODY, EMBER, SAPPHIRE, EMERALD, GOLD, AMETHYST, PLATINUM } from '@/lib/theme/palette'
import { logicalTodayISO } from '@/lib/utils/day'
import { useSingleOrDoubleTap } from '@/lib/utils/doubleTap'
import { scheduleDayFor, eraForDate, isTrainingDay, type ScheduleDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { stackForDate } from '@/lib/supplements'
import { useCustomSupplements, customSlotsForDate } from '@/lib/hooks/useCustomSupplements'
import { useBioSeries } from '@/lib/hooks/useBioStrips'
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
import { BodyPanel } from '@/components/day/BodyPanel'
import type { DayVaultData } from '@/lib/hooks/useDayVault'
import { CardioSheet } from '@/components/dashboard/CardioSheet'
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

/** One shared empty Set — `skipped ?? new Set()` would be a fresh identity every
 *  render and would defeat the Stack widget's memo for no benefit. */
const EMPTY_SKIPPED: ReadonlySet<string> = new Set<string>()

type SheetKey = 'readiness' | 'sleep' | 'fuel' | 'train' | 'body' | 'steps' | 'stack' | 'vitals'
  | 'deficit' | 'consistency' | 'cardio' | null

/** One accent per sheet — the glass picks up its own domain colour. */
const SHEET_ACCENT: Record<Exclude<SheetKey, null>, string> = {
  readiness: EMBER, sleep: AMETHYST, fuel: MACRO_COLORS.calories, train: EMERALD,
  body: BODY.weight, steps: PLATINUM, stack: GOLD, vitals: SAPPHIRE,
  deficit: MACRO_COLORS.calories, consistency: EMERALD, cardio: EMERALD,
}

/*
 * ── `BODY_TILES` IS GONE ─────────────────────────────────────────────────────
 * Ten hand-declared tiles, each with its own 30-day `LineChart`, made up the
 * old body sheet — roughly 900px of drawer that existed nowhere else in the
 * app. The sheet is `BodyPanel` now, the same one the Nexus opens, so the
 * composition ledger and its healthy bands have exactly one implementation.
 * The per-metric charts were the one thing this had that the panel does not,
 * and they are two taps away on each metric's own page.
 */

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
  const { data: skipped } = useSupplements()
  const { data: customSupps } = useCustomSupplements()
  const { data: bioSeries } = useBioSeries()
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
   * `skipped` is a Set of item keys, not slot keys — so a widget that reasoned
   * in slots would drop a whole slot because one of its three tablets was
   * skipped. The slot's TIME rides along on each item, because that is what
   * makes "next" answerable now that the clock, not a tick, decides it.
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
  /*
   * `weightWoW` and `lastWeigh` lived here to feed the old body sheet's header
   * line — a week-over-week delta and a "Weighed 3d ago" recency chip. Both
   * facts survive inside `BodyPanel`, which states the date the reading was
   * actually recorded, so the two queries behind them (`useLastWeighIn`,
   * `useLatestBodyMetrics`) are no longer fetched on every dashboard load.
   */


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
          steps={steps} goal={fuelGoals.steps ?? goals?.steps_goal ?? 10_000}
          tdee={tdeeToday} activeKcal={log?.active_energy ?? null}
          series={(bioSeries ?? []).map((d) => d.steps)} />

      // ── CARDIO ANSWERS ITSELF NOW ──
      // It used to NAVIGATE to `/day/<today>`, on the reasoning that logging a
      // walk belongs on the day it happened. True of logging, and the wrong
      // price for LOOKING: every other tile on this grid opens a sheet in
      // place, so cardio was the only one that charged a page transition and a
      // scroll to answer "what was my pace". The sheet states the reading and
      // still routes to the day for the form. See `CardioSheet`.
      case 'cardio':
        return <CardioWidget size={size} onOpen={onOpen('cardio')} />

      case 'fatigue':
        // Straight to the day page's Recovery band, where the tracker lives —
        // a widget that opened a sheet duplicating its own input would be two
        // places to log the same thing.
        return <FatigueWidget size={size} onOpen={goToday} />
      case 'stack':
        return <StackWidget size={size} onOpen={onOpen('stack')}
          slots={stackItems} skipped={skipped ?? EMPTY_SKIPPED} nowMinutes={nowMinutes} />
    }
  }, [
    sleep, log, goals, bioSeries, calToday, calGoal, nutrition, fuelGoals,
    score, scoreLoading,
    kcalSeries, phase, todayDay, loggedToday, todaySession,
    steps, tdeeToday, stackItems, skipped, nowMinutes,
    onOpen, onBodyTap, goToday, openMuscle, goMicros, openTraining,
  ])

  const sheetTitle: Record<Exclude<SheetKey, null>, string> = {
    // "Workout", not "Training" — `WIDGET_META.train` has said Workout since the
    // catalogue was written, so the tile you tapped and the sheet it opened
    // disagreed about the name of the same thing.
    readiness: 'Readiness', sleep: 'Sleep & Recovery', fuel: 'Fuel', train: 'Workout',
    body: 'Body Composition', steps: 'Activity', stack: 'Supplement Protocol',
    vitals: 'Vitals', deficit: 'Deficit Ledger', consistency: 'Consistency',
    // Cardio draws its own Sheet (`CardioSheet`) rather than living in the
    // shared drawer, so this entry only exists to keep the record total.
    cardio: 'Cardio',
  }

  return (
    /* Bands, not a bento of floating cards. The SURFACE reaches both screen
       edges — true edge-to-edge on a phone — while `measure="grid"` keeps the
       CONTENT on the same 80rem column the old `max-w-7xl` gave a desktop. */
    <div className="pb-4">
      {/* ── THE TITLE, AND THEN THE GRID ───────────────────────────────────────
          Two fixed bands used to stand above the grid. The second was the
          Readiness hero — a ~300px orb with a driver panel that only rendered at
          `md` and up, i.e. never on the phone this app is used on — and it is
          gone for good: it is `RecoveryWidget` now, the first entry in the
          catalogue and the only one that opens at LARGE, where its four drivers
          finally fit on a phone.

          The first was the brand header, and deleting ALL of it went too far.
          A screen with no title is not minimal, it is unlabelled — and the
          plan/phase chips are the one piece of context on this screen that the
          widgets underneath deliberately never restate. Both are back, in a
          one-line band that makes no queries of its own.

          What stayed deleted is the part that earned deletion: the live clock
          six pixels under the system one, the greeting on a single-user app,
          and an "Updated HH:MM" stamp with a query behind it. See BrandHeader. */}
      <Surface measure="grid" pad="snug" variant="band">
        <BrandHeader />
      </Surface>

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
        // Not `!!open`: `cardio` draws its own Sheet below, and two Sheets open
        // on one key is an empty drawer behind a full one.
        open={!!open && open !== 'cardio'}
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
        {/* ── THE SECOND "BAR TO BEAT" IS GONE ───────────────────────────────
            A whole `BarToBeatWidget` was mounted inside this sheet — chrome,
            header, accent and all. `bar` is its own tile on the grid AND its
            tap target opens this same sheet, so the common way to arrive here
            was: tap Bar to Beat, watch a sheet open, find Bar to Beat inside
            it. A widget frame nested in the drawer its own tile opened reads as
            a rendering fault, and it was one.

            The targets have a home already: they are a tile you can place, and
            the live logger judges every set against the same baselines. This
            sheet is about the SESSION — today's, or the last run of it. */}
        {/* ── THE BODY SHEET IS THE NEXUS'S BODY PANEL NOW ───────────────────
            It used to be its own thing: ten bordered tiles, each with a 44px
            `LineChart` under it, stacked — roughly 900px of drawer for a
            question the Nexus answers in a third of the space with the ledger
            everybody else reads. Two implementations of one domain, and the
            charts were the reason to keep this one, except the same charts are
            two taps away on the metric's own page.

            `BodyPanel` is the sheet the Progress/Day view opens, whole: the
            composition ledger with its healthy bands, and the Edit measurements
            row. Same component, so the two can no longer drift — and it already
            carries the "recorded on" date, which this sheet never did.

            Edit routes to the Nexus rather than opening a form here: the
            drawer's own form (`InBodyForm`) belongs to the day it edits, and a
            dashboard cannot say which day that is any better than "today". */}
        {open === 'body' && (
          <BodyPanel
            date={logicalTodayISO()}
            /* `types.ts` drifts (see `reports-table-schema`): `Tables<'daily_logs'>`
               is missing the derived mass columns that `DayVaultData['log']`
               declares, while `/api/today` fetches the row with `select('*')` and
               therefore returns them. The cast states what the runtime already
               has; `compositionRows` reads every field defensively, so a genuinely
               absent column is a missing row, never a crash. */
            log={(log ?? null) as unknown as DayVaultData['log']}
            onEdit={() => { setOpen(null); router.push(`/day/${logicalTodayISO()}?section=inbody`) }}
          />
        )}
        {/* Water is gone from here. It is not activity; it sat in this sheet
            because there was a spare cell, and it meant hydration was reported
            in two places that could disagree — here and Fuel, which owns it. */}
        {open === 'steps' && (
          <StepsJourney
            steps={steps}
            goal={fuelGoals.steps ?? goals?.steps_goal ?? null}
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

      {/* Its own Sheet, not a case in the shared drawer: it owns the two cardio
          queries and would otherwise run them for every tap of every other
          tile. Same argument as `WeeklyMuscleSheet` directly above. */}
      <CardioSheet open={open === 'cardio'} onClose={() => setOpen(null)} />
    </div>
  )
}
