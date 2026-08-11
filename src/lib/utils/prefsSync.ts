'use client'

import { supabase } from '@/lib/supabase/client'
import { normalizePlanId, setActiveProgramId, setActivePhase } from '@/lib/programs'
import { setTrackRpeMirror } from '@/lib/hooks/useTrackRpe'

/**
 * Boot-time preference hydration: the database row (user_goals) is the source
 * of truth for device preferences; localStorage is only its per-device cache
 * for synchronous reads. Pulling on every launch makes Safari, the Home-Screen
 * PWA, and any other browser context render with identical settings.
 *
 * ── THE PLAN/PHASE PATH WAS BROKEN THREE WAYS ────────────────────────────────
 * Found while auditing why a day swap didn't cross devices; this is the same
 * family and it never worked at all.
 *
 *  1. WRONG COLUMN. It read `active_program`, a pre-consolidation column. The
 *     current writer (Settings → applyPlanPhase) writes `active_plan` and
 *     `active_phase`. Live check: `active_program` still holds "axis5_hybrid",
 *     a plan id that no longer exists in PROGRAMS.
 *  2. WRONG KEY. It wrote `helix_active_program`, which `getActiveProgramId`
 *     consults only as a FALLBACK behind `helix_active_plan`. Any device that
 *     had ever used the plan picker therefore ignored the DB value entirely.
 *  3. PHASE WASN'T CARRIED AT ALL. Switch to bulk on the desktop and the phone
 *     stayed on cut — and phase drives the prescribed set counts, so the two
 *     devices disagreed about the workout itself.
 *
 * Now: current columns first with the legacy one as fallback, the id validated
 * against PROGRAMS so a dead value can't be adopted, written through the
 * canonical setters, and a `helix-plan-change` event so mounted components
 * actually re-render (programs.ts holds the subscription).
 */
export async function hydratePrefsFromDb(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_goals')
      .select('unit_system, reduce_motion, active_program, active_plan, active_phase, goal_preset, track_rpe')
      .maybeSingle()
    if (error || !data) return // columns not migrated yet / no row — device values stand
    const g = data as {
      unit_system: string | null; reduce_motion: boolean | null
      active_program: string | null; active_plan: string | null
      active_phase: string | null; goal_preset: string | null
      track_rpe: boolean | null
    }

    if (g.unit_system) localStorage.setItem('helix_units', g.unit_system)
    if (g.reduce_motion != null) {
      localStorage.setItem('helix_reduce_motion', g.reduce_motion ? '1' : '0')
      document.documentElement.dataset.reduceMotion = g.reduce_motion ? 'true' : 'false'
    }

    // Plan: current column, then the legacy one, and only if it names a plan
    // that still exists.
    const planId = normalizePlanId(g.active_plan) ?? normalizePlanId(g.active_program)
    if (planId) setActiveProgramId(planId)

    // Phase: `active_phase` is the field; `goal_preset` is the older tag the
    // macro presets still write, and is a correct fallback for the same value.
    const phase = g.active_phase ?? g.goal_preset
    if (phase === 'cut' || phase === 'bulk' || phase === 'maintenance') setActivePhase(phase)

    // Effort logging — the deck reads the mirror synchronously during render.
    if (g.track_rpe != null) setTrackRpeMirror(g.track_rpe)

    // Wake any mounted listeners (unit hooks re-read on this event).
    window.dispatchEvent(new Event('apex-units-change'))
    window.dispatchEvent(new Event('helix-plan-change'))
  } catch { /* never block boot on preference sync */ }

  // Week-start preference — kept in its OWN self-healing query so a not-yet-
  // migrated `week_end_day` column can't take down units/motion hydration above.
  // week_end_day 0 (Sunday) ⇒ week starts Monday (1); anything else ⇒ Sunday (0).
  try {
    const { data } = await supabase.from('user_goals').select('week_end_day').maybeSingle()
    const end = (data as { week_end_day?: number | null } | null)?.week_end_day
    if (end != null) localStorage.setItem('helix_week_start', end === 0 ? '1' : '0')
  } catch { /* column not migrated — Sunday-start default stands */ }
}
