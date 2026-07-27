'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { NotionSync } from '@/components/settings/NotionSync'
import { supabase } from '@/lib/supabase/client'
import { derivePhase, phaseDisplay } from '@/lib/nutrition/phase'
import { logicalTodayISO } from '@/lib/utils/day'
import { phaseGoalsFor, type NutritionMode, type NutritionPreset } from '@/lib/types/workout'
import { getPreviousSource, setPreviousSource, type PreviousSource } from '@/lib/sessions/previousSource'
import { phaseBadgeStyle } from '@/lib/phases'
import { LiquidModal } from '@/components/ui/LiquidModal'
import {
  HELIX_CUT_START, DEFAULT_PROGRAM_ID, PROGRAMS, getActiveProgramId,
  setActiveProgramId, setActivePhase, activeProgram, type Program,
} from '@/lib/programs'
import { AlertTriangle, Dumbbell, Calendar, Target } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Live plans first, legacy (PPL) last — the order of the Settings plan cards. */
function planList(): Program[] {
  return Object.values(PROGRAMS).sort((a, b) => Number(a.legacy ?? false) - Number(b.legacy ?? false))
}

/** Nutrition mode → the timeline phase kind, so the picker reuses the glow palette. */
const MODE_TO_PHASE = { cut: 'cut', maintenance: 'maintenance', bulk: 'bulk' } as const

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

/** Mirror device prefs to localStorage (read synchronously by the units + motion utils). */
function applyPrefsToDevice(units: 'kg' | 'lb', motion: boolean) {
  if (typeof window === 'undefined') return
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
  // target_weight_kg is a fresh column, so writing it self-heals (see
  // saveTargetWeight) rather than failing the whole Settings save on a DB that
  // hasn't run the paste-SQL yet. It's now driven by the selected phase (no
  // standalone input) — applyPhase persists the phase's target.
  // Phase switch is gated by a confirmation modal (hard reset of analytics/coach).
  const [pendingPhase, setPendingPhase] = useState<NutritionMode | null>(null)
  // Week start: 0 = Sunday (default), 1 = Monday. Stored as week_end_day.
  const [weekStart, setWeekStart] = useState<0 | 1>(0)
  // "Previous" column data source for the logger (any workout vs same routine).
  const [prevSource, setPrevSource] = useState<PreviousSource>('any')
  // Active training PLAN + the Preview drawer / two-step switch confirm.
  const [activePlanId, setActivePlanId] = useState<string>(DEFAULT_PROGRAM_ID)
  const [previewPlan, setPreviewPlan] = useState<Program | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      void ensurePlan(session.user.id)
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
          unit_system: (data.unit_system ?? 'kg') as 'kg' | 'lb',
          reduce_motion: data.reduce_motion ?? false,
          auto_log_supplements: data.auto_log_supplements ?? false,
        })
        applyPrefsToDevice((data.unit_system ?? 'kg') as 'kg' | 'lb', data.reduce_motion ?? false)
        const we = (data as { week_end_day?: number | null }).week_end_day
        const ws: 0 | 1 = we === 0 ? 1 : 0
        setWeekStart(ws)
        try { localStorage.setItem('helix_week_start', String(ws)) } catch { /* ignore */ }
        // Active plan + phase — mirror to the localStorage keys activeProgram() reads.
        const ap = (data as { active_plan?: string | null }).active_plan
        if (ap && PROGRAMS[ap]) { setActivePlanId(ap); setActiveProgramId(ap) }
        else setActivePlanId(getActiveProgramId())
        const phase = ((data as { active_phase?: string | null }).active_phase ?? data.goal_preset) as NutritionMode | null
        if (phase === 'cut' || phase === 'bulk' || phase === 'maintenance') setActivePhase(phase)
        // "Previous" source — DB wins, else the localStorage mirror.
        const ps = (data as { previous_source?: string | null }).previous_source
        const src: PreviousSource = ps === 'same_routine' ? 'same_routine' : ps === 'any' ? 'any' : getPreviousSource()
        setPrevSource(src); setPreviousSource(src)
      }
      setLoading(false)
    }
    load()
  }, [])

  /** Ensure a stub Plan row exists (one active Helix plan per user) so future
   *  multi-plan CRUD has an anchor. Self-heals if the table isn't migrated. */
  async function ensurePlan(userId: string) {
    try {
      const { data, error } = await supabase.from('plans').select('id').eq('user_id', userId).limit(1)
      if (error || (data && data.length)) return
      await supabase.from('plans').insert(
        { user_id: userId, name: 'Helix', program_id: DEFAULT_PROGRAM_ID, active: true, started_on: HELIX_CUT_START } as unknown as never,
      )
    } catch { /* plans table not migrated yet */ }
  }

  /** Record the active phase + the date it started (the "[Plan] Era" anchor that
   *  Analytics ranges from). Self-heals if the columns aren't migrated. */
  async function savePhaseMeta(mode: NutritionMode) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, active_phase: mode, phase_started_on: logicalTodayISO() } as unknown as never,
      { onConflict: 'user_id' },
    )
    if (error && !/column|active_phase|phase_started|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message })
    }
  }

  /** Persist the week-start choice as week_end_day + mirror to localStorage so
   *  weekStartOf reads it synchronously. Self-heals if the column isn't migrated. */
  async function saveWeekStart(day: 0 | 1) {
    setWeekStart(day)
    try { localStorage.setItem('helix_week_start', String(day)) } catch { /* ignore */ }
    const endDay = day === 1 ? 0 : 6 // Mon start → Sun end (0); Sun start → Sat end (6)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, week_end_day: endDay } as unknown as never, { onConflict: 'user_id' },
    )
    if (error && !/column|week_end|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message })
    }
  }

  /** Persist the logger's "Previous" data source + mirror to localStorage (the
   *  history hook reads it synchronously). Self-heals if the column is unmigrated. */
  async function savePreviousSource(v: PreviousSource) {
    setPrevSource(v); setPreviousSource(v)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, previous_source: v } as unknown as never, { onConflict: 'user_id' },
    )
    if (error && !/column|previous_source|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message })
    }
  }

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

  /** Persist target weight on its own, self-healing if the column isn't migrated. */
  async function saveTargetWeight(kg: number | null) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase
      .from('user_goals')
      .upsert({ user_id: session.user.id, target_weight_kg: kg } as unknown as never, { onConflict: 'user_id' })
    // Column not migrated yet → silently skip; the paste-SQL adds target_weight_kg.
    if (error && !/column|target_weight|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message })
    }
  }

  /**
   * Selecting a phase pushes ITS numbers into the live goals — calories, macros,
   * step goal, target weight, and the goal_preset tag. The app's cut/bulk landmark
   * targets and the daily phase chip both key off calorie_goal, so re-tagging is
   * automatic once the goal is written.
   */
  async function applyPhase(mode: NutritionMode) {
    // Per-PLAN phase goals — PPL's cut is leaner than Helix's, so source the
    // numbers for the ACTIVE plan, not the global Helix default.
    const p = phaseGoalsFor(activePlanId, mode)
    setActivePhase(mode) // localStorage mirror — activeProgram() reads it synchronously
    await save({
      calorie_goal: p.calorieGoal,
      protein_goal_g: p.proteinGoalG ?? goals.protein_goal_g,
      carbs_goal_g: p.carbsGoalG ?? goals.carbs_goal_g,
      fat_goal_g: p.fatGoalG ?? goals.fat_goal_g,
      steps_goal: p.stepsGoal,
      goal_preset: mode,
    })
    await saveTargetWeight(p.targetWeightKg)
    await saveBodyTargets(p)
    await savePhaseMeta(mode)
  }

  /** Persist the phase's body-composition targets (BF % + muscle mass).
   *  Self-heals if the columns aren't migrated. */
  async function saveBodyTargets(p: NutritionPreset) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, target_body_fat_pct: p.targetBodyFatPct ?? null, target_muscle_mass_kg: p.targetMuscleMassKg ?? null } as unknown as never,
      { onConflict: 'user_id' },
    )
    if (error && !/column|target_|schema cache|PGRST204/i.test(error.message)) setStatus({ type: 'error', msg: error.message })
  }

  /**
   * Switch the active training PLAN. Writes the localStorage mirror (activeProgram
   * reads it), persists user_goals.active_plan, re-anchors the "[Plan] Era" to
   * today, and points the plans row at the new program. All self-heal.
   */
  async function applyPlan(planId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setActivePlanId(planId)
    setActiveProgramId(planId)
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, active_plan: planId, phase_started_on: logicalTodayISO() } as unknown as never,
      { onConflict: 'user_id' },
    )
    if (error && !/column|active_plan|phase_started|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message }); return
    }
    try {
      await supabase.from('plans')
        .update({ program_id: planId, started_on: logicalTodayISO() } as unknown as never)
        .eq('user_id', session.user.id).eq('active', true)
    } catch { /* plans table not migrated yet */ }
    setStatus({ type: 'success', msg: `Switched to ${PROGRAMS[planId]?.label ?? 'plan'}.` })
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-text text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/60 transition-[border-color] duration-200'

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Goals &amp; context for daily scoring</p>
      </div>

      {/* ── Plan & Phase — the single place a training phase is chosen. Picking one
             pushes its numbers into the live goals; landmark cut/bulk targets and
             the daily phase chip re-tag automatically off calorie_goal. ── */}
      <section className="helix-card space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-text">Plans &amp; Phases</h2>
            <p className="text-xs text-muted mt-0.5">
              The single place to choose your training plan and phase. A phase updates calories, macros,
              step goal and body-composition targets.
            </p>
          </div>
          {(() => {
            const p = derivePhase(goals.calorie_goal)
            if (!p) return null
            const m = phaseDisplay(p, logicalTodayISO())
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0"
                style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}55`, boxShadow: `0 0 10px ${m.color}44` }}>
                Active: {m.label}
              </span>
            )
          })()}
        </div>

        {/* ── Training plan — tap a card to preview its schedule + goals, then a
               two-step confirm to switch (impossible to switch by accident). ── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Training plan</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {planList().map((plan) => {
              const active = plan.id === activePlanId
              return (
                <button key={plan.id} onClick={() => { setConfirmSwitch(false); setPreviewPlan(plan) }}
                  aria-pressed={active}
                  className="rounded-2xl border p-3 text-left transition-all duration-200"
                  style={active
                    ? { borderColor: '#8E9AAC66', background: '#8E9AAC14', boxShadow: '0 0 16px #8E9AAC33' }
                    : { borderColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: active ? '#8E9AAC' : '#79808C' }} aria-hidden="true" />
                    <span className="font-heading font-bold text-sm text-text">{plan.label}</span>
                    {plan.legacy && <span className="text-[9px] uppercase tracking-wide text-muted ml-auto">legacy</span>}
                    {active && !plan.legacy && <span className="text-[9px] uppercase tracking-wide ml-auto" style={{ color: '#8E9AAC' }}>active</span>}
                  </div>
                  <p className="text-[10px] text-muted mt-1 leading-snug line-clamp-2">{plan.blurb ?? `${plan.days.length}-day split`}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] mt-1.5" style={{ color: '#8E9AAC' }}>Preview &amp; switch →</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted -mb-1.5">Phase</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {(['cut', 'maintenance', 'bulk'] as NutritionMode[]).map((mode) => {
            const p = phaseGoalsFor(activePlanId, mode)
            const active = goals.goal_preset === mode
            const glow = phaseBadgeStyle(MODE_TO_PHASE[mode], active)
            return (
              <button key={mode} onClick={() => { if (!active) setPendingPhase(mode) }} disabled={saving} aria-pressed={active}
                className="rounded-2xl border p-3 text-left transition-all duration-200 disabled:opacity-60"
                style={active ? glow : { borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="font-heading font-bold text-sm text-text">{p.label}</div>
                <div className="helix-num text-fluid-lg font-bold mt-0.5" style={{ color: active ? (glow.color as string) : '#E0703C' }}>
                  {p.calorieGoal.toLocaleString()}<span className="text-[10px] text-muted"> kcal</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">{p.proteinGoalG}P · {p.carbsGoalG}C · {p.fatGoalG}F</div>
                <div className="text-[10px] text-muted mt-0.5">{p.stepsGoal.toLocaleString()} steps · target {p.targetWeightKg} kg</div>
              </button>
            )
          })}
        </div>

        {/* Target weight is no longer a standalone field — it lives inside each
            plan/phase's goals (shown in the plan preview + phase cards). */}
      </section>

      {/* Desktop: cards flow into two columns so the width isn't wasted. */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
      {/* Context mode */}
      <section className="helix-card space-y-3">
        <h2 className="font-semibold text-text">Context Mode</h2>
        <p className="text-xs text-muted">
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
                  : 'border-border text-muted hover:border-primary/40 hover:text-text'}`}
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
            const m = phaseDisplay(p, logicalTodayISO())
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
              <label className="text-xs font-medium text-muted">{label}</label>
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
            <div className="text-sm text-text font-medium">Weight units</div>
            <div className="text-xs text-muted">Weight, volume &amp; body composition</div>
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
            {(['kg', 'lb'] as const).map((u) => (
              <button key={u} onClick={() => { save({ unit_system: u }); applyPrefsToDevice(u, goals.reduce_motion) }}
                className={`px-4 py-2 text-sm font-semibold uppercase ${goals.unit_system === u ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Week starts on</div>
            <div className="text-xs text-muted">When weekly volume, charts &amp; the AI report reset</div>
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
            {([[0, 'Sun'], [1, 'Mon']] as const).map(([day, label]) => (
              <button key={day} onClick={() => saveWeekStart(day)}
                className={`px-4 py-2 text-sm font-semibold ${weekStart === day ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">&ldquo;Previous&rdquo; column</div>
            <div className="text-xs text-muted">Where the logger pulls last-time weights from</div>
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
            {([['any', 'Any workout'], ['same_routine', 'Same routine']] as const).map(([v, label]) => (
              <button key={v} onClick={() => savePreviousSource(v)}
                className={`px-3 py-2 text-sm font-semibold ${prevSource === v ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Reduce motion</div>
            <div className="text-xs text-muted">Disable liquid &amp; aurora animations (saves battery)</div>
          </div>
          <button
            onClick={() => { const v = !goals.reduce_motion; save({ reduce_motion: v }); applyPrefsToDevice(goals.unit_system, v) }}
            aria-pressed={goals.reduce_motion}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${goals.reduce_motion ? 'bg-primary' : 'bg-surface-2 border border-border'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${goals.reduce_motion ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Auto-log scheduled supplements</div>
            <div className="text-xs text-muted">Mark each supplement taken once its scheduled time passes</div>
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
              <label className="text-xs font-medium text-muted">{label}</label>
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

      <NotionSync />

      {/* Administration */}
      <section className="helix-card space-y-2">
        <h2 className="font-semibold text-text">Administration</h2>
        <Link href="/users" className="btn-glass w-full justify-between min-h-[44px]">
          <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> User Management</span>
          <span className="text-fluid-xs text-muted">admin only →</span>
        </Link>
      </section>

      <CrashRecorderRow />
      </div>

      {/* Plan preview drawer — schedule + phase goals + exercises, then a
          two-step confirm to switch. */}
      <LiquidModal open={!!previewPlan} onClose={() => { setPreviewPlan(null); setConfirmSwitch(false) }}
        title={previewPlan ? previewPlan.label : undefined} accent="#8E9AAC">
        {previewPlan && (() => {
          const phaseMode = (goals.goal_preset as NutritionMode) || 'cut'
          const pp = phaseGoalsFor(previewPlan.id, phaseMode)
          const isActive = previewPlan.id === activePlanId
          // Phase-resolved days: the CURRENT phase's set counts (cut trims volume,
          // drops bulk-only lifts) — the same resolver the live logger runs.
          const phaseDays = activeProgram(previewPlan.id, phaseMode).days
          const byWeekday = new Map(phaseDays.map((d) => [d.weekday, d]))

          // De-duplicate repeated routines: a Push that runs Sun AND Thu (or an
          // identical A/B day) is listed ONCE with the weekdays it lands on.
          const routineSig = (d: (typeof phaseDays)[number]) =>
            d.exercises.map((e) => `${e.name}·${e.sets}×${e.reps}`).join('|')
          const routines: Array<{ day: (typeof phaseDays)[number]; weekdays: number[] }> = []
          const seenRoutine = new Map<string, { day: (typeof phaseDays)[number]; weekdays: number[] }>()
          for (const d of phaseDays) {
            const sig = routineSig(d)
            const hit = seenRoutine.get(sig)
            if (hit) hit.weekdays.push(d.weekday)
            else { const entry = { day: d, weekdays: [d.weekday] }; seenRoutine.set(sig, entry); routines.push(entry) }
          }

          const sr = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`
          const goalTiles: Array<[string, string]> = [
            ['Calories', `${pp.calorieGoal.toLocaleString()} kcal`],
            ['Macros', `${pp.proteinGoalG}P · ${pp.carbsGoalG}C · ${pp.fatGoalG}F`],
            ['Fiber', pp.fiberMin != null && pp.fiberMax != null ? `${pp.fiberMin}–${pp.fiberMax} g` : pp.fiberGoalG != null ? `${pp.fiberGoalG} g` : '—'],
            ['Steps', pp.stepsGoal.toLocaleString()],
            ['Target weight', `${pp.targetWeightKg} kg`],
            ['Weekly rate', pp.rateMinKgWk != null && pp.rateMaxKgWk != null ? `${sr(pp.rateMinKgWk)}…${sr(pp.rateMaxKgWk)} kg` : '—'],
            ['Body fat', pp.targetBodyFatPct != null ? `≤ ${pp.targetBodyFatPct}%` : '—'],
            ['Muscle mass', pp.targetMuscleMassKg != null ? `${pp.targetMuscleMassKg} kg` : '—'],
          ]
          if (pp.targetWaistCm != null) goalTiles.push(['Waist', `≤ ${pp.targetWaistCm} cm`])
          if (pp.bodyFatCeilingPct != null) goalTiles.push(['BF ceiling', `${pp.bodyFatCeilingPct}%`])

          return (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">{previewPlan.blurb}</p>

              {/* Weekly schedule */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted mb-2">
                  <Calendar className="w-3 h-3" aria-hidden="true" /> Weekly schedule
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {WD_SHORT.map((wd, i) => {
                    const d = byWeekday.get(i)
                    return (
                      <div key={i} className="rounded-lg px-1 py-1.5 text-center border"
                        style={{ borderColor: d ? `${d.color}44` : 'rgba(255,255,255,0.06)', background: d ? `${d.color}12` : 'transparent' }}>
                        <div className="text-[9px] text-muted">{wd}</div>
                        <div className="text-[9px] font-bold mt-0.5 leading-tight" style={{ color: d ? d.color : '#79808C' }}>
                          {d ? d.label : 'Rest'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Phase goals — the targets this plan's {phase} is steering toward */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted mb-2">
                  <Target className="w-3 h-3" aria-hidden="true" /> {pp.label} phase goals
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-fluid-xs">
                  {goalTiles.map(([label, val]) => (
                    <div key={label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
                      <div className="helix-num font-bold text-text mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Routines — de-duplicated (a Push run twice a week is listed once),
                  weights hidden (they appear only in the live logger). */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted mb-2">
                  <Dumbbell className="w-3 h-3" aria-hidden="true" /> Routines · {pp.label}
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {routines.map(({ day: d, weekdays }) => (
                    <div key={d.key}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-bold" style={{ color: d.color }}>{d.label}</span>
                        <span className="text-[9px] text-muted">{weekdays.map((w) => WD_SHORT[w]).join(' & ')}</span>
                        {d.sub && <span className="text-[9px] text-muted">· {d.sub}</span>}
                      </div>
                      <div className="text-[10px] text-muted leading-relaxed">
                        {d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Switch — two-step (impossible to switch by accident) */}
              <div className="pt-1 border-t border-white/[0.06]">
                {isActive ? (
                  <p className="text-fluid-xs text-muted text-center py-2">This is your active plan.</p>
                ) : !confirmSwitch ? (
                  <button onClick={() => setConfirmSwitch(true)}
                    className="btn-primary w-full justify-center min-h-[46px]"
                    style={{ background: '#8E9AAC', boxShadow: '0 0 16px #8E9AAC44' }}>
                    Switch to {previewPlan.label}
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#E0703C' }} aria-hidden="true" />
                      <p className="text-sm text-muted leading-relaxed">
                        Switch to <span className="text-text font-semibold">{previewPlan.label}</span>? This changes your
                        training schedule and re-anchors analytics from today. Your logged history is preserved.
                      </p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setConfirmSwitch(false)} className="btn-glass min-h-[44px] px-4">Cancel</button>
                      <button
                        onClick={async () => { const id = previewPlan.id; setPreviewPlan(null); setConfirmSwitch(false); await applyPlan(id) }}
                        className="btn-primary min-h-[44px] px-4">
                        Confirm switch
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </LiquidModal>

      {/* Phase-switch confirmation — a phase change is a hard reset of the UI. */}
      <LiquidModal open={!!pendingPhase} onClose={() => setPendingPhase(null)} title="Switch phase" accent="#E0703C">
        {pendingPhase && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(224,112,60,0.15)', color: '#E0703C' }}>
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-text font-semibold">Switch to {phaseGoalsFor(activePlanId, pendingPhase).label}?</p>
                <p className="text-sm text-muted mt-1 leading-relaxed">
                  This re-anchors your analytics and coach logic to today. Calories, macros, step goal and
                  target weight update to the {phaseGoalsFor(activePlanId, pendingPhase).label} goals. Your logged
                  history is preserved.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingPhase(null)} className="btn-glass min-h-[44px] px-4">Cancel</button>
              <button
                onClick={async () => { const m = pendingPhase; setPendingPhase(null); await applyPhase(m) }}
                disabled={saving}
                className="btn-primary min-h-[44px] px-4 disabled:opacity-60"
              >
                Switch to {phaseGoalsFor(activePlanId, pendingPhase).label}
              </button>
            </div>
          </div>
        )}
      </LiquidModal>

      {status && (
        <p className={`text-sm ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>
          {status.msg}
        </p>
      )}

      {saving && <p className="text-xs text-muted">Saving…</p>}
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
          className="text-fluid-xs text-muted hover:text-text min-h-[32px]">clear</button>
      </div>
      <p className="text-[11px] font-mono text-muted break-words">
        {new Date(crash.at).toLocaleString('en-GB')} · build {crash.buildId.slice(0, 10)}<br />{crash.message}
      </p>
    </section>
  )
}
