'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable, type TableColumn } from '@/components/data/DataTable'
import { useDailyLogs, type DailyLog } from '@/lib/hooks/useNutrition'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import { useNutritionPhases, phaseForDate, useSetNutritionPhase } from '@/lib/hooks/useNutritionPhases'
import type { Tables } from '@/lib/supabase/types'

interface ActiveGoals {
  calorie: number
  protein: number | null
  carbs: number | null
  fat: number | null
  mode: NutritionMode | null
}

function fmtNum(v: number | null, unit = '') {
  if (v === null) return <span className="text-muted-vital">—</span>
  return (
    <span className="vital-number">
      {Math.round(v)}
      {unit && <span className="text-xs text-muted-vital ml-0.5">{unit}</span>}
    </span>
  )
}

// Graded value vs goal (only when goal is defined); null goal → plain display
function gradedVal(v: number | null, goal: number | null, unit: string, higherIsBetter = true) {
  if (v === null) return <span className="text-muted-vital">—</span>
  if (goal === null || goal === 0) return fmtNum(v, unit)
  const ratio = v / goal
  const color = higherIsBetter
    ? ratio >= 0.95 ? '#19E3B1' : ratio >= 0.75 ? '#FFB020' : '#FF5470'
    : ratio <= 1.05 ? '#19E3B1' : ratio <= 1.20 ? '#FFB020' : '#FF5470'
  return (
    <span className="vital-number font-semibold" style={{ color }}>
      {Math.round(v)}
      <span className="text-xs font-normal text-muted-vital ml-0.5">{unit}</span>
    </span>
  )
}

export default function NutritionPage() {
  const qc = useQueryClient()
  const { data: logs, isLoading } = useDailyLogs(30)
  const { data: phases } = useNutritionPhases()
  const setPhase = useSetNutritionPhase()
  const [filter, setFilter] = useState<'all' | NutritionMode>('all')

  const [goals, setGoals] = useState<ActiveGoals>({
    calorie: 1935, protein: 180, carbs: 180, fat: 55, mode: 'cut',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: raw } = await supabase
        .from('user_goals').select('*').eq('user_id', session.user.id).single()
      const g = raw as Tables<'user_goals'> | null
      if (g) {
        setGoals({
          calorie: g.calorie_goal,
          protein: g.protein_goal_g,
          carbs: g.carbs_goal_g,
          fat: g.fat_goal_g,
          mode: (g.goal_preset as NutritionMode | null) ?? null,
        })
      }
    }
    load()
  }, [])

  async function applyMode(mode: NutritionMode) {
    const preset = NUTRITION_PRESETS[mode]
    setSaving(true)
    setGoals({
      calorie: preset.calorieGoal,
      protein: preset.proteinGoalG,
      carbs: preset.carbsGoalG,
      fat: preset.fatGoalG,
      mode,
    })
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('user_goals').upsert({
        user_id: session.user.id,
        calorie_goal: preset.calorieGoal,
        protein_goal_g: preset.proteinGoalG,
        carbs_goal_g: preset.carbsGoalG,
        fat_goal_g: preset.fatGoalG,
        goal_preset: mode,
      } as unknown as never, { onConflict: 'user_id' })
      qc.invalidateQueries({ queryKey: ['user_goals'] })
    }
    setPhase.mutate(mode)  // drop a dated timeline marker (effective today)
    setSaving(false)
  }

  const filteredLogs = filter === 'all'
    ? (logs ?? [])
    : (logs ?? []).filter((l) => phaseForDate(phases ?? [], l.date) === filter)

  // 7-day calorie adherence (within ±100 kcal of goal)
  const last7 = (logs ?? []).slice(0, 7)
  const inRange = last7.filter(
    (l) => l.calories !== null && Math.abs(l.calories - goals.calorie) <= 100,
  ).length
  const adherence = last7.length ? Math.round((inRange / last7.length) * 100) : null

  const columns: TableColumn<DailyLog>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        <span className="text-text font-medium">
          {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IL', {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        </span>
      ),
    },
    { key: 'cal',     header: 'Calories', align: 'right', render: (r) => gradedVal(r.calories, goals.calorie, 'kcal', false) },
    { key: 'protein', header: 'Protein',  align: 'right', render: (r) => gradedVal(r.proteinG, goals.protein, 'g', true) },
    { key: 'carbs',   header: 'Carbs',    align: 'right', render: (r) => gradedVal(r.carbsG, goals.carbs, 'g', false) },
    { key: 'fat',     header: 'Fat',      align: 'right', render: (r) => gradedVal(r.fatG, goals.fat, 'g', false) },
    { key: 'steps',   header: 'Steps',    align: 'right', render: (r) => fmtNum(r.steps) },
    {
      key: 'score', header: 'Score', align: 'right',
      render: (r) => {
        if (r.score === null) return <span className="text-muted-vital">—</span>
        const color = r.score >= 80 ? '#2DD4A7' : r.score >= 60 ? '#FFB020' : '#FF4D6D'
        return <span className="font-bold tabular-nums" style={{ color }}>{r.score}</span>
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Nutrition</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Mode &amp; daily macro compliance</p>
      </div>

      {/* Mode selector */}
      <section className="vital-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text">Nutrition Mode</h2>
          {adherence !== null && (
            <span className="text-xs text-muted-vital">
              7-day calorie adherence:{' '}
              <span className="text-primary font-semibold">{adherence}%</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(NUTRITION_PRESETS) as NutritionMode[]).map((mode) => {
            const preset = NUTRITION_PRESETS[mode]
            const active = goals.mode === mode
            return (
              <button
                key={mode}
                onClick={() => applyMode(mode)}
                disabled={saving}
                aria-pressed={active}
                className={`glass-card glass-hover py-3 px-2 text-center transition-all duration-200
                            ${active ? 'glass-card--accent text-primary' : 'text-muted-vital'}`}
              >
                <div className="font-semibold text-sm">{preset.label}</div>
                <div className="text-xs opacity-70 mt-0.5 tabular-nums">
                  {preset.calorieGoal.toLocaleString()} kcal
                </div>
                <div className="text-[10px] opacity-60 mt-0.5">
                  {preset.proteinGoalG !== null
                    ? `${preset.proteinGoalG}P / ${preset.carbsGoalG}C / ${preset.fatGoalG}F`
                    : 'macros TBD'}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Phase filter + daily compliance table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-fluid-xs text-muted-vital">Phase:</span>
          {(['all', 'cut', 'maintenance', 'bulk'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-fluid-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-vital border border-transparent hover:text-text'}`}>
              {f}
            </button>
          ))}
          {(phases?.length ?? 0) > 0 && (
            <span className="ml-auto text-fluid-xs text-muted-vital">
              {phases!.length} phase marker{phases!.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={filteredLogs}
          keyExtractor={(r) => r.date}
          isLoading={isLoading}
          emptyMessage={filter === 'all' ? 'No nutrition data yet. Sync Apple Health via Health Auto Export.' : `No days logged in the ${filter} phase yet.`}
        />
      </div>
    </div>
  )
}
