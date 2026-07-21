/**
 * POST /api/ingest
 *
 * The native iOS app's HealthKit sync channel: accepts a flat JSON health
 * payload from the app and maps it to today's daily_logs row (plus fan-out to
 * the normalized tables used by scoring / dashboard / charts).
 *
 * Auth: a Supabase JWT (Authorization: Bearer) — the app carries the signed-in
 * user's session. The legacy webhook-secret / iOS-Shortcut push path has been
 * removed (100% native now).
 *
 * Example body:
 *   { "steps": 8200, "water": 2500, "sleep_minutes": 430, "carbs": 180,
 *     "protein": 175, "fats": 55, "weight": 78.4, "lean_mass": 61.2,
 *     "bmi": 23.1, "training_minutes": 70, "active_energy": 520,
 *     "body_fat": 16.2, "standing_minutes": 11, "hrv": 62,
 *     "avg_heart_rate": 78, "avg_rest_heart_rate": 52, "blood_oxygen": 98 }
 */

import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { IngestPayloadSchema } from '@/lib/ingest/schema'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'
import { resolveCallerUserId } from '@/lib/auth/identity'

export async function POST(request: Request) {
  const db = getServerSupabaseClient()
  const userId = await resolveCallerUserId(request, db)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = IngestPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const result = await ingestDailyLog(db, userId, parsed.data)
    // Always 200 with the detailed report; `success` reflects per-metric errors.
    return NextResponse.json({ success: result.errors.length === 0, ...result })
  } catch (err) {
    // Only truly unexpected failures land here (never a normal DB/validity error).
    console.error('[ingest] failed:', err)
    return NextResponse.json({ error: 'Ingest failed', detail: String(err) }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'helix-ingest', schema: 'flat-v2' })
}
