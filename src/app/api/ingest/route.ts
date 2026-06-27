/**
 * POST /api/ingest
 *
 * Accepts a FLAT JSON payload from the custom iOS Shortcut and maps it to today's
 * daily_logs row in Supabase (plus fan-out to the normalized tables used by
 * scoring / dashboard / charts). Authenticated via the X-Webhook-Secret header.
 *
 * Example body:
 *   { "steps": 8200, "water": 2500, "sleep_minutes": 430, "carbs": 180,
 *     "protein": 175, "fats": 55, "weight": 78.4, "lean_mass": 61.2,
 *     "bmi": 23.1, "training_minutes": 70, "active_energy": 520,
 *     "body_fat": 16.2, "move_minutes": 95, "standing_minutes": 11,
 *     "avg_heart_rate": 78, "blood_oxygen": 98 }
 */

import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ShortcutPayloadSchema } from '@/lib/ingest/schema'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'

const WEBHOOK_SECRET = process.env.INGEST_WEBHOOK_SECRET

// The Shortcut must send:  X-Webhook-Secret: <INGEST_WEBHOOK_SECRET>
function verifySecret(request: Request): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[ingest] INGEST_WEBHOOK_SECRET not set — running without auth check')
    return true
  }
  return request.headers.get('X-Webhook-Secret') === WEBHOOK_SECRET
}

export async function POST(request: Request) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ShortcutPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
  }

  const db = getServerSupabaseClient()
  const { data: users, error: userError } = await db.auth.admin.listUsers()
  if (userError || !users?.users?.length) {
    return NextResponse.json({ error: 'No authenticated user found' }, { status: 500 })
  }
  const userId = users.users[0].id

  try {
    const result = await ingestDailyLog(db, userId, parsed.data)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[ingest] failed:', err)
    return NextResponse.json({ error: 'Ingest failed', detail: String(err) }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'apex-ingest', schema: 'flat-shortcut-v1' })
}
