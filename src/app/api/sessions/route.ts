import { NextResponse } from 'next/server'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'
import { saveSession } from '@/lib/sessions/save'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'

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

  try {
    const result = await saveSession(supabase, userId, parsed.data)
    return NextResponse.json({
      sessionId: result.sessionId,
      totalVolumeKg: result.totalVolumeKg,
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
