import { NextResponse } from 'next/server'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'
import { saveSession } from '@/lib/sessions/save'
import { resolveExercises } from '@/lib/sessions/resolveExercises'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { requireUserId } from '@/lib/auth/identity'
import type { SaveWorkoutPayload, WorkoutSet } from '@/lib/types/workout'

export async function POST(req: Request) {
  // Auth: Supabase admin client — single-user app, get the sole user's ID
  const supabase = getServerSupabaseClient()

  const userId = await requireUserId(req, supabase)
  if (!userId) {
    return NextResponse.json({ error: 'No authenticated user' }, { status: 401 })
  }

  // Parse + validate
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SaveWorkoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const input = parsed.data

  try {
    // Command Center commits carry names only — resolve UUID-less sets to
    // catalog exercises (alias-aware; creates missing rows). Every set must
    // end up resolved before saveSession runs its PR math.
    const unresolved = input.sets.filter((s) => !s.exerciseId)
    let idByName = new Map<string, string>()
    if (unresolved.length) {
      const uniqueNames = [...new Map(unresolved.map((s) => [s.exerciseName, {
        name: s.exerciseName, nameHe: s.exerciseNameHe, muscleGroups: s.muscleGroups,
      }])).values()]
      idByName = await resolveExercises(supabase, userId, input.splitDay, uniqueNames)
    }
    const sets: WorkoutSet[] = input.sets.map((s) => ({
      exerciseId: s.exerciseId ?? idByName.get(s.exerciseName) ?? '',
      exerciseName: s.exerciseName,
      exerciseNameHe: s.exerciseNameHe,
      setNumber: s.setNumber,
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      setType: s.setType,
      exerciseOrder: s.exerciseOrder,
      side: s.side,
      pairId: s.pairId,
    }))
    const missing = sets.filter((s) => !s.exerciseId).map((s) => s.exerciseName)
    if (missing.length) {
      return NextResponse.json({ error: `Could not resolve exercises: ${[...new Set(missing)].join(', ')}` }, { status: 422 })
    }

    const payload: SaveWorkoutPayload = {
      splitDay: input.splitDay,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      sets,
      notes: input.notes,
      clientSessionId: input.clientSessionId,
      replaceSessionId: input.replaceSessionId,
      dayKey: input.dayKey,
      coachReport: input.coachReport,
      nextSessionFlag: input.nextSessionFlag,
    }
    const result = await saveSession(supabase, userId, payload, {
      durationMin: input.metrics?.durationMin,
      avgBpm: input.metrics?.avgBpm,
      caloriesBurned: input.metrics?.caloriesBurned,
      reportMd: input.reportMd,
    })

    if (result.duplicate) {
      return NextResponse.json({ error: 'duplicate', sessionId: result.sessionId }, { status: 409 })
    }
    return NextResponse.json({
      sessionId: result.sessionId,
      totalVolumeKg: result.totalVolumeKg,
      setCount: result.setCount,
      prCount: result.prCount,
      newPRs: result.newPRs,
    })
  } catch (err) {
    console.error('[sessions] save error:', err)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  // Same-origin UI calls allowed; external calls require the webhook secret.
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const userId = users?.[0]?.id
  if (!userId) return NextResponse.json({ sessions: [] })

  const { data } = await supabase
    .from('workout_sessions')
    .select('id, started_at, split_day, total_volume_kg, notes')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20)

  const sessions = (data ?? []) as Array<{
    id: string
    started_at: string
    split_day: string
    total_volume_kg: number | null
    notes: string | null
  }>

  return NextResponse.json({ sessions })
}
