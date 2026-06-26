import { NextResponse } from 'next/server'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { getNotionClient } from '@/lib/notion/client'
import { formatSessionForNotion, formatSetsAsBlocks } from '@/lib/notion/gym-log'
import { epley1RM } from '@/lib/hooks/useCharts'
import type { InsertRow } from '@/lib/supabase/types'

export async function POST(req: Request) {
  // Auth: Supabase admin client — single-user app, get the sole user's ID
  const supabase = getServerSupabaseClient()

  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'No authenticated user' }, { status: 401 })
  }
  const userId = users[0].id

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
  const payload = parsed.data

  // Calculate total volume
  const totalVolumeKg = payload.sets.reduce(
    (sum, s) => sum + s.weightKg * s.reps,
    0,
  )

  // Get historical best est_1RM per exercise to detect PRs
  // Supabase v2: column-select returns never[] when Insert is Omit<...>; cast result explicitly
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

  // Insert session to Supabase
  // Supabase v2 TypeScript: Omit<...> Insert types resolve to never[] — cast via unknown as any
  const sessionInsert: InsertRow<'workout_sessions'> = {
    user_id: userId,
    notion_page_id: null,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    split_day: payload.splitDay,
    notes: payload.notes || null,
    total_volume_kg: totalVolumeKg,
    session_score: null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessionRaw, error: sessionError } = await supabase
    .from('workout_sessions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(sessionInsert as unknown as any)
    .select('id')
    .single()

  const session = sessionRaw as { id: string } | null

  if (sessionError || !session) {
    console.error('[sessions] session insert error:', sessionError)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }

  // Insert sets with PR detection
  const setsToInsert = payload.sets.map((s) => {
    const est1rm = epley1RM(s.weightKg, s.reps)
    const prevBest = bestPrMap.get(s.exerciseId) ?? 0
    const isPr = est1rm > prevBest
    const row: InsertRow<'workout_sets'> = {
      session_id: session.id,
      exercise_id: s.exerciseId,
      user_id: userId,
      set_number: s.setNumber,
      weight_kg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe ?? null,
      is_pr: isPr,
      est_1rm_kg: est1rm,
    }
    return { ...row, _meta: { exerciseName: s.exerciseName, exerciseId: s.exerciseId, setNumber: s.setNumber } }
  })

  const dbSets = setsToInsert.map(({ _meta: _, ...row }) => row)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: setsError } = await supabase.from('workout_sets').insert(dbSets as unknown as any)
  if (setsError) {
    console.error('[sessions] sets insert error:', setsError)
    // Don't fail — session is saved, sets partially failed
  }

  // Write to Notion (best-effort; don't fail the response if Notion is down)
  let notionPageId: string | null = null
  const gymDbId = process.env.NOTION_GYM_DB_ID
  if (gymDbId) {
    try {
      const notion = getNotionClient()
      const properties = formatSessionForNotion(payload, totalVolumeKg)
      const children = formatSetsAsBlocks(payload)

      const page = await notion.pages.create({
        parent: { database_id: gymDbId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: properties as unknown as Parameters<typeof notion.pages.create>[0]['properties'],
        children,
      })
      notionPageId = page.id

      // Backfill notion_page_id
      // Supabase v2: Update type on Omit<...> tables resolves to never — cast explicitly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase
        .from('workout_sessions')
        .update({ notion_page_id: notionPageId } as unknown as never)
        .eq('id', session.id)
    } catch (err) {
      console.error('[sessions] Notion write failed (non-fatal):', err)
    }
  }

  // Detect new PRs among this session's sets
  const newPRs = setsToInsert
    .filter((s) => s.is_pr)
    .map((s) => ({
      exerciseName: s._meta.exerciseName,
      est1rm: s.est_1rm_kg as number,
    }))

  return NextResponse.json({
    sessionId: session.id,
    notionPageId,
    totalVolumeKg,
    newPRs,
  })
}

export async function GET() {
  const supabase = getServerSupabaseClient()
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const userId = users?.[0]?.id
  if (!userId) return NextResponse.json({ sessions: [] })

  const { data } = await supabase
    .from('workout_sessions')
    .select('id, started_at, split_day, total_volume_kg, notes, notion_page_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20)

  const sessions = (data ?? []) as Array<{
    id: string
    started_at: string
    split_day: string
    total_volume_kg: number | null
    notes: string | null
    notion_page_id: string | null
  }>

  return NextResponse.json({ sessions })
}
