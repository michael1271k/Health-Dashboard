'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import { NutritionLogList } from '@/components/nutrition/NutritionLogList'
import { MacroRings } from '@/components/nutrition/MacroRings'
import { FuelForceBand } from '@/components/nutrition/FuelForceBand'
import { WaterHelix } from '@/components/day/WaterHelix'
import { useTodayDailyLog, useUserGoals } from '@/lib/hooks/useDashboard'
import { ScheduleShortcut } from '@/components/day/ScheduleShortcut'
import { logicalTodayISO } from '@/lib/utils/day'
import { useEraFilter, eraDateRange, SUB_PHASE_META } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import type { Tables } from '@/lib/supabase/types'

interface ActiveGoals {
  calorie: number
  protein: number | null
  carbs: number | null
  fat: number | null
  mode: NutritionMode | null
}

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

  const [goals, setGoals] = useState<ActiveGoals>({ calorie: 1955, protein: 170, carbs: 195, fat: 55, mode: 'cut' })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: raw } = await supabase.from('user_goals').select('*').eq('user_id', session.user.id).single()
      const g = raw as Tables<'user_goals'> | null
      if (!g) return
      const mode = (g.goal_preset as NutritionMode | null) ?? null
      const preset = mode ? NUTRITION_PRESETS[mode] : null
      // AUTO-HEAL: if the stored row drifted from its own preset
      // (e.g. maintenance saved at 2,300 while the preset says 2,375), the
      // preset is the source of truth — re-sync the row so selector, rings,
      // and goal text can never disagree again.
      if (preset && (g.calorie_goal !== preset.calorieGoal || g.protein_goal_g !== preset.proteinGoalG
        || g.carbs_goal_g !== preset.carbsGoalG || g.fat_goal_g !== preset.fatGoalG)) {
        setGoals({ calorie: preset.calorieGoal, protein: preset.proteinGoalG, carbs: preset.carbsGoalG, fat: preset.fatGoalG, mode })
        await supabase.from('user_goals').upsert({
          user_id: session.user.id, calorie_goal: preset.calorieGoal, protein_goal_g: preset.proteinGoalG,
          carbs_goal_g: preset.carbsGoalG, fat_goal_g: preset.fatGoalG, goal_preset: mode,
        } as unknown as never, { onConflict: 'user_id' })
        qc.invalidateQueries({ queryKey: ['user_goals'] })
        return
      }
      setGoals({ calorie: g.calorie_goal, protein: g.protein_goal_g, carbs: g.carbs_goal_g, fat: g.fat_goal_g, mode })
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The nested sub-phase (Cut / Maint / Bulk under Helix 5.1) narrows the day
  // list by its DB-stored per-day phase. Only the Helix era carries the sub-
  // phase row; 'all' / 'ppl' show every day in the era window.
  const filteredLogs = era === 'axis' ? (logs ?? []).filter((l) => l.phase === resolvedPhase) : (logs ?? [])

  const last7 = (logs ?? []).slice(0, 7)
  const inRange = last7.filter((l) => l.calories !== null && Math.abs(l.calories - goals.calorie) <= 100).length
  const adherence = last7.length ? Math.round((inRange / last7.length) * 100) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Nutrition</h1>
        <p className="text-muted text-fluid-sm mt-0.5">Macro rings · daily fuel cells · auto-tagged phase</p>
      </div>

      {/* Macro rings hero — MFP-style rings + 7-day phase cells */}
      <MacroRings
        today={todayLog ? { calories: todayLog.calories, proteinG: todayLog.proteinG, carbsG: todayLog.carbsG, fatG: todayLog.fatG } : null}
        logs={logs ?? []}
        goals={{ calorie: goals.calorie, protein: goals.protein, carbs: goals.carbs, fat: goals.fat }}
        date={todayISO}
      />

      {/* Deep-dive into micronutrients + advanced HealthKit signals */}
      <Link href="/nutrition/micros" className="glass-card w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(138,111,168,0.16)', color: '#E0703C' }}>
          <FlaskConical className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text">Nutrition &amp; Micros</span>
          <span className="block text-[11px] text-muted">Fiber, iron, vitamins &amp; advanced signals — with your cut targets</span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      </Link>

      {/* Water Intake — the same glowing DNA double-helix as the Nexus gauge */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Water intake</div>
        <WaterHelix ml={dailyLog?.water_ml ?? null} goalMl={userGoals?.water_goal_ml ?? 3000} />
      </div>

      {/* Fuel → Force: links today's fuel to today's session (renders only if trained) */}
      <FuelForceBand date={todayISO} proteinG={todayLog?.proteinG ?? null} proteinGoal={goals.protein} />

      {/* Training-day shortcut → the deck, pre-seeded (hidden once logged) */}
      <ScheduleShortcut />

      {/* Era + nested sub-phase filter + dense daily log */}
      <div className="space-y-3">
        <EraFilterPills />
        <NutritionLogList
          logs={filteredLogs}
          goals={goals}
          isLoading={isLoading}
          emptyMessage={era === 'axis'
            ? `No ${SUB_PHASE_META[resolvedPhase].label} days yet in Helix 5.1.`
            : 'No nutrition data yet — paste from Hevy or sync from the app.'}
          onDayClick={(d) => router.push(`/day/${d}`)}
        />
      </div>

      {/* Phase targets (Cut / Maintenance / Lean Bulk) moved to Settings → Plan &
          Phase, where selecting one also drives step goal + target weight + tags.
          A discreet pointer keeps the adherence read here. */}
      <Link href="/settings" className="glass-card w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
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
