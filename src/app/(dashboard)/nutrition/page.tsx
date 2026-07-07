'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useDailyLogs } from '@/lib/hooks/useNutrition'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import { NutritionLogList } from '@/components/nutrition/NutritionLogList'
import { FuelGauge } from '@/components/nutrition/FuelGauge'
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

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: raw } = await supabase.from('user_goals').select('*').eq('user_id', session.user.id).single()
      const g = raw as Tables<'user_goals'> | null
      if (g) setGoals({ calorie: g.calorie_goal, protein: g.protein_goal_g, carbs: g.carbs_goal_g, fat: g.fat_goal_g, mode: (g.goal_preset as NutritionMode | null) ?? null })
    }
    load()
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
        <p className="text-muted-vital text-fluid-sm mt-0.5">Fuel gauge · macro arcs · auto-tagged phase</p>
      </div>

      {/* Fuel gauge hero — today's kcal needle + macro arcs + 7-day cells */}
      <FuelGauge
        today={todayLog ? { calories: todayLog.calories, proteinG: todayLog.proteinG, carbsG: todayLog.carbsG, fatG: todayLog.fatG } : null}
        logs={logs ?? []}
        goals={{ calorie: goals.calorie, protein: goals.protein, carbs: goals.carbs, fat: goals.fat }}
      />

      {/* Targets / mode selector */}
      <section className="helix-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text">Targets</h2>
          {adherence !== null && (
            <span className="text-xs text-muted-vital">7-day adherence: <span className="text-primary font-semibold">{adherence}%</span></span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(NUTRITION_PRESETS) as NutritionMode[]).map((mode) => {
            const preset = NUTRITION_PRESETS[mode]
            const active = goals.mode === mode
            return (
              <button key={mode} onClick={() => applyMode(mode)} disabled={saving} aria-pressed={active}
                className={`glass-card glass-hover py-3 px-2 text-center transition-all duration-200 ${active ? 'glass-card--accent text-primary' : 'text-muted-vital'}`}>
                <div className="font-semibold text-sm">{preset.label}</div>
                <div className="text-xs opacity-70 mt-0.5 tabular-nums">{preset.calorieGoal.toLocaleString()} kcal</div>
                <div className="text-[10px] opacity-60 mt-0.5">
                  {preset.proteinGoalG !== null ? `${preset.proteinGoalG}P / ${preset.carbsGoalG}C / ${preset.fatGoalG}F` : 'macros TBD'}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Phase filter + dense daily log */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-fluid-xs text-muted-vital mr-1">Phase:</span>
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
          emptyMessage={filter === 'all' ? 'No nutrition data yet — paste from Hevy or sync your Shortcut.' : `No days in the ${filter} phase yet.`}
        />
      </div>
    </div>
  )
}
