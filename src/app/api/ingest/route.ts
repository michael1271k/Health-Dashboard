/**
 * POST /api/ingest
 *
 * The single ingestion channel: accepts a flat JSON health payload from the
 * native iOS app (HealthKit bridge) or any push source, and maps it to today's
 * daily_logs row (plus fan-out to the normalized tables used by scoring /
 * dashboard / charts). Auth: a Supabase JWT (Bearer) or a push secret.
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
import { defaultUserId, resolveCallerUserId } from '@/lib/auth/identity'

const WEBHOOK_SECRET = process.env.INGEST_WEBHOOK_SECRET

/**
 * Unified ingest identity. Three producers, one channel:
 *   1. The native iOS app — a signed-in Supabase JWT (Authorization: Bearer)
 *      resolves directly to that user (the primary path going forward).
 *   2. A per-user push key (ingest_keys) for automations.
 *   3. The legacy env secret → household admin (kept for a clean migration).
 */
async function resolveIngestUser(request: Request, db: ReturnType<typeof getServerSupabaseClient>): Promise<string | null> {
  // JWT first — the app carries the user's session.
  const byJwt = await resolveCallerUserId(request, db)
  if (byJwt) return byJwt

  const provided = request.headers.get('X-Webhook-Secret')

  // Per-user key lookup (table may not be migrated yet — degrade gracefully).
  if (provided) {
    try {
      const { data, error } = await db.from('ingest_keys').select('user_id').eq('secret', provided).maybeSingle()
      if (!error && data) return (data as { user_id: string }).user_id
    } catch { /* not migrated — fall through to the env secret */ }
  }

  // Legacy env secret → household admin.
  if (!WEBHOOK_SECRET) {
    console.warn('[ingest] INGEST_WEBHOOK_SECRET not set — running without auth check')
    return await defaultUserId(db)
  }
  if (provided === WEBHOOK_SECRET) return await defaultUserId(db)
  return null
}

export async function POST(request: Request) {
  const db = getServerSupabaseClient()
  const userId = await resolveIngestUser(request, db)
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
