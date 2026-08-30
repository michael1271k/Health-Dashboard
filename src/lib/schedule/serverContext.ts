import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { DEFAULT_PROGRAM_ID, normalizePlanId, type ProgramPhase, type ScheduleContext } from '@/lib/programs'
import { parseLayout } from '@/lib/schedule/layout'

/**
 * The schedule context a ROUTE is running, read from the database.
 *
 * ── THE BUG THIS EXISTS TO CLOSE ─────────────────────────────────────────────
 * `getActiveProgramId()`, `activePhase()`, `getScheduleOverride()` and
 * `getProgramLayout()` are all synchronous reads over `localStorage`. That is
 * the right design in a browser — the schedule helpers have to answer during
 * render — but there is no `window` on a server, so all four fall back to a
 * constant. Server-side, the app has been resolving:
 *
 *   · plan     → always `DEFAULT_PROGRAM_ID`, whatever plan is actually active
 *   · phase    → always `'cut'`
 *   · swaps    → always none, though `schedule_overrides` is a real table
 *   · layout   → always the authored weekdays, though `program_day_layout` is too
 *
 * `/api/widget/snapshot` therefore announced the wrong session on any
 * non-default plan and ignored every swap; `/api/compute-score` graded rest days
 * against a week the athlete might not have been training.
 *
 * Every read here degrades softly. A missing table, an unmigrated column or a
 * dropped connection yields the authored plan — which is what the server was
 * silently doing anyway, except now it is a fallback rather than the only path.
 */

type DB = SupabaseClient<Database>

/**
 * `active_phase` is free text in the column; only two values mean anything.
 *
 * A row written before `maintenance` was deleted still carries the string. It
 * used to resolve to the bulk deck; it narrows to the cut now, which is the
 * block being run either way — `forPhase` only branches on `cut`.
 */
function toPhase(raw: unknown): ProgramPhase {
  return raw === 'bulk' ? 'bulk' : 'cut'
}

/**
 * Resolve the plan, phase, swaps and weekday layout for one user.
 *
 * `goals` is optional because the two callers have usually already selected the
 * `user_goals` row for their own reasons; passing it avoids a second round trip
 * on a surface measured in hundreds of milliseconds.
 */
export async function serverScheduleContext(
  supabase: DB,
  userId: string,
  goals?: Record<string, unknown> | null,
  /**
   * The date being resolved, when the caller has one.
   *
   * ── AND IT NO LONGER CHANGES THE ANSWER ────────────────────────────────────
   * It existed for one reason: a maintenance week used to override the phase to
   * `'maintenance'` here. That was the duplication this codebase has now removed
   * — a maintenance week is a NUTRITION lever and leaves the training deck
   * exactly as authored, so forcing a phase made the server resolve a different
   * programme from the one the client had seeded.
   *
   * Kept in the signature because both callers pass it and a date is the right
   * thing for this resolver to accept if anything here ever becomes dated again.
   */
  dateISO?: string,
): Promise<ScheduleContext> {
  void dateISO
  let row = goals ?? null
  if (row == null) {
    const { data } = await supabase
      .from('user_goals')
      .select('active_plan, active_program, active_phase, goal_preset, active_lever, maintenance_until')
      .eq('user_id', userId).maybeSingle()
    row = (data ?? null) as Record<string, unknown> | null
  }

  // `active_plan` is the current column; `active_program` is the pre-
  // consolidation one and still holds a stale id on this account, so it is a
  // fallback and never a first choice. Same precedence the device mirror uses
  // (`utils/prefsSync.ts`), because the two disagreeing is the whole failure.
  const programId =
    normalizePlanId(row?.active_plan as string | null) ??
    normalizePlanId(row?.active_program as string | null) ??
    DEFAULT_PROGRAM_ID

  /**
   * `active_phase` is the field; `goal_preset` is the older tag it replaced.
   *
   * ── AND A MAINTENANCE WEEK NO LONGER OVERRIDES IT ──────────────────────────
   * This used to force the phase to `'maintenance'` on a maintenance date,
   * which is the duplication the whole axis has now been rid of: the phase
   * decides which DECK you train, a maintenance week does not change the deck,
   * and forcing it here made the server resolve a different programme from the
   * one the client seeded. The week lives on the lever axis, and every consumer
   * that needs to soften a grade for it asks `isMaintenanceDate` directly.
   */
  const phase: ProgramPhase = toPhase(row?.active_phase ?? row?.goal_preset)

  const [overrides, layout] = await Promise.all([
    loadOverrides(supabase, userId),
    loadLayout(supabase, userId, programId),
  ])

  return { programId, phase, overrides, layout }
}

/**
 * Every swap this user has recorded.
 *
 * Unbounded on purpose: `schedule_overrides` is one row per *changed* date, so
 * it is tens of rows after a year, not thousands, and a date filter would have
 * to know the caller's window — which the widget (today) and the scorer (today
 * plus a backfill range) do not share.
 */
async function loadOverrides(supabase: DB, userId: string): Promise<Record<string, string>> {
  try {
    const { data } = await supabase
      .from('schedule_overrides').select('date, day_key').eq('user_id', userId)
    const out: Record<string, string> = {}
    for (const r of (data ?? []) as Array<{ date: string; day_key: string }>) out[r.date] = r.day_key
    return out
  } catch {
    return {}
  }
}

/** The permanent weekday remap for the plan being run, or `{}` (= as authored). */
async function loadLayout(supabase: DB, userId: string, programId: string) {
  try {
    const { data } = await supabase
      .from('program_day_layout').select('layout')
      .eq('user_id', userId).eq('program_id', programId).maybeSingle()
    return parseLayout((data as { layout?: unknown } | null)?.layout)
  } catch {
    return {}
  }
}
