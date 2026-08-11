/**
 * saveSession — internal service that persists a workout session + sets to
 * Supabase and computes volume + PRs (Epley). The single write path behind
 * POST /api/sessions (no internal self-fetch / NEXT_PUBLIC_APP_URL dependency).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type { SaveWorkoutPayload } from '@/lib/types/workout'
import { countCommittedSets } from '@/lib/sessions/schema'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { isTimedExercise } from '@/lib/exercises/timed'
import { buildBaselines, detectSessionPrs, recordSets, type PrAxis } from '@/lib/training/prEngine'
import { truthFloor } from '@/lib/training/prTruth'
import { repWindowFor } from '@/lib/training/ceilings'
import { normalizeCr10 } from '@/lib/training/effort'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

type DB = SupabaseClient<Database>

const nextDayISO = (d: string): string => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10)
}

export interface SessionMetrics {
  durationMin?: number | null
  avgBpm?: number | null
  caloriesBurned?: number | null
  reportMd?: string | null
}

// Re-exported so existing importers (`useSessionDetail`, the deck components)
// keep working — the type's home is now the engine.
export type { PrAxis }

export interface SaveSessionResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  /** New PRs this session, per exercise, with the axes beaten (weight/reps/volume/e1rm). */
  newPRs: Array<{ exerciseName: string; est1rm: number; axes: PrAxis[] }>
  /** True when clientSessionId matched an existing session — nothing written. */
  duplicate?: boolean
}

export async function saveSession(
  supabase: DB,
  userId: string,
  payload: SaveWorkoutPayload,
  metrics: SessionMetrics = {},
): Promise<SaveSessionResult> {
  // Warmups count toward volume + set count (they still never earn a PR).
  const totalVolumeKg = sessionVolumeKg(payload.sets)
  // Set count: a unilateral L/R split is ONE set tracked as two sub-sets sharing
  // a `pairId` (see countCommittedSets). Volume counts both sides — but at the
  // WEAKER side's numbers, so asymmetry can't inflate the total (see
  // sessionVolumeKg); only the count de-duplicates.
  const setCount = countCommittedSets(payload.sets)
  const exerciseIds = [...new Set(payload.sets.map((s) => s.exerciseId))]

  // EDIT flow: replace an existing session in place — delete it (+ its sets)
  // up front so the one-per-date guard doesn't block the re-commit and the
  // fresh insert below becomes the edited session.
  if (payload.replaceSessionId) {
    await supabase.from('workout_sets').delete().eq('session_id', payload.replaceSessionId).eq('user_id', userId)
    await supabase.from('workout_sessions').delete().eq('id', payload.replaceSessionId).eq('user_id', userId)
  }

  // ONE parallel round-trip for both the date's existing sessions (idempotency
  // + one-session-per-date) and the PR-history baseline. Parallelizing here (not
  // three sequential Netlify→Supabase hops) keeps the function well under its
  // timeout — the root of the "Finish Session hangs" report.
  const dateStr = payload.startedAt.slice(0, 10)
  const dayEnd = nextDayISO(dateStr)
  const [daySessionsRes, prHistoryRes] = await Promise.all([
    supabase.from('workout_sessions')
      .select('id, client_session_id, total_volume_kg, set_count, pr_count')
      .eq('user_id', userId)
      .gte('started_at', `${dateStr}T00:00:00Z`).lt('started_at', `${dayEnd}T00:00:00Z`),
    supabase.from('workout_sets')
      // reps + weight + set_type carried: the 4-axis PR engine needs max weight,
      // max reps@load, best est-1RM, and best single-set tonnage. `set_type` is
      // load-bearing — a warm-up must not raise a bar it can never win. A TIMED
      // hold's PR is the best SECONDS (its `reps`), not an est-1RM (none at
      // 0 kg). `side`/`pair_id` collapse a unilateral pair to the ONE set it
      // physically is, so the volume bar matches `sessionVolumeKg`. `session_id`
      // groups rows for the one SESSION-level axis, best tonnage in a day.
      .select('exercise_id, est_1rm_kg, reps, weight_kg, set_type, side, pair_id, session_id')
      .in('exercise_id', exerciseIds).eq('user_id', userId),
  ])

  type DayRow = { id: string; client_session_id: string | null; total_volume_kg: number | null; set_count: number | null; pr_count: number | null }
  const daySessions = (daySessionsRes.data ?? []) as DayRow[]
  const asDup = (s: DayRow): SaveSessionResult => ({
    sessionId: s.id, totalVolumeKg: s.total_volume_kg ?? 0, setCount: s.set_count ?? 0, prCount: s.pr_count ?? 0, newPRs: [], duplicate: true,
  })

  // The idempotency / one-per-date DUPLICATE GUARD is for FRESH commits only.
  // An EDIT (replaceSessionId) has already deleted its target above and MUST
  // always re-insert — running the guard for an edit could match a `mine`
  // (reused client_session_id) or an `others` row and wrongly return `asDup`
  // (a 409), which the client shows as "Already logged" and never persists the
  // edit. That silent no-op was the edit-doesn't-save bug.
  if (!payload.replaceSessionId) {
    const mine = payload.clientSessionId ? daySessions.find((s) => s.client_session_id === payload.clientSessionId) : undefined
    const others = daySessions.filter((s) => s.id !== mine?.id)

    if (mine) {
      // Retry of the SAME logical session. If the sets actually landed it's a
      // true duplicate; if a prior attempt half-wrote (session row saved but the
      // sets stalled — the "saved but hung" case), heal by deleting the partial
      // and recreating it below so the session is never left incomplete.
      const { count } = await supabase.from('workout_sets')
        .select('id', { count: 'exact', head: true }).eq('session_id', mine.id)
      if ((count ?? 0) >= payload.sets.length) return asDup(mine)
      await supabase.from('workout_sets').delete().eq('session_id', mine.id)
      await supabase.from('workout_sessions').delete().eq('id', mine.id)
    } else if (others.length > 0) {
      // Strictly one session per calendar date — a second distinct commit for a
      // date that already has one returns the existing session, never a duplicate.
      return asDup(others[0])
    }
  }

  const prHistory = (prHistoryRes.data ?? []) as Array<{ exercise_id: string; est_1rm_kg: number | null; reps: number | null; weight_kg: number | null; set_type: string | null; side: string | null; pair_id: string | null; session_id: string | null }>

  // Every PR rule lives in `prEngine` — the live deck runs the SAME code against
  // the same baselines, so a badge shown on the green tick is a badge that gets
  // recorded. (This block used to be ~60 lines of inline map-juggling that the
  // client had no way to reuse.)
  // CANONICALISED. `personal_records.exercise_key` is a display NAME, and
  // `useSessionDetail` looks ledger rows up by `exercises.name` — which
  // `resolveExercises` canonicalises on the way in. Writing the raw payload
  // name here meant a set logged under an alias filed its record under a key
  // nothing would ever match, so the trophy rendered with no axis chips.
  const nameByEx = new Map<string, string>()
  for (const s of payload.sets) nameByEx.set(s.exerciseId, canonicalExerciseName(s.exerciseName))

  // Rep windows gate the e1RM axis (see `e1rmEligible`). Resolved once per
  // exercise, and by NAME because that is what the program is keyed on.
  const windowByEx = new Map<string, { floor: number; ceiling: number } | null>()
  const windowFor = (exerciseId: string) => {
    if (!windowByEx.has(exerciseId)) {
      windowByEx.set(exerciseId, repWindowFor(nameByEx.get(exerciseId) ?? '', payload.dayKey ?? undefined))
    }
    return windowByEx.get(exerciseId) ?? null
  }

  const baselines = buildBaselines(
    prHistory.map((r) => ({
      key: r.exercise_id, weightKg: r.weight_kg, reps: r.reps,
      est1rm: r.est_1rm_kg, setType: r.set_type,
      side: r.side, pairId: r.pair_id, sessionId: r.session_id,
      repFloor: windowFor(r.exercise_id)?.floor ?? null,
    })),
    (key) => isTimedExercise(nameByEx.get(key) ?? ''),
    // Baselines here are keyed by exercise_id; the asserted record book is keyed
    // by canonical NAME. `nameByEx` is already canonicalised for exactly this
    // reason (it is what `personal_records.exercise_key` is written as), so the
    // two agree by construction. Without the floor, four months of set-less
    // Notion-era sessions would let a return to an old load read as a new
    // record — see prTruth.ts.
    (key) => truthFloor(nameByEx.get(key)),
  )

  const sessionDate = payload.startedAt.slice(0, 10)
  const candidates = payload.sets.map((s, i) => ({
    key: s.exerciseId, weightKg: s.weightKg, reps: s.reps,
    setType: s.setType ?? null, timed: isTimedExercise(s.exerciseName),
    repFloor: windowFor(s.exerciseId)?.floor ?? null,
    side: s.side ?? null, pairId: s.pairId ?? null,
    date: sessionDate, exerciseName: s.exerciseName, setNumber: s.setNumber ?? i + 1,
  }))
  const prResult = detectSessionPrs(candidates, baselines)
  const prAxesByEx = prResult.axesByKey
  const prCount = prResult.prCount

  const setsToInsert = payload.sets.map((s, i) => ({
    s,
    est1rm: prResult.perSet[i].est1rm,
    isPr: prResult.perSet[i].axes.length > 0,
  }))

  const computedDuration =
    Math.max(0, Math.round((new Date(payload.endedAt).getTime() - new Date(payload.startedAt).getTime()) / 60000)) || null
  const durationMin = metrics.durationMin ?? computedDuration

  // `session_rpe` isn't in the generated types yet (Supabase is schema-of-record
  // and types.ts lags), hence the intersection rather than a bare InsertRow.
  const sessionInsert: InsertRow<'workout_sessions'> & { session_rpe: number | null } = {
    user_id: userId,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    split_day: payload.splitDay,
    notes: payload.notes || null,
    total_volume_kg: totalVolumeKg,
    session_score: null,
    set_count: setCount,
    pr_count: prCount,
    duration_min: durationMin,
    calories_burned: metrics.caloriesBurned ?? null,
    avg_bpm: metrics.avgBpm ?? null,
    report_md: metrics.reportMd ?? null,
    client_session_id: payload.clientSessionId ?? null,
    day_key: payload.dayKey ?? null,
    coach_report: payload.coachReport ?? null,
    next_session_flag: payload.nextSessionFlag ?? null,
    // Self-heals: a pre-migration DB simply drops the key (see the retry below).
    session_rpe: normalizeCr10(payload.sessionRpe),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertSession = (row: any) =>
    supabase.from('workout_sessions').insert(row).select('id').single()

  let { data: sessionRaw, error: sessionError } = await insertSession(sessionInsert as unknown)
  // `session_rpe` is a newer column. Losing an entire workout because an
  // optional effort rating has nowhere to land is never the right trade — drop
  // the field and re-insert. The same pattern guards side/pair_id below.
  if (sessionError && /session_rpe|schema cache|PGRST204/i.test(sessionError.message)) {
    const { session_rpe: _dropped, ...withoutRpe } = sessionInsert as Record<string, unknown>
    void _dropped
    ;({ data: sessionRaw, error: sessionError } = await insertSession(withoutRpe))
  }

  const session = sessionRaw as { id: string } | null
  if (sessionError || !session) {
    throw new Error(`Failed to save session: ${sessionError?.message ?? 'unknown'}`)
  }

  // Insert sets. side/pair_id are ONLY sent when a set is actually unilateral —
  // a normal (bilateral) session never references those columns, so committing/
  // editing a normal session does NOT depend on the workout_sets side/pair_id
  // migration having run. (Sending them unconditionally previously made EVERY
  // commit fail the insert on an unmigrated table — the edit-doesn't-save bug.)
  const hasUnilateral = setsToInsert.some(({ s }) => s.side === 'L' || s.side === 'R' || s.pairId)
  const dbSets = setsToInsert.map(({ s, est1rm, isPr }) => {
    const row: Record<string, unknown> = {
      session_id: session.id,
      exercise_id: s.exerciseId,
      user_id: userId,
      set_number: s.setNumber,
      weight_kg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe ?? null,
      is_pr: isPr,
      est_1rm_kg: est1rm,
      exercise_order: s.exerciseOrder ?? null,
      set_type: s.setType ?? 'normal',
    }
    if (hasUnilateral) { row.side = s.side ?? null; row.pair_id = s.pairId ?? null }
    return row
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error: setsError } = await supabase.from('workout_sets').insert(dbSets as unknown as any)
  // Self-heal: unilateral used but the side/pair_id columns aren't migrated yet →
  // retry without them so the session still saves (L/R metadata dropped until the
  // migration runs). Mirrors the daily_logs v5.1 column self-heal.
  if (setsError && hasUnilateral && /column|schema cache|PGRST204|side|pair_id/i.test(setsError.message ?? '')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure-to-omit the two unmigrated columns
    const baseSets = dbSets.map((r) => { const { side: _s, pair_id: _p, ...rest } = r; return rest })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;({ error: setsError } = await supabase.from('workout_sets').insert(baseSets as unknown as any))
  }
  if (setsError) {
    // FATAL: an edit already deleted the old session above, so a swallowed sets
    // failure would leave the session empty AND look like a success to the
    // client. Roll back the just-inserted session row, then throw so the commit
    // surfaces the error instead of no-op'ing.
    console.error('[saveSession] sets insert failed:', setsError)
    await supabase.from('workout_sessions').delete().eq('id', session.id)
    throw new Error(`Failed to save sets: ${setsError.message}`)
  }

  // The ledger records the set that WON each axis, not the session's maximum
  // per field — see `recordSets`.
  const records = recordSets(candidates, prResult)

  const prRows: Array<Record<string, unknown>> = []
  const newPRs: Array<{ exerciseName: string; est1rm: number; axes: PrAxis[] }> = []
  for (const [ex, axes] of prAxesByEx) {
    const name = nameByEx.get(ex) ?? ex
    const byAxis = records.get(ex)
    newPRs.push({ exerciseName: name, est1rm: byAxis?.get('e1rm')?.value ?? 0, axes: [...axes] })
    for (const axis of axes) {
      const rec = byAxis?.get(axis)
      prRows.push({
        user_id: userId, exercise_key: name, axis,
        value: Math.round((rec?.value ?? 0) * 100) / 100,
        // EVERY axis carries the winning set's load and reps. Volume and e1RM
        // used to store null for both, on the (then true) grounds that they were
        // exercise-level totals with no set of their own. Both became per-SET
        // axes on 2026-08-03, and the nulls outlived the reason: the session
        // ledger matches a record to the set that earned it by (weight, reps),
        // so a null pair fell back to "the exercise's last flagged set" and hung
        // a Volume chip on whichever set happened to come last.
        reps: rec?.reps ?? null,
        weight_kg: rec?.weightKg ?? null,
        session_id: session.id, achieved_on: dateStr,
      })
    }
  }
  // Self-healing PR ledger write — a missing personal_records table is ignored
  // (correctness comes from the history-derived baselines above; the ledger just
  // powers the PR badges + timeline).
  if (prRows.length) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('personal_records').upsert(prRows as any, { onConflict: 'user_id,exercise_key,axis' })
      // A bare catch swallowed every failure equally, so a real write error
      // looked exactly like an un-migrated table and a record could vanish with
      // no signal anywhere. Only the missing-table case is silent now.
      if (error && !/relation|does not exist|schema cache|PGRST20[0-9]/i.test(error.message)) {
        console.error('[save] personal_records upsert failed:', error.message)
      }
    } catch (e) {
      console.error('[save] personal_records upsert threw:', e)
    }
  }

  return {
    sessionId: session.id,
    totalVolumeKg,
    setCount,
    prCount,
    newPRs,
  }
}
