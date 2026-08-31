'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import { NutritionLogList } from '@/components/nutrition/NutritionLogList'
import { MacroCards } from '@/components/nutrition/MacroCards'
import { FuelForceBand } from '@/components/nutrition/FuelForceBand'
import { WaterBar } from '@/components/nutrition/WaterBar'
import { WaterOverrideSheet } from '@/components/day/WaterOverrideSheet'
import { ChartRange, DEFAULT_RANGE_DAYS } from '@/components/charts/ChartRange'
import { useMacroHistory } from '@/lib/hooks/useCharts'

// Recharts is ~50kB and this page's first paint is the rings, not the chart —
// client-only so it never reaches the Nutrition bundle.
const MacroProgressChart = dynamic(
  () => import('@/components/charts/MacroProgressChart').then((m) => m.MacroProgressChart),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
        <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    ),
  },
)
import { useTodayDailyLog, useUserGoals } from '@/lib/hooks/useDashboard'
import { ScheduleShortcut } from '@/components/day/ScheduleShortcut'
import { logicalTodayISO } from '@/lib/utils/day'
import { useEraFilter, eraDateRange, SUB_PHASE_META } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import { ExceptionDayBanner } from '@/components/nutrition/ExceptionDayBanner'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'
import { useNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { useHistoricalGoals } from '@/lib/hooks/useHistoricalGoals'

export default function NutritionPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { era, resolvedPhase } = useEraFilter()
  // Era-scoped window (NOT a rolling 30 days): 'all' reaches back to the first
  // tracked phase so the full Notion-imported history renders.
  const { data: logs, isLoading } = useDailyLogs(eraDateRange(era))

  // The rings + Fuel→Force hero ALWAYS show TODAY's live macros, independent of
  // the era/history filter — a 'PPL Legacy' selection (whose window ends before
  // today) must never blank them out.
  const todayISO = logicalTodayISO()
  const { data: todayLogs } = useDailyLogs({ from: todayISO, to: todayISO })
  const todayLog = (todayLogs ?? []).find((l) => l.date === todayISO) ?? null
  // Hydration — today's dietary water vs the goal (shared DNA-helix gauge).
  const { data: dailyLog } = useTodayDailyLog()
  const { data: userGoals } = useUserGoals()

  // ONE goal source for the whole app — see useNutritionGoals for why local
  // state seeded with a literal (1955, a number no preset has ever contained)
  // was worse than no goal at all.
  const goals = useNutritionGoals()
  const [waterEdit, setWaterEdit] = useState(false)
  const [macroDays, setMacroDays] = useState(DEFAULT_RANGE_DAYS)
  const { data: macroHistory, isLoading: macroLoading } = useMacroHistory(macroDays)

  /**
   * The auto-heal runs AT MOST ONCE per mount, and that latch is the only thing
   * standing between this effect and a write loop.
   *
   * The shape is inherently circular: it is keyed on `userGoals`, and its body
   * invalidates `['user_goals']` — the very query that produces `userGoals`. It
   * terminated only because the refetch was assumed to come back matching the
   * preset, which makes the drift check fail on the second pass. That assumption
   * holds exactly as long as the upsert succeeds, and the upsert's error was
   * never inspected. Offline, behind an RLS hiccup, or against a column the
   * schema cache has not caught up with, supabase-js RETURNS the error rather
   * than throwing: the write silently does nothing, the refetch returns the same
   * drifted row, the check fires again — and the page hammers the database for
   * as long as it stays open.
   *
   * A ref latch makes termination structural instead of conditional on a
   * successful round-trip, and the invalidation now happens only when the write
   * actually landed. If the heal fails it is simply retried on the next mount,
   * which is the right cadence for repairing a row that has already been wrong
   * for some time.
   */
  const healed = useRef(false)

  // Reads the row `useUserGoals()` already has in cache instead of issuing its
  // own getSession + select — that pair was a second, uncached fetch of exactly
  // the same row on every Nutrition mount.
  //
  // What this effect NO LONGER does is decide what the page displays. It only
  // repairs the stored row, because that row is what OTHER readers see — the
  // widget snapshot endpoint among them, which has no `useNutritionGoals` to
  // resolve through. The display resolves through the hook either way, so a
  // failed heal now costs a stale widget rather than a wrong ring.
  useEffect(() => {
    async function heal() {
      const g = userGoals ?? null
      if (!g || healed.current) return
      const mode = (g.goal_preset as NutritionMode | null) ?? null
      const preset = mode ? NUTRITION_PRESETS[mode] : null
      // AUTO-HEAL: if the stored row drifted from its own preset
      // (e.g. maintenance saved at 2,300 while the preset says 2,375), the
      // preset is the source of truth — re-sync the row so every reader outside
      // this page agrees with what the page itself is showing.
      const drifted = preset != null && (
        g.calorie_goal !== preset.calorieGoal || g.protein_goal_g !== preset.proteinGoalG
        || g.carbs_goal_g !== preset.carbsGoalG || g.fat_goal_g !== preset.fatGoalG
      )
      if (!preset || !drifted) return
      healed.current = true
      const { error } = await supabase.from('user_goals').upsert({
        user_id: g.user_id, calorie_goal: preset.calorieGoal, protein_goal_g: preset.proteinGoalG,
        carbs_goal_g: preset.carbsGoalG, fat_goal_g: preset.fatGoalG, goal_preset: mode,
      } as unknown as never, { onConflict: 'user_id' })
      // Only re-read if there is something new to read. Invalidating after a
      // failed write is what closed the loop.
      if (!error) qc.invalidateQueries({ queryKey: ['user_goals'] })
    }
    heal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGoals])

  // The nested sub-phase (Cut / Maint / Bulk under Helix 5.1) narrows the day
  // list by its DB-stored per-day phase. Only the Helix era carries the sub-
  // phase row; 'all' / 'ppl' show every day in the era window.
  const filteredLogs = useMemo(
    () => (era === 'axis' ? (logs ?? []).filter((l) => l.phase === resolvedPhase) : (logs ?? [])),
    [logs, era, resolvedPhase],
  )

  /**
   * ── EVERY DAY ON THIS PAGE IS GRADED BY ITS OWN TARGET ─────────────────────
   *
   * The chart, the adherence read and the history list all used `goals`, which
   * is TODAY's resolved target. That works until the target moves, and moving it
   * is what a lever is for: the maintenance rung raised carbohydrate from 206 g
   * to 244 g on 30 Aug and instantly re-marked a month of finished days against
   * a number that did not exist when they were eaten. Green days went yellow,
   * and the 7-day adherence read — the same single figure, ±100 kcal of a
   * calorie goal that had just jumped by ~150 — collapsed to 14%.
   *
   * `goalFor` resolves the whole ladder per date (`useHistoricalGoals`). The
   * dates handed to it are exactly the days these three surfaces draw, so the
   * one `daily_targets` query it makes is as wide as the screen and no wider.
   */
  const historyDates = useMemo(() => {
    const seen = new Set<string>()
    for (const l of logs ?? []) seen.add(l.date)
    for (const m of macroHistory ?? []) seen.add(m.date)
    return Array.from(seen)
  }, [logs, macroHistory])
  const goalFor = useHistoricalGoals(historyDates)

  // Whole-history scans that ran on every render, including every keystroke in
  // any child input.
  // Declared exceptions leave BOTH sides of the fraction — they are not misses,
  // and counting them as hits would be worse still. A week with one planned
  // dinner reads "83% (6 days)", not 71% and not a fictional 86%.
  const adherence = useMemo(() => {
    const last7 = (logs ?? []).slice(0, 7).filter((l) => !isExceptionDay(l.exception))
    if (!last7.length) return null
    const inRange = last7.filter((l) => {
      if (l.calories === null) return false
      // That Monday's target, not this Friday's. A day you hit is a day you hit.
      const target = goalFor(l.date).calorie
      return target > 0 && Math.abs(l.calories - target) <= 100
    }).length
    return Math.round((inRange / last7.length) * 100)
  }, [logs, goalFor])

  return (
    <div data-boxed className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Nutrition</h1>
        <p className="text-muted text-fluid-sm mt-0.5">Macro rings · daily fuel cells · auto-tagged phase</p>
      </div>

      {/* Compact fuel hero — calories card + macro card + 7-day phase cells */}
      <MacroCards
        today={todayLog ? { calories: todayLog.calories, proteinG: todayLog.proteinG, carbsG: todayLog.carbsG, fatG: todayLog.fatG } : null}
        logs={logs ?? []}
        goals={{ calorie: goals.calorie, protein: goals.protein, carbs: goals.carbs, fat: goals.fat }}
        date={todayISO}
      />

      {/* ── HYDRATION, UNDER THE MACROS ──
          One line, directly beneath the bars it belongs with. It used to sit
          ABOVE the rings, so the first thing a page about eating showed you was
          how much you had drunk — and the calorie figure, which is the reason
          the page is opened, started below the fold on a phone.
          Still one line, not the 200px DNA helix it was before that: a single
          ratio does not earn the largest element on a page about macros. See
          `WaterBar`. */}
      <WaterBar
        ml={dailyLog?.water_ml ?? null}
        goalMl={userGoals?.water_goal_ml ?? 3000}
        onEdit={() => setWaterEdit(true)}
      />

      {/* A day allowed to miss its target — declared, never inferred. Sits under
          the rings because it is a statement ABOUT today's numbers, and it has
          to be reachable before the evening it describes. */}
      <ExceptionDayBanner
        date={todayISO}
        stored={(dailyLog as { nutrition_exception?: string | null } | null)?.nutrition_exception ?? null}
        estimated={(dailyLog as { nutrition_estimated?: boolean | null } | null)?.nutrition_estimated ?? false}
      />

      {/* Fuel → Force: links today's fuel to today's session (renders only if trained) */}
      <FuelForceBand date={todayISO} proteinG={todayLog?.proteinG ?? null} proteinGoal={goals.protein} />

      {/* Training-day shortcut → the deck, pre-seeded (hidden once logged) */}
      <ScheduleShortcut />

      <WaterOverrideSheet
        open={waterEdit}
        onClose={() => setWaterEdit(false)}
        date={todayISO}
        currentMl={dailyLog?.water_ml ?? null}
        goalMl={userGoals?.water_goal_ml ?? 3000}
      />

      {/* Deep-dive into micronutrients + advanced HealthKit signals */}
      <Link href="/nutrition/nutrients" className="rounded-xl border border-white/[0.08] bg-white/[0.04] w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(138,111,168,0.16)', color: '#E0703C' }}>
          <FlaskConical className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text">Nutrition &amp; Nutrients</span>
          <span className="block text-[11px] text-muted">Fiber, iron, vitamins &amp; advanced signals — with your cut targets</span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      </Link>

      {/* Macros vs goal — moved here from the deleted central Analytics view.
          It graded the same numbers the rings above show, from a different tab.
          Its window is the chart control's, NOT the history filter's below:
          `useDailyLogs(eraDateRange(era))` reaches back to the first tracked
          phase on 'All', and a 200-day bar chart is a smear. */}
      <div className="space-y-3">
        <ChartRange value={macroDays} onChange={setMacroDays} />
        <MacroProgressChart data={macroHistory ?? []} goals={goals} goalFor={goalFor} isLoading={macroLoading} />
      </div>

      {/* ── History, collapsed ──
          The daily log is a REFERENCE, not an answer. It was 28 rows of dense
          numbers sitting between the chart and the plan link, so the page's own
          question — am I on track today? — was answered at the top and then
          buried under a month of days that had already been answered.

          A native <details> keeps it one tap away (and findable by the
          browser's own in-page search, which a JS-gated list is not) while the
          first screen stays about today. */}
      <details className="group">
        <summary className="list-none cursor-pointer select-none flex items-center gap-2 py-2 text-fluid-sm font-semibold text-text">
          <ChevronRight className="w-4 h-4 text-muted shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          History
          <span className="text-[11px] font-normal text-muted">· {filteredLogs.length} days</span>
        </summary>
        <div className="space-y-3 pt-2">
          <EraFilterPills />
          <NutritionLogList
            logs={filteredLogs}
            goals={goals}
            goalFor={goalFor}
            isLoading={isLoading}
            emptyMessage={era === 'axis'
              ? `No ${SUB_PHASE_META[resolvedPhase].label} days yet in Helix 5.1.`
              : 'No nutrition data yet — sync from the app.'}
            onDayClick={(d) => router.push(`/day/${d}`)}
          />
        </div>
      </details>

      {/* Phase targets (Cut / Maintenance / Lean Bulk) moved to Settings → Plan &
          Phase, where selecting one also drives step goal + target weight + tags.
          A discreet pointer keeps the adherence read here. */}
      <Link href="/settings" className="rounded-xl border border-white/[0.08] bg-white/[0.04] w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <span className="flex-1 min-w-0 text-sm">
          <span className="font-semibold text-text">Plan &amp; targets</span>
          <span className="text-muted"> · </span>
          {goals.mode && <span className="capitalize text-primary font-semibold">{NUTRITION_PRESETS[goals.mode].label}</span>}
          <span className="helix-num text-muted"> · {goals.calorie.toLocaleString()} kcal</span>
          {adherence !== null && <span className="text-muted"> · 7d adherence <span className="text-primary font-semibold">{adherence}%</span></span>}
        </span>
        <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      </Link>
    </div>
  )
}
