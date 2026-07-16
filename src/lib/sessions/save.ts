/**
 * saveSession — internal service that persists a workout session + sets to
 * Supabase and computes volume + PRs (Epley).
 *
 * Shared by POST /api/sessions and POST /api/ai/parse-workout so there is a
 * single write path (no internal self-fetch / NEXT_PUBLIC_APP_URL dependency).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type { SaveWorkoutPayload } from '@/lib/types/workout'
import { epley1RM } from '@/lib/utils/epley'
import { isReentryWeek } from '@/lib/programs'

type DB = SupabaseClient<Database>

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

/** Matches "column doesn't exist yet" errors so pre-migration writes self-heal. */
const MISSING_COLUMN_RE = /column|schema cache|PGRST204/i

export async function saveSession(
  supabase: DB,
  userId: string,
  payload: SaveWorkoutPayload,
  metrics: SessionMetrics = {},
): Promise<SaveSessionResult> {
  // IDEMPOTENCY: the coach report's session.id is the dedupe key — a
  // double-pasted report returns the existing session instead of duplicating.
  // (A missing column just means migration 004 hasn't run — skip dedupe.)
  if (payload.clientSessionId) {
    const { data: dup, error: dupError } = await supabase
      .from('workout_sessions')
      .select('id, total_volume_kg, set_count, pr_count')
      .eq('user_id', userId)
      .eq('client_session_id', payload.clientSessionId)
      .maybeSingle()
    const existing = dup as { id: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null } | null
    if (!dupError && existing) {
      return {
        sessionId: existing.id,
        totalVolumeKg: existing.total_volume_kg ?? 0,
        setCount: existing.set_count ?? 0,
        prCount: existing.pr_count ?? 0,
        newPRs: [],
        duplicate: true,
      }
    }
  }

  const totalVolumeKg = payload.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)

  // Historical best est_1RM per exercise for PR detection
  const exerciseIds = [...new Set(payload.sets.map((s) => s.exerciseId))]
  const { data: prHistoryRaw } = await supabase
    .from('workout_sets')
    .select('exercise_id, est_1rm_kg')
    .in('exercise_id', exerciseIds)
    .eq('user_id', userId)
    .order('est_1rm_kg', { ascending: false })

  const prHistory = (prHistoryRaw ?? []) as Array<{ exercise_id: string; est_1rm_kg: number | null }>
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
    const isPr = !reentry && est1rm > prevBest
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
    set_count: payload.sets.length,
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

  let { data: sessionRaw, error: sessionError } = await supabase
    .from('workout_sessions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(sessionInsert as unknown as any)
    .select('id')
    .single()

  // Pre-migration self-heal: retry without the Command Center columns so a
  // session save never fails on an unmigrated DB.
  if (sessionError && MISSING_COLUMN_RE.test(sessionError.message)) {
    const { client_session_id: _c, day_key: _d, coach_report: _r, next_session_flag: _n, ...legacy } = sessionInsert
    void _c; void _d; void _r; void _n
    ;({ data: sessionRaw, error: sessionError } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('workout_sessions').insert(legacy as unknown as any).select('id').single())
  }

  const session = sessionRaw as { id: string } | null
  if (sessionError || !session) {
    throw new Error(`Failed to save session: ${sessionError?.message ?? 'unknown'}`)
  }

  // Insert sets
  const dbSets = setsToInsert.map(({ s, est1rm, isPr }) => ({
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
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error: setsError } = await supabase.from('workout_sets').insert(dbSets as unknown as any)
  if (setsError && MISSING_COLUMN_RE.test(setsError.message)) {
    // Pre-migration self-heal: strip exercise_order and retry.
    const legacySets = dbSets.map(({ exercise_order: _o, ...rest }) => { void _o; return rest })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;({ error: setsError } = await supabase.from('workout_sets').insert(legacySets as unknown as any))
  }
  if (setsError) {
    console.error('[saveSession] sets insert error (non-fatal):', setsError)
  }

  const newPRs = setsToInsert
    .filter((x) => x.isPr)
    .map((x) => ({ exerciseName: x.s.exerciseName, est1rm: x.est1rm }))

  return {
    sessionId: session.id,
    totalVolumeKg,
    setCount: payload.sets.length,
    prCount,
    newPRs,
  }
}
