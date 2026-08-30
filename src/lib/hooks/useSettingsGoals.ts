'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { phaseGoalsFor, type NutritionMode, type NutritionPreset } from '@/lib/types/workout'
import {
  HELIX_CUT_START, DEFAULT_PROGRAM_ID, PROGRAMS, getActiveProgramId,
  setActiveProgramId, setActivePhase, activePhase,
} from '@/lib/programs'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'
import { setTrackRpeMirror } from '@/lib/hooks/useTrackRpe'
import { isLeverId, leverForDate, type LeverId } from '@/lib/nutrition/levers'
import type { PlanNumbers, RecoveryNumbers, BodyTargets } from '@/components/settings/EditPlanCard'
import type { Tables } from '@/lib/supabase/types'

/**
 * Everything the Settings screen KNOWS, separated from everything it SHOWS.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────
 * The page was 1040 lines, of which about four hundred were this: eight write
 * paths, each with its own self-healing regex for a column that may not have
 * been migrated yet, an ordering rule (localStorage mirrors are written BEFORE
 * the awaits, because `activeProgram()` and `activePhase()` are synchronous and
 * read on the very next render), and a cache cascade that has to fire on the
 * device that made the change because realtime only covers the others.
 *
 * None of that is layout, and all of it is the part where a mistake is silent.
 * Keeping it beside the JSX meant every reading of the screen's structure was a
 * reading of its persistence rules as well.
 *
 * The rules themselves are unchanged — this is a move, not a rewrite.
 */

/**
 * Every cached surface that grades against the calorie/protein/step targets a
 * plan+phase switch rewrites. Mirrors `RealtimeProvider`'s `user_goals` fan-out,
 * which handles the OTHER devices.
 */
const PLAN_PHASE_CASCADE_KEYS: string[][] = [
  // `plan_phase_goals` FIRST, and it was missing: it is the query
  // `useNutritionGoals` resolves ahead of `user_goals`, so leaving it inside its
  // 5-minute staleTime meant every surface below could be invalidated and still
  // re-render the OLD targets. The mutation invalidates it too; this is the
  // belt, because the plan/phase switch path does not go through that mutation.
  ['plan_phase_goals'],
  ['user_goals'], ['today'], ['readiness_today'], ['coach'], ['day_vault'], ['nutrition_entries'],
]

type ContextMode = 'normal' | 'travel' | 'illness' | 'emergency'

/**
 * Which detail sheet is open.
 *
 * ── AND WHY "CONTEXT" IS NOT ONE OF THEM ─────────────────────────────────────
 * Settings used to carry a Context card rendering the same `ContextSelector`
 * the nutrition day banner shows. It was not merely a duplicate view: the write
 * behind it, `useSetContext(date)`, branches on `date === today` and touches
 * TWO rows — `user_goals.context_mode` globally and `daily_logs`
 * `nutrition_exception` for the day. From Settings both halves fired; from the
 * banner on a past day only the second did, and the read side consults
 * `user_goals` alone, so a past-day selection never reflected back here.
 *
 * Context is a property of a nutrition day, and it now lives exactly where the
 * calories it modifies live. One entry point, one meaning.
 */
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
}

/**
 * What the form shows for the fraction of a second before the row loads.
 *
 * The macros used to be a THIRD set of numbers — 2500 / 180·250·80 — matching no
 * preset and no phase, so the settings page opened by flashing a target the user
 * has never been on. They come from the cut preset now, same as the server's
 * fallback; only the figures no preset carries are still written here.
 */
const CUT = phaseGoalsFor(DEFAULT_PROGRAM_ID, 'cut')

const DEFAULTS: Goals = {
  sleep_goal_hours: 8,
  calorie_goal: CUT.calorieGoal,
  protein_goal_g: CUT.proteinGoalG ?? 0,   // ?? 0 is the preset's "no target"
  carbs_goal_g: CUT.carbsGoalG ?? 0,
  fat_goal_g: CUT.fatGoalG ?? 0,
  steps_goal: CUT.stepsGoal,
  active_cal_goal: 500,
  water_goal_ml: 3000,
  context_mode: 'normal',
  goal_preset: null,
  unit_system: 'kg',
  reduce_motion: false,
}


/** Mirror device prefs to localStorage (read synchronously by the units + motion utils). */
export function applyPrefsToDevice(units: 'kg' | 'lb', motion: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('helix_units', units)
  window.localStorage.setItem('helix_reduce_motion', motion ? '1' : '0')
  document.documentElement.dataset.reduceMotion = motion ? 'true' : 'false'
  window.dispatchEvent(new Event('apex-units-change'))
}

export function useSettingsGoals() {
  const queryClient = useQueryClient()
  const [goals, setGoals] = useState<Goals>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  // target_weight_kg is a fresh column, so writing it self-heals (see
  // saveTargetWeight) rather than failing the whole Settings save on a DB that
  // hasn't run the paste-SQL yet. It's now driven by the selected phase (no
  // standalone input) — applyPhase persists the phase's target.
  // Week start: 0 = Sunday (default), 1 = Monday. Stored as week_end_day.
  const [weekStart, setWeekStart] = useState<0 | 1>(0)
  // Per-exercise effort logging. Deliberately NOT on `Goals`: `save()` spreads
  // the whole object into one upsert, so a column that has not been migrated
  // yet would fail EVERY settings save, not just this one. Own state, own
  // self-healing writer — the same shape week-start uses.
  const [trackRpe, setTrackRpe] = useState(false)
  // The persisted phase lever. Same shape as track_rpe and for the same reason:
  // `active_lever` is a fresh column, and folding it into the `Goals` object
  // would make EVERY settings save fail on a database that has not run the one
  // line of DDL. Own state, own self-healing writer.
  const [activeLever, setActiveLever] = useState<LeverId | null>(null)
  /** The training plan in force. The drawer that PREVIEWS one is the page's. */
  const [activePlanId, setActivePlanId] = useState<string>(DEFAULT_PROGRAM_ID)
  // User-edited per-plan+phase macro overrides (plan_phase_goals). `resolve` merges
  // an override over the static phaseGoalsFor default.
  const { resolve: resolvePhaseGoals, resolveVolume, saveOverride, saveVolumeTarget } = usePlanPhaseGoals()
  // The phase actually in force. goal_preset is the persisted tag; activePhase()
  // is the synchronous localStorage mirror the rest of the app reads.
  const livePhase = ((goals.goal_preset as NutritionMode) || (activePhase() as NutritionMode)) as NutritionMode
  // The rung the app is ACTUALLY grading against today: the stored selection
  // when there is one, else whatever `LEVER_SCHEDULE` puts on today's date.
  // Reading `activeLever` alone made this card disagree with every macro ring
  // in the app on a database that has never had the column.
  const todayISO = logicalTodayISO()
  const leverInForce = leverForDate(todayISO, activeLever, todayISO)

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
        })
        applyPrefsToDevice((data.unit_system ?? 'kg') as 'kg' | 'lb', data.reduce_motion ?? false)
        const we = (data as { week_end_day?: number | null }).week_end_day
        const ws: 0 | 1 = we === 0 ? 1 : 0
        setWeekStart(ws)
        try { localStorage.setItem('helix_week_start', String(ws)) } catch { /* ignore */ }
        const lv = (data as { active_lever?: string | null }).active_lever
        setActiveLever(isLeverId(lv) ? lv : null)
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

  /**
   * Commit the Edit Plan card: the five numbers AND the rung that produced them.
   *
   * The numbers go into `user_goals` as they always have, so every existing
   * consumer — the widget snapshot, the scorer's fallback, the macro rings —
   * keeps reading one row and needs no knowledge of levers at all. The rung is
   * written alongside as the DECISION, which is what lets a later phase switch
   * know whether these figures were chosen or merely inherited.
   */
  async function savePlanNumbers(next: PlanNumbers, rec: RecoveryNumbers, lever: LeverId, body: BodyTargets) {
    // One upsert for both groups. Sleep, active calories and water are ordinary
    // `user_goals` columns that no lever governs, so they ride along with the
    // five the rung does — but they are NOT sent to `plan_phase_goals` below,
    // which stores a plan's macro prescription and has no column for them.
    // `goal_preset` is tagged here because the deleted "Nutrition Goals" card
    // did it on every macro edit, and `livePhase` reads back through it. Losing
    // the write would leave a database that has never switched phase resolving
    // its phase from the program default forever.
    await save({ ...next, ...rec, goal_preset: livePhase })
    setActiveLever(lever)
    // ── AND ONTO THE ACTIVE PLAN + PHASE ──
    // `user_goals` is the row the server scorer reads; `plan_phase_goals` is
    // what the app resolves for the plan you are actually running. Writing only
    // the first left the second holding the plan's authored defaults, so typing
    // your own numbers here changed the grade and NOT the plan — and switching
    // phase and back silently restored the old macros over the ones you set.
    // A manual save is a statement about this plan's cut, so it is written as
    // one.
    /**
     * ── AND IT IS NOT ALLOWED TO FAIL QUIETLY ──────────────────────────────
     * This `await` used to end in `.catch(() => {})`, on the reasoning that an
     * unmigrated table just means `user_goals` still carries the numbers. That
     * reasoning is false HERE, and it hid the Custom-targets bug for as long as
     * it existed: `useNutritionGoals` resolves the plan+phase override BEFORE
     * the stored `user_goals` row, so a failed write does not fall back to the
     * numbers you typed — it falls back to the PLAN'S AUTHORED DEFAULTS, and
     * the button says "Saved!" over the top of it.
     *
     * (What was actually failing: the upsert never sent `user_id`, which is
     * half of that table's primary key. See `usePlanPhaseGoals`.)
     */
    try {
      await saveOverride({
        planId: activePlanId,
        phase: livePhase,
        patch: {
          calorieGoal: next.calorie_goal,
          proteinGoalG: next.protein_goal_g,
          carbsGoalG: next.carbs_goal_g,
          fatGoalG: next.fat_goal_g,
          stepsGoal: next.steps_goal,
          // The destination targets ride with the daily ones because they are
          // one statement about one plan's phase. They used to be edited in the
          // drawer, on blur, into this same table — same destination, different
          // moment, which is how the two copies drifted.
          targetWeightKg: body.target_weight_kg,
          targetBodyFatPct: body.target_body_fat_pct,
          targetMuscleMassKg: body.target_muscle_mass_kg,
        },
      })
    } catch (e) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Targets did not save to the plan.' })
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // `user_goals` carries the body targets as well, because the scorer and the
    // widget snapshot read that row and know nothing about plan_phase_goals.
    await saveTargetWeight(body.target_weight_kg)
    await saveBodyTargetNumbers(body.target_body_fat_pct, body.target_muscle_mass_kg)
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, active_lever: lever } as unknown as never, { onConflict: 'user_id' },
    )
    // Column not migrated yet → the numbers still saved and everything grades
    // correctly; only the NAME of the rung is lost until the paste-SQL runs.
    if (error && !/column|active_lever|schema cache|PGRST204/i.test(error.message)) {
      setStatus({ type: 'error', msg: error.message }); return
    }
    for (const key of PLAN_PHASE_CASCADE_KEYS) queryClient.invalidateQueries({ queryKey: key })
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

  /** Persist the phase's body-composition targets (BF % + muscle mass).
   *  Self-heals if the columns aren't migrated. */
  async function saveBodyTargets(p: NutritionPreset) {
    await saveBodyTargetNumbers(p.targetBodyFatPct ?? null, p.targetMuscleMassKg ?? null)
  }

  /** The two columns above, from whichever source decided them — a plan switch
   *  or a hand edit. One writer, so the self-healing regex lives in one place. */
  async function saveBodyTargetNumbers(bodyFatPct: number | null, muscleKg: number | null) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('user_goals').upsert(
      { user_id: session.user.id, target_body_fat_pct: bodyFatPct, target_muscle_mass_kg: muscleKg } as unknown as never,
      { onConflict: 'user_id' },
    )
    if (error && !/column|target_|schema cache|PGRST204/i.test(error.message)) setStatus({ type: 'error', msg: error.message })
  }


  return {
    goals, loading, saving, status, setStatus,
    weekStart, trackRpe, activeLever, activePlanId, livePhase, leverInForce,
    save, saveWeekStart, saveTrackRpe, savePlanNumbers, applyPlanPhase,
    // The plan+phase resolvers travel with the writers that use them, so the
    // page never has to know that two different tables answer "what are my
    // targets" or which one wins.
    resolvePhaseGoals, resolveVolume, saveVolumeTarget,
  }
}
