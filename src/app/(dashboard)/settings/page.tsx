'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { derivePhase, PHASE_META } from '@/lib/nutrition/phase'
import type { Tables } from '@/lib/supabase/types'

type ContextMode = 'normal' | 'travel' | 'illness' | 'emergency'

interface Goals {
  sleep_goal_hours: number
  calorie_goal: number
  protein_goal_g: number
  carbs_goal_g: number
  fat_goal_g: number
  steps_goal: number
  active_cal_goal: number
  water_goal_ml: number
  context_mode: ContextMode
  goal_preset: string | null
}

const DEFAULTS: Goals = {
  sleep_goal_hours: 8,
  calorie_goal: 2500,
  protein_goal_g: 180,
  carbs_goal_g: 250,
  fat_goal_g: 80,
  steps_goal: 10000,
  active_cal_goal: 500,
  water_goal_ml: 3000,
  context_mode: 'normal',
  goal_preset: null,
}

const CONTEXT_LABELS: Record<ContextMode, { label: string; desc: string }> = {
  normal:    { label: 'Normal',    desc: 'Standard scoring and targets' },
  travel:    { label: 'Travel',    desc: 'Relaxed activity / sleep targets' },
  illness:   { label: 'Illness',   desc: 'Penalties reduced, rest prioritized' },
  emergency: { label: 'Emergency', desc: 'All penalties strongly relaxed' },
}

export default function SettingsPage() {
  const [goals, setGoals] = useState<Goals>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // Supabase v2: hand-authored Omit<> types resolve to never — cast explicitly
      const { data: rawData } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', session.user.id)
        .single()
      const data = rawData as Tables<'user_goals'> | null
      if (data) {
        setGoals({
          sleep_goal_hours: data.sleep_goal_hours ?? DEFAULTS.sleep_goal_hours,
          calorie_goal: data.calorie_goal ?? DEFAULTS.calorie_goal,
          protein_goal_g: data.protein_goal_g ?? DEFAULTS.protein_goal_g,
          carbs_goal_g: data.carbs_goal_g ?? DEFAULTS.carbs_goal_g,
          fat_goal_g: data.fat_goal_g ?? DEFAULTS.fat_goal_g,
          steps_goal: data.steps_goal ?? DEFAULTS.steps_goal,
          active_cal_goal: data.active_cal_goal ?? DEFAULTS.active_cal_goal,
          water_goal_ml: data.water_goal_ml ?? DEFAULTS.water_goal_ml,
          context_mode: (data.context_mode ?? 'normal') as ContextMode,
          goal_preset: data.goal_preset ?? null,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save(updates: Partial<Goals>) {
    setSaving(true)
    setStatus(null)
    const next = { ...goals, ...updates }
    setGoals(next)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    // Supabase v2: upsert types resolve to never[] on Omit<> Insert types — cast explicitly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from('user_goals')
      .upsert({ user_id: session.user.id, ...next } as unknown as never, { onConflict: 'user_id' })

    setStatus(error
      ? { type: 'error', msg: error.message }
      : { type: 'success', msg: 'Saved.' }
    )
    setSaving(false)
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-text text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/60 transition-[border-color] duration-200'

  if (loading) return <p className="text-muted-vital text-sm">Loading…</p>

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Settings</h1>
        <p className="text-muted-vital text-sm mt-0.5">Goals &amp; context for daily scoring</p>
      </div>

      {/* Nutrition modes moved to the Nutrition tab */}
      {goals.goal_preset && (
        <p className="text-xs text-muted-vital">
          Active nutrition mode: <span className="text-primary capitalize">{goals.goal_preset}</span>
          <span className="opacity-70"> — change it in the Nutrition tab.</span>
        </p>
      )}

      {/* Context mode */}
      <section className="vital-card space-y-3">
        <h2 className="font-semibold text-text">Context Mode</h2>
        <p className="text-xs text-muted-vital">
          Adjusts scoring penalties for exceptional circumstances.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CONTEXT_LABELS) as ContextMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => save({ context_mode: mode })}
              disabled={saving}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors duration-150
                ${goals.context_mode === mode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-vital hover:border-primary/40 hover:text-text'}`}
            >
              <div className="font-medium">{CONTEXT_LABELS[mode].label}</div>
              <div className="text-xs opacity-70 mt-0.5">{CONTEXT_LABELS[mode].desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Nutrition goals */}
      <section className="vital-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text">Nutrition Goals</h2>
          {(() => {
            const p = derivePhase(goals.calorie_goal)
            if (!p) return null
            const m = PHASE_META[p]
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide"
                style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}55`, boxShadow: `0 0 10px ${m.color}44` }}>
                Auto: {m.label}
              </span>
            )
          })()}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {([
            { key: 'calorie_goal' as const,   label: 'Calories (kcal)',  step: 50 },
            { key: 'protein_goal_g' as const,  label: 'Protein (g)',     step: 5  },
            { key: 'carbs_goal_g' as const,    label: 'Carbs (g)',       step: 5  },
            { key: 'fat_goal_g' as const,      label: 'Fat (g)',         step: 1  },
          ]).map(({ key, label, step }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-muted-vital">{label}</label>
              <input
                type="number"
                step={step}
                value={goals[key]}
                onChange={(e) => setGoals((g) => ({ ...g, [key]: Number(e.target.value), goal_preset: null }))}
                onBlur={() => save({ [key]: goals[key], goal_preset: null })}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Activity + sleep + water */}
      <section className="vital-card space-y-4">
        <h2 className="font-semibold text-text">Activity &amp; Recovery Goals</h2>
        <div className="grid grid-cols-2 gap-4">
          {([
            { key: 'sleep_goal_hours' as const,  label: 'Sleep (hours)',       step: 0.5 },
            { key: 'steps_goal' as const,         label: 'Daily Steps',         step: 500  },
            { key: 'active_cal_goal' as const,    label: 'Active Calories',     step: 50   },
            { key: 'water_goal_ml' as const,      label: 'Water (ml)',          step: 100  },
          ]).map(({ key, label, step }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-muted-vital">{label}</label>
              <input
                type="number"
                step={step}
                value={goals[key]}
                onChange={(e) => setGoals((g) => ({ ...g, [key]: Number(e.target.value) }))}
                onBlur={() => save({ [key]: goals[key] })}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </section>

      {status && (
        <p className={`text-sm ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>
          {status.msg}
        </p>
      )}

      {saving && <p className="text-xs text-muted-vital">Saving…</p>}
    </div>
  )
}
