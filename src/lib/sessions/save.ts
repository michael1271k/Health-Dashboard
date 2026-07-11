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
}

export async function saveSession(
  supabase: DB,
  userId: string,
  payload: SaveWorkoutPayload,
  metrics: SessionMetrics = {},
): Promise<SaveSessionResult> {
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
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: setsError } = await supabase.from('workout_sets').insert(dbSets as unknown as any)
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
