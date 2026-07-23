/**
 * saveSession — internal service that persists a workout session + sets to
 * Supabase and computes volume + PRs (Epley). The single write path behind
 * POST /api/sessions (no internal self-fetch / NEXT_PUBLIC_APP_URL dependency).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type { SaveWorkoutPayload } from '@/lib/types/workout'
import { countCommittedSets } from '@/lib/sessions/schema'
import { epley1RM } from '@/lib/utils/epley'
import { isReentryWeek } from '@/lib/programs'

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

export interface SaveSessionResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  newPRs: Array<{ exerciseName: string; est1rm: number }>
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
  const isWarmup = (s: (typeof payload.sets)[number]) => s.setType === 'warmup'
  const totalVolumeKg = payload.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  // Set count: a unilateral L/R split is ONE set tracked as two sub-sets sharing
  // a `pairId` (see countCommittedSets). Volume still sums both sides (both are
  // real work); only the count de-duplicates.
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
      .select('exercise_id, est_1rm_kg')
      .in('exercise_id', exerciseIds).eq('user_id', userId)
      .order('est_1rm_kg', { ascending: false }),
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

  const prHistory = (prHistoryRes.data ?? []) as Array<{ exercise_id: string; est_1rm_kg: number | null }>
  const bestPrMap = new Map<string, number>()
  for (const row of prHistory) {
    if (row.est_1rm_kg !== null && !bestPrMap.has(row.exercise_id)) {
      bestPrMap.set(row.exercise_id, row.est_1rm_kg)
    }
  }

  // Pre-compute PR count for the session row. v5.1: RE-ENTRY weeks (Jul 19 + 26,
  // ~90% loads) are excluded from PR flagging entirely.
  const reentry = isReentryWeek(payload.startedAt.slice(0, 10))
  const setsToInsert = payload.sets.map((s) => {
    const est1rm = epley1RM(s.weightKg, s.reps)
    const prevBest = bestPrMap.get(s.exerciseId) ?? 0
    // A PR requires beating an existing baseline — the FIRST time an exercise is
    // ever logged is never a PR (no fake gold stars).
    const hadBaseline = bestPrMap.has(s.exerciseId)
    const isPr = !reentry && !isWarmup(s) && hadBaseline && est1rm > prevBest
    return { s, est1rm, isPr }
  })
  const prCount = setsToInsert.filter((x) => x.isPr).length

  const computedDuration =
    Math.max(0, Math.round((new Date(payload.endedAt).getTime() - new Date(payload.startedAt).getTime()) / 60000)) || null
  const durationMin = metrics.durationMin ?? computedDuration

  const sessionInsert: InsertRow<'workout_sessions'> = {
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
  }

  const { data: sessionRaw, error: sessionError } = await supabase
    .from('workout_sessions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(sessionInsert as unknown as any)
    .select('id')
    .single()

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

  const newPRs = setsToInsert
    .filter((x) => x.isPr)
    .map((x) => ({ exerciseName: x.s.exerciseName, est1rm: x.est1rm }))

  return {
    sessionId: session.id,
    totalVolumeKg,
    setCount,
    prCount,
    newPRs,
  }
}
