'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
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
  day_cutoff_hour: number
  unit_system: 'kg' | 'lb'
  reduce_motion: boolean
  auto_log_supplements: boolean
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
  day_cutoff_hour: 4,
  unit_system: 'kg',
  reduce_motion: false,
  auto_log_supplements: false,
}

const CONTEXT_LABELS: Record<ContextMode, { label: string; desc: string }> = {
  normal:    { label: 'Normal',    desc: 'Standard scoring and targets' },
  travel:    { label: 'Travel',    desc: 'Relaxed activity / sleep targets' },
  illness:   { label: 'Illness',   desc: 'Penalties reduced, rest prioritized' },
  emergency: { label: 'Emergency', desc: 'All penalties strongly relaxed' },
}

/** Mirror device prefs to localStorage (read synchronously by the logical-day + units + motion utils). */
function applyPrefsToDevice(cutoff: number, units: 'kg' | 'lb', motion: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('helix_day_cutoff', String(cutoff))
  window.localStorage.setItem('helix_units', units)
  window.localStorage.setItem('helix_reduce_motion', motion ? '1' : '0')
  document.documentElement.dataset.reduceMotion = motion ? 'true' : 'false'
  window.dispatchEvent(new Event('apex-units-change'))
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
          day_cutoff_hour: data.day_cutoff_hour ?? 4,
          unit_system: (data.unit_system ?? 'kg') as 'kg' | 'lb',
          reduce_motion: data.reduce_motion ?? false,
          auto_log_supplements: data.auto_log_supplements ?? false,
        })
        applyPrefsToDevice(data.day_cutoff_hour ?? 4, (data.unit_system ?? 'kg') as 'kg' | 'lb', data.reduce_motion ?? false)
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
      <section className="helix-card space-y-3">
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
      <section className="helix-card space-y-4">
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

      {/* Preferences */}
      <section className="helix-card space-y-4">
        <h2 className="font-semibold text-text">Preferences</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Day rolls over at</div>
            <div className="text-xs text-muted-vital">Late-night sessions still count as the previous day</div>
          </div>
          <select
            value={goals.day_cutoff_hour}
            onChange={(e) => { const h = Number(e.target.value); save({ day_cutoff_hour: h }); applyPrefsToDevice(h, goals.unit_system, goals.reduce_motion) }}
            className={inputCls + ' w-28'}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Weight units</div>
            <div className="text-xs text-muted-vital">Weight, volume &amp; body composition</div>
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
            {(['kg', 'lb'] as const).map((u) => (
              <button key={u} onClick={() => { save({ unit_system: u }); applyPrefsToDevice(goals.day_cutoff_hour, u, goals.reduce_motion) }}
                className={`px-4 py-2 text-sm font-semibold uppercase ${goals.unit_system === u ? 'bg-primary/15 text-primary' : 'text-muted-vital'}`}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Reduce motion</div>
            <div className="text-xs text-muted-vital">Disable liquid &amp; aurora animations (saves battery)</div>
          </div>
          <button
            onClick={() => { const v = !goals.reduce_motion; save({ reduce_motion: v }); applyPrefsToDevice(goals.day_cutoff_hour, goals.unit_system, v) }}
            aria-pressed={goals.reduce_motion}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${goals.reduce_motion ? 'bg-primary' : 'bg-surface-2 border border-border'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${goals.reduce_motion ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Auto-log scheduled supplements</div>
            <div className="text-xs text-muted-vital">Mark each supplement taken once its scheduled time passes</div>
          </div>
          <button
            onClick={() => save({ auto_log_supplements: !goals.auto_log_supplements })}
            aria-pressed={goals.auto_log_supplements}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${goals.auto_log_supplements ? 'bg-primary' : 'bg-surface-2 border border-border'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${goals.auto_log_supplements ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      </section>

      {/* Activity + sleep + water */}
      <section className="helix-card space-y-4">
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

      {/* Household */}
      <section className="helix-card space-y-2">
        <h2 className="font-semibold text-text">Household</h2>
        <Link href="/family" className="btn-glass w-full justify-between min-h-[44px]">
          <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Family Pulse</span>
          <span className="text-fluid-xs text-muted-vital">admin overview →</span>
        </Link>
      </section>

      <CrashRecorderRow />

      {status && (
        <p className={`text-sm ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>
          {status.msg}
        </p>
      )}

      {saving && <p className="text-xs text-muted-vital">Saving…</p>}
    </div>
  )
}

/** Flight-recorder readout: the last captured crash, if any, for diagnosis. */
function CrashRecorderRow() {
  const [crash, setCrash] = useState<{ message: string; buildId: string; at: string } | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('helix_last_crash')
      if (raw) setCrash(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])
  if (!crash) return null
  return (
    <section className="helix-card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Last recorded crash</h2>
        <button onClick={() => { try { localStorage.removeItem('helix_last_crash') } catch { /* ignore */ } setCrash(null) }}
          className="text-fluid-xs text-muted-vital hover:text-text min-h-[32px]">clear</button>
      </div>
      <p className="text-[11px] font-mono text-muted-vital break-words">
        {new Date(crash.at).toLocaleString('en-GB')} · build {crash.buildId.slice(0, 10)}<br />{crash.message}
      </p>
    </section>
  )
}
