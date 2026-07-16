'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import { NutritionLogList } from '@/components/nutrition/NutritionLogList'
import { MacroRings } from '@/components/nutrition/MacroRings'
import { FuelForceBand } from '@/components/nutrition/FuelForceBand'
import { DaySummaryModal } from '@/components/nutrition/DaySummaryModal'
import { logicalTodayISO } from '@/lib/utils/day'
import { PHASE_META, type Phase } from '@/lib/nutrition/phase'
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
  const { data: logs, isLoading } = useDailyLogs(30)
  const [filter, setFilter] = useState<'all' | Phase>('all')

  const [goals, setGoals] = useState<ActiveGoals>({ calorie: 1935, protein: 180, carbs: 180, fat: 55, mode: 'cut' })
  const [saving, setSaving] = useState(false)
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [dayModal, setDayModal] = useState<string | null>(null)

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

  async function applyMode(mode: NutritionMode) {
    const preset = NUTRITION_PRESETS[mode]
    setSaving(true)
    setGoals({ calorie: preset.calorieGoal, protein: preset.proteinGoalG, carbs: preset.carbsGoalG, fat: preset.fatGoalG, mode })
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('user_goals').upsert({
        user_id: session.user.id, calorie_goal: preset.calorieGoal, protein_goal_g: preset.proteinGoalG,
        carbs_goal_g: preset.carbsGoalG, fat_goal_g: preset.fatGoalG, goal_preset: mode,
      } as unknown as never, { onConflict: 'user_id' })
      qc.invalidateQueries({ queryKey: ['user_goals'] })
    }
    setSaving(false)
  }

  // Phase is DERIVED per-day from calories (stored in the DB); filter on it.
  const filteredLogs = filter === 'all' ? (logs ?? []) : (logs ?? []).filter((l) => l.phase === filter)

  const last7 = (logs ?? []).slice(0, 7)
  const inRange = last7.filter((l) => l.calories !== null && Math.abs(l.calories - goals.calorie) <= 100).length
  const adherence = last7.length ? Math.round((inRange / last7.length) * 100) : null

  const FILTERS: Array<'all' | Phase> = ['all', 'cut', 'maintenance', 'bulk']

  const todayLog = (logs ?? []).find((l) => l.date === logicalTodayISO()) ?? null

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
      />

      {/* Fuel → Force: links today's fuel to today's session (renders only if trained) */}
      <FuelForceBand date={logicalTodayISO()} proteinG={todayLog?.proteinG ?? null} proteinGoal={goals.protein} />

      {/* Phase filter + dense daily log */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-fluid-xs text-muted mr-1">Phase:</span>
          {FILTERS.map((f) => {
            const active = filter === f
            const color = f === 'all' ? '#19E3B1' : PHASE_META[f].color
            return (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold capitalize transition-colors border"
                style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#8B97B2', borderColor: 'transparent' }}>
                {f === 'maintenance' ? 'Maint' : f}
              </button>
            )
          })}
        </div>
        <NutritionLogList
          logs={filteredLogs}
          goals={goals}
          isLoading={isLoading}
          emptyMessage={filter === 'all' ? 'No nutrition data yet — paste from Hevy or sync from the app.' : `No days in the ${filter} phase yet.`}
          onDayClick={(d) => setDayModal(d)}
        />
      </div>

      {/* Targets — demoted to a discreet collapsible at the bottom:
          changing phase is a monthly event, not prime-screen real estate. */}
      <section className="helix-card">
        <button onClick={() => setTargetsOpen((v) => !v)} aria-expanded={targetsOpen}
          className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left">
          <span className="font-semibold text-text">Targets</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {goals.mode && <span className="capitalize text-primary font-semibold">{NUTRITION_PRESETS[goals.mode].label}</span>}
            <span className="helix-num">{goals.calorie.toLocaleString()} kcal</span>
            {adherence !== null && <span>· 7d adherence <span className="text-primary font-semibold">{adherence}%</span></span>}
            <ChevronDown className={`w-4 h-4 transition-transform ${targetsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
        {targetsOpen && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {(Object.keys(NUTRITION_PRESETS) as NutritionMode[]).map((mode) => {
              const preset = NUTRITION_PRESETS[mode]
              const active = goals.mode === mode
              return (
                <button key={mode} onClick={() => applyMode(mode)} disabled={saving} aria-pressed={active}
                  className={`glass-card glass-hover py-3 px-2 text-center transition-all duration-200 ${active ? 'glass-card--accent text-primary' : 'text-muted'}`}>
                  <div className="font-semibold text-sm">{preset.label}</div>
                  <div className="text-xs opacity-70 mt-0.5 tabular-nums">{preset.calorieGoal.toLocaleString()} kcal</div>
                  <div className="text-[10px] opacity-60 mt-0.5">
                    {preset.proteinGoalG !== null ? `${preset.proteinGoalG}P / ${preset.carbsGoalG}C / ${preset.fatGoalG}F` : 'macros TBD'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Liquid-glass day summary */}
      <DaySummaryModal date={dayModal} onClose={() => setDayModal(null)} />
    </div>
  )
}
