import { NextResponse } from 'next/server'
import { SaveWorkoutSchema, toWorkoutSet } from '@/lib/sessions/schema'
import { saveSession } from '@/lib/sessions/save'
import { resolveExercises } from '@/lib/sessions/resolveExercises'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/auth/identity'
import type { SaveWorkoutPayload, WorkoutSet } from '@/lib/types/workout'

export async function POST(req: Request) {
  // The client is service-role and bypasses RLS, so the caller's JWT is the
  // only thing deciding whose sets these are.
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
    // ONE adapter, spreading the validated row — see `toWorkoutSet`. The hand
    // written literal that used to sit here named ten fields and silently ate
    // the eleventh (`quality`) on every commit the app has ever made.
    const sets: WorkoutSet[] = input.sets.map((s) =>
      toWorkoutSet(s, s.exerciseId ?? idByName.get(s.exerciseName) ?? ''))
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
      nextSessionFlag: input.nextSessionFlag,
      sessionRpe: input.sessionRpe,
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
  // This used to read `listUsers()[0]` — it did not even look at the caller's
  // JWT, so any request that got past the Origin check was served the first
  // user's last 20 sessions.
  const supabase = getServerSupabaseClient()
  const userId = await requireUserId(req, supabase)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
