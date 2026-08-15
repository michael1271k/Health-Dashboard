'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NotionSync } from '@/components/settings/NotionSync'
import { supabase } from '@/lib/supabase/client'
import { derivePhase, phaseDisplay } from '@/lib/nutrition/phase'
import { logicalTodayISO } from '@/lib/utils/day'
import type { NutritionMode, NutritionPreset } from '@/lib/types/workout'
import { phaseBadgeStyle } from '@/lib/phases'
import { Sheet } from '@/components/ui/Sheet'
import { EMBER, STEEL } from '@/lib/theme/palette'
import {
  HELIX_CUT_START, DEFAULT_PROGRAM_ID, PROGRAMS, getActiveProgramId,
  setActiveProgramId, setActivePhase, activePhase, activeProgram, type Program,
} from '@/lib/programs'
import { usePlanPhaseGoals, type PlanPhaseOverride } from '@/lib/hooks/usePlanPhaseGoals'
import { setTrackRpeMirror } from '@/lib/hooks/useTrackRpe'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'
import { parseRepWindow } from '@/lib/training/ceilings'
import { useRoutineTemplates } from '@/lib/hooks/useRoutineTemplate'
import { countCommittedSets } from '@/lib/sessions/schema'
import { AlertTriangle, Dumbbell, Calendar, Target } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import { Surface } from '@/components/ui/Zone'

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Every cached surface that grades against the calorie/protein/step targets a
 * plan+phase switch rewrites. Mirrors `RealtimeProvider`'s `user_goals` fan-out,
 * which handles the OTHER devices.
 */
const PLAN_PHASE_CASCADE_KEYS: string[][] = [
  ['user_goals'], ['today'], ['readiness_today'], ['coach'], ['day_vault'], ['nutrition_entries'],
]

/** Live plans first, legacy (PPL) last — the order of the Settings plan cards. */
function planList(): Program[] {
  return Object.values(PROGRAMS).sort((a, b) => Number(a.legacy ?? false) - Number(b.legacy ?? false))
}

/** Nutrition mode → the timeline phase kind, so the picker reuses the glow palette. */
const MODE_TO_PHASE = { cut: 'cut', maintenance: 'maintenance', bulk: 'bulk' } as const

/**
 * The resolved preset as an override patch.
 *
 * Every field is written on each edit, deliberately: `saveOverride` upserts the
 * whole row, so sending only the edited field would null every other override
 * the user had already made.
 */
function planPhasePatch(p: NutritionPreset): PlanPhaseOverride {
  return {
    calorieGoal: p.calorieGoal, proteinGoalG: p.proteinGoalG, carbsGoalG: p.carbsGoalG,
    fatGoalG: p.fatGoalG, fiberMin: p.fiberMin ?? null, fiberMax: p.fiberMax ?? null,
    stepsGoal: p.stepsGoal, targetWeightKg: p.targetWeightKg,
    targetBodyFatPct: p.targetBodyFatPct ?? null, targetMuscleMassKg: p.targetMuscleMassKg ?? null,
    rateMinKgWk: p.rateMinKgWk ?? null, rateMaxKgWk: p.rateMaxKgWk ?? null,
  }
}

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
  const queryClient = useQueryClient()
  const [goals, setGoals] = useState<Goals>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  // target_weight_kg is a fresh column, so writing it self-heals (see
  // saveTargetWeight) rather than failing the whole Settings save on a DB that
  // hasn't run the paste-SQL yet. It's now driven by the selected phase (no
  // standalone input) — applyPhase persists the phase's target.
  // The phase being viewed INSIDE the open plan drawer. Not a global setting —
  // it only becomes active when the drawer's "Make active" is confirmed.
  const [drawerPhase, setDrawerPhase] = useState<NutritionMode>('cut')
  // Week start: 0 = Sunday (default), 1 = Monday. Stored as week_end_day.
  const [weekStart, setWeekStart] = useState<0 | 1>(0)
  // Per-exercise effort logging. Deliberately NOT on `Goals`: `save()` spreads
  // the whole object into one upsert, so a column that has not been migrated
  // yet would fail EVERY settings save, not just this one. Own state, own
  // self-healing writer — the same shape week-start uses.
  const [trackRpe, setTrackRpe] = useState(false)
  // Active training PLAN + the Preview drawer / two-step switch confirm.
  const [activePlanId, setActivePlanId] = useState<string>(DEFAULT_PROGRAM_ID)
  const [previewPlan, setPreviewPlan] = useState<Program | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  // User-edited per-plan+phase macro overrides (plan_phase_goals). `resolve` merges
  // an override over the static phaseGoalsFor default.
  const { resolve: resolvePhaseGoals, resolveVolume, saveOverride, saveVolumeTarget } = usePlanPhaseGoals()
  // The phase actually in force. goal_preset is the persisted tag; activePhase()
  // is the synchronous localStorage mirror the rest of the app reads.
  const livePhase = ((goals.goal_preset as NutritionMode) || (activePhase() as NutritionMode)) as NutritionMode
  // The routine as it is actually RUN, per day — rewritten from the deck on
  // every commit. Absent for a day never logged, which falls back to the
  // programme as authored.
  const { data: templates } = useRoutineTemplates()

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
        const tr = (data as { track_rpe?: boolean | null }).track_rpe ?? false
        setTrackRpe(tr)
        setTrackRpeMirror(tr)
        // Active plan + phase — mirror to the localStorage keys activeProgram() reads.
        const ap = (data as { active_plan?: string | null }).active_plan
        if (ap && PROGRAMS[ap]) { setActivePlanId(ap); setActiveProgramId(ap) }
        else setActivePlanId(getActiveProgramId())
        const phase = ((data as { active_phase?: string | null }).active_phase ?? data.goal_preset) as NutritionMode | null
        if (phase === 'cut' || phase === 'bulk' || phase === 'maintenance') setActivePhase(phase)
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

  /** Persist the effort-logging toggle on its own, self-healing if unmigrated. */
  async function saveTrackRpe(on: boolean) {
    setTrackRpe(on)
    // Mirror FIRST: the deck reads localStorage synchronously during render, so
    // the chips must appear on the next paint, not after a round trip.
    setTrackRpeMirror(on)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, track_rpe: on } as unknown as never, { onConflict: 'user_id' },
    )
    if (error && !/column|track_rpe|schema cache|PGRST204/i.test(error.message)) {
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
   * Switch the active PLAN and PHASE together, atomically.
   *
   * These used to be two independent controls with two confirm modals, so the
   * app could sit in a state no plan actually defines — PPL's macros running
   * under Helix-5's split, or vice versa. A phase is not a global mood; it's the
   * set of numbers a specific plan runs on, so it is only ever chosen inside one.
   *
   * Both localStorage mirrors are written BEFORE the awaits: activeProgram() and
   * activePhase() are synchronous and are read during the very next render, so
   * persisting first would leave the UI a round-trip behind itself.
   */
  async function applyPlanPhase(planId: string, mode: NutritionMode) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setActivePlanId(planId)
    setActiveProgramId(planId)
    setActivePhase(mode)

    // Per-PLAN phase goals — PPL's cut is leaner than Helix's, so source the
    // numbers for the CHOSEN plan (and honour any hand-edited override).
    const p = resolvePhaseGoals(planId, mode)
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

    // One upsert for plan + phase + the era anchor: a partial write here would
    // leave the plan switched but the phase stale.
    const { error } = await supabase.from('user_goals').upsert(
      {
        user_id: session.user.id,
        active_plan: planId,
        active_phase: mode,
        phase_started_on: logicalTodayISO(),
      } as unknown as never,
      { onConflict: 'user_id' },
    )
    if (error && !/column|active_plan|active_phase|phase_started|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message }); return
    }
    try {
      await supabase.from('plans')
        .update({ program_id: planId, started_on: logicalTodayISO() } as unknown as never)
        .eq('user_id', session.user.id).eq('active', true)
    } catch { /* plans table not migrated yet */ }

    // The new targets are baked into every cached surface that grades against
    // them. Without this, tapping "Helix · bulk" and walking straight to the
    // dashboard showed the CUT rings — the write had landed, but `['today']`
    // was inside staleTime and is also restored from localStorage on the next
    // cold open, so the wrong numbers outlived the session. Realtime covers
    // OTHER devices (RealtimeProvider TABLE_KEYS.user_goals); this covers the
    // one that made the change.
    for (const key of PLAN_PHASE_CASCADE_KEYS) queryClient.invalidateQueries({ queryKey: key })

    setStatus({ type: 'success', msg: `${PROGRAMS[planId]?.label ?? 'Plan'} · ${mode} is now active.` })
  }

  /**
   * A manual macro edit is saved BOTH to the live goals (today's targets) AND as a
   * persistent override for the active plan+phase, so switching away and back
   * reloads the hand-edited numbers instead of the static preset. The whole macro
   * set is written each time so a single-field edit never nulls the others.
   */
  async function persistMacroEdit(key: 'calorie_goal' | 'protein_goal_g' | 'carbs_goal_g' | 'fat_goal_g', value: number) {
    const phase = activePhase() as NutritionMode
    await save({ [key]: value, goal_preset: phase })
    await saveOverride({
      planId: activePlanId, phase,
      patch: {
        calorieGoal: key === 'calorie_goal' ? value : goals.calorie_goal,
        proteinGoalG: key === 'protein_goal_g' ? value : goals.protein_goal_g,
        carbsGoalG: key === 'carbs_goal_g' ? value : goals.carbs_goal_g,
        fatGoalG: key === 'fat_goal_g' ? value : goals.fat_goal_g,
      },
    })
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

  const inputCls =
    'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-text text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/60 transition-[border-color] duration-200'

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  return (
    <div data-boxed className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Goals &amp; context for daily scoring</p>
      </div>

      {/* ── Plans. A PHASE is not a separate setting — it is configuration that
             belongs to a plan, so it is chosen (and its macros, goals and set
             volumes edited) INSIDE the plan's drawer. There is no standalone
             Phases section any more. ── */}
      <Surface variant="band" measure="grid" pad="snug" className="space-y-4">
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

        {/* ── Tap a plan to open it: schedule, phase selector, and every number
               that phase dictates. A two-step confirm still guards the switch. ── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Training plan</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {planList().map((plan) => {
              const active = plan.id === activePlanId
              return (
                <button key={plan.id} onClick={() => { setConfirmSwitch(false); setDrawerPhase(plan.id === activePlanId ? livePhase : 'cut'); setPreviewPlan(plan) }}
                  aria-pressed={active}
                  className="rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200"
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
                  {active && (
                    <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide mt-1.5"
                      style={phaseBadgeStyle(MODE_TO_PHASE[livePhase], true)}>
                      {livePhase}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] mt-1.5" style={{ color: '#8E9AAC' }}>
                    {active ? 'Open' : 'Preview'} &amp; configure →
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Target weight is no longer a standalone field — it lives inside each
            plan/phase's goals (shown in the plan preview + phase cards). */}
      </Surface>

      {/* Desktop: cards flow into two columns so the width isn't wasted. */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
      {/* Context mode */}
      <Surface variant="band" measure="grid" pad="snug" className="space-y-3">
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
      </Surface>

      {/* Nutrition goals */}
      <Surface variant="band" measure="grid" pad="snug" className="space-y-4">
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
                onChange={(e) => setGoals((g) => ({ ...g, [key]: Number(e.target.value) }))}
                onBlur={() => persistMacroEdit(key, goals[key])}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          Edits save to the <span className="text-text/80 font-medium">{PROGRAMS[activePlanId]?.label ?? 'active plan'} · {activePhase()}</span> phase
          and reload when you switch back to it.
        </p>
      </Surface>

      {/* Preferences */}
      <Surface variant="band" measure="grid" pad="snug" className="space-y-4">
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

        {/* The "Previous" source toggle is gone: exercise memory is ALWAYS
            scoped to the routine you're logging. Blending Legs A and Legs B
            into one memory was never a preference worth having. */}

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
            {/* translate, not `left`: `left` is a layout property, so the knob
                was reflowing the button on every toggle. */}
            <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${goals.reduce_motion ? 'translate-x-5' : 'translate-x-0'}`} />
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
            <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${goals.auto_log_supplements ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text font-medium">Track effort (RPE)</div>
            <div className="text-xs text-muted">
              Rate each exercise Easy / Hard / Failure when you log a session. Off by default —
              an imported workout carries no RPE, so it is typed from memory.
            </div>
          </div>
          <button
            onClick={() => saveTrackRpe(!trackRpe)}
            aria-pressed={trackRpe}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${trackRpe ? 'bg-primary' : 'bg-surface-2 border border-border'}`}
          >
            <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${trackRpe ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </Surface>

      {/* Activity + sleep + water */}
      <Surface variant="band" measure="grid" pad="snug" className="space-y-4">
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
      </Surface>

      <NotionSync />

      <CrashRecorderRow />
      </div>

      {/* Plan preview drawer — schedule + phase goals + exercises, then a
          two-step confirm to switch. */}
      {/* The plan preview is ~2000px of reading, so it takes `size="wide"` and
          almost the whole viewport. It is the first consumer of either prop.

          HONEST NOTE: the two inner `max-h-*` scrollers below survive this
          change. They exist because the panel is height-capped, and the real
          fix is for this to be a route (/settings/plans/[id]) where they become
          plain page sections. That is a bigger move than swapping a container
          and is deliberately not bundled here. */}
      <Sheet size="wide" maxHeight="92dvh"
        open={!!previewPlan} onClose={() => { setPreviewPlan(null); setConfirmSwitch(false) }}
        title={previewPlan ? previewPlan.label : undefined} accent="#8E9AAC">
        {previewPlan && (() => {
          // The phase is chosen HERE, inside the plan. Everything below —
          // macros, goals, set volumes, even the routines' set counts — is a
          // function of (plan, phase), which is exactly why the two can no
          // longer be configured apart.
          const phaseMode = drawerPhase
          const pp = resolvePhaseGoals(previewPlan.id, phaseMode)
          const volTargets = resolveVolume(previewPlan.id, phaseMode)
          const isActive = previewPlan.id === activePlanId && livePhase === phaseMode
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
          if (pp.bodyFatCeilingPct != null) goalTiles.push(['BF ceiling', `${pp.bodyFatCeilingPct}%`])

          return (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">{previewPlan.blurb}</p>

              {/* ── Phase — nested INSIDE the plan, and the switch for everything below ── */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Phase</div>
                <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
                  {(['cut', 'maintenance', 'bulk'] as NutritionMode[]).map((m) => {
                    const on = drawerPhase === m
                    const glow = phaseBadgeStyle(MODE_TO_PHASE[m], on)
                    return (
                      <button key={m} onClick={() => setDrawerPhase(m)} aria-pressed={on}
                        className="flex-1 py-2 text-fluid-xs font-semibold capitalize min-h-[44px]"
                        style={on ? glow : { color: 'var(--color-muted)' }}>
                        {m}
                        {previewPlan.id === activePlanId && livePhase === m && (
                          <span className="block text-[8px] uppercase tracking-wide opacity-70">active</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Everything this phase dictates, editable in place ── */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted mb-2">
                  <Target className="w-3 h-3" aria-hidden="true" /> {pp.label} goals
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['Calories', 'kcal', pp.calorieGoal, 'calorieGoal'],
                    ['Protein', 'g', pp.proteinGoalG, 'proteinGoalG'],
                    ['Carbs', 'g', pp.carbsGoalG, 'carbsGoalG'],
                    ['Fat', 'g', pp.fatGoalG, 'fatGoalG'],
                    ['Steps', '', pp.stepsGoal, 'stepsGoal'],
                    ['Target weight', 'kg', pp.targetWeightKg, 'targetWeightKg'],
                    ['Body fat', '%', pp.targetBodyFatPct, 'targetBodyFatPct'],
                    ['Muscle mass', 'kg', pp.targetMuscleMassKg, 'targetMuscleMassKg'],
                  ] as const).map(([label, unit, value, field]) => (
                    <label key={label} className="block rounded-lg bg-white/[0.015] border border-white/[0.05] px-2.5 py-1.5">
                      <span className="block text-[9px] uppercase tracking-wide text-muted">{label}{unit ? ` (${unit})` : ''}</span>
                      <input
                        type="text" inputMode="decimal"
                        // Re-key on (plan, phase) so switching phase re-seeds the
                        // uncontrolled input instead of stranding the old value.
                        key={`${previewPlan.id}|${phaseMode}|${field}`}
                        defaultValue={value ?? ''}
                        // onBlur, not onChange: writing an override per keystroke
                        // would fire a mutation for every digit typed.
                        onBlur={(e) => {
                          const raw = e.target.value.trim()
                          const n = raw === '' ? null : parseFloat(raw)
                          if (n != null && !Number.isFinite(n)) return
                          void saveOverride({
                            planId: previewPlan.id, phase: phaseMode,
                            patch: { ...planPhasePatch(pp), [field]: n },
                          })
                        }}
                        className="w-full bg-transparent helix-num text-fluid-sm font-bold text-text outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-1.5 leading-snug">
                  Saved against {previewPlan.label} · {phaseMode}. Clear a field to restore the plan default.
                </p>
              </div>

              {/* ── Weekly set volume — this phase's MEV/MAV targets, editable ── */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
                  Weekly set volume · {phaseMode === 'cut' ? 'MEV+' : phaseMode === 'bulk' ? 'MAV' : 'MEV+→MAV'}
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                  {LANDMARK_MUSCLES.map((m) => (
                    <label key={m} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.015] border border-white/[0.05] px-2 py-1">
                      <span className="text-[11px] text-text/80 truncate">{m}</span>
                      <input
                        type="text" inputMode="numeric"
                        key={`${previewPlan.id}|${phaseMode}|${m}`}
                        defaultValue={volTargets[m]}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10)
                          if (!Number.isFinite(n) || n < 0 || n === volTargets[m]) return
                          void saveVolumeTarget({ planId: previewPlan.id, phase: phaseMode, muscle: m, targetSets: n })
                        }}
                        className="w-10 bg-transparent helix-num text-fluid-sm font-bold text-text text-right outline-none tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              </div>

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
                    <div key={d.key} className="rounded-lg bg-white/[0.015] border border-white/[0.05] px-2.5 py-2">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-[11px] font-bold" style={{ color: d.color }}>{d.label}</span>
                        <span className="text-[9px] text-muted">{weekdays.map((w) => WD_SHORT[w]).join(' & ')}</span>
                        {d.sub && <span className="text-[9px] text-muted">· {d.sub}</span>}
                      </div>
                      {/* Clean vertical list — name + set×(floor–ceiling), ceiling gold.
                          No weights (those live only in the live logger).

                          THE STORED TEMPLATE WINS, when there is one and this is
                          the active plan. This card used to list the programme
                          as AUTHORED, which stopped being what you actually run
                          the first time you dropped a set or reordered anything
                          — and there was no screen anywhere that showed the real
                          routine. `routine_templates` is rewritten from the exact
                          deck on every commit, so it is the honest answer. The
                          rep window still comes from the programme: it is the
                          TARGET, and a template records what happened, not what
                          to aim for. */}
                      {(() => {
                        const stored = isActive ? templates?.get(d.key) : undefined
                        const rows = stored
                          ? stored.template.exercises
                            .filter((e) => e.kind !== 'cardio')
                            .map((e) => {
                              // Physical sets — a unilateral pair is two rows and
                              // ONE set, and printing the row count here is the
                              // exact confusion this release removes.
                              const programmed = d.exercises.find((x) => x.name === e.name)
                              return { name: e.name, sets: countCommittedSets(e.sets), reps: programmed?.reps }
                            })
                          : d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps }))
                        return (
                          <>
                            {stored && (
                              <div className="text-[9px] text-muted mb-1">
                                As last performed
                                {stored.updatedAt ? ` · ${stored.updatedAt.slice(0, 10)}` : ''}
                              </div>
                            )}
                            <div className="space-y-0.5">
                              {rows.map((e) => {
                                const w = e.reps ? parseRepWindow(e.reps) : null
                                return (
                                  <div key={e.name} className="flex items-baseline justify-between gap-2 text-[11px] leading-snug">
                                    <span className="text-text/80 truncate">{e.name}</span>
                                    <span className="helix-num text-muted shrink-0 tabular-nums">
                                      {e.sets}×{' '}
                                      {w
                                        ? <>{w.floor}<span className="opacity-40">–</span><span style={{ color: '#D4AF37' }}>{w.ceiling}</span></>
                                        : e.reps ?? ''}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              {/* One button sets plan AND phase together. Two separate switches
                  could leave the app in a state no plan defines — PPL macros
                  under a Helix-5 split. */}
              <div className="pt-1 border-t border-white/[0.06]">
                {isActive ? (
                  <p className="text-fluid-xs text-muted text-center py-2">
                    {previewPlan.label} · {phaseMode} is active.
                  </p>
                ) : (
                  <button onClick={() => setConfirmSwitch(true)} disabled={saving}
                    className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-60"
                    style={{ background: STEEL, boxShadow: `0 0 16px ${STEEL}44` }}>
                    Make {previewPlan.label} · {phaseMode} active
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </Sheet>

      {/* The only destructive action in the app.
          It used to be a state swap at the BOTTOM of a ~2000px scroll, which
          meant the warning could be off-screen while its Confirm button was
          not. A confirmation rising from the bottom edge over the thing it is
          about is the platform idiom for exactly this, and it cannot be reached
          without the prose arriving with it. The two-step semantics are
          unchanged — this is step two, relocated. */}
      <Sheet
        open={confirmSwitch && !!previewPlan}
        onClose={() => setConfirmSwitch(false)}
        title="Switch plan?"
        accent={EMBER}
        layer="stacked"
      >
        {previewPlan && (
          <div className="space-y-4 pb-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
              <p className="text-sm text-muted leading-relaxed">
                Run <span className="text-text font-semibold">{previewPlan.label}</span> on its{' '}
                <span className="text-text font-semibold">{drawerPhase}</span> phase? Calories, macros, step goal,
                body targets and weekly set volume all move to this phase&apos;s numbers, the training schedule
                changes, and analytics re-anchor from today. Your logged history is preserved.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmSwitch(false)} className="btn-glass min-h-[44px] px-4">Cancel</button>
              <button
                onClick={async () => {
                  const id = previewPlan.id, m = drawerPhase
                  setPreviewPlan(null); setConfirmSwitch(false)
                  await applyPlanPhase(id, m)
                }}
                disabled={saving}
                className="btn-primary min-h-[44px] px-4 disabled:opacity-60">
                Confirm
              </button>
            </div>
          </div>
        )}
      </Sheet>


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
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-2">
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
