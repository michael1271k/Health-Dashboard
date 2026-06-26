import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { HealthAutoExportPayloadSchema } from '@/lib/ingest/schema'
import {
  parseDailyMetrics,
  parseSleepSessions,
  parseNutrition,
  parseBodyComposition,
  parseWater,
} from '@/lib/ingest/parse'
import {
  upsertDailyMetrics,
  upsertSleepSessions,
  upsertNutrition,
  upsertBodyComposition,
  upsertWater,
} from '@/lib/ingest/upsert'

const WEBHOOK_SECRET = process.env.INGEST_WEBHOOK_SECRET

// Health Auto Export must be configured to send this header:
// X-Webhook-Secret: <same value as INGEST_WEBHOOK_SECRET>
function verifySecret(request: Request): boolean {
  if (!WEBHOOK_SECRET) {
    // In development without a secret set, allow through (log warning)
    console.warn('[ingest] INGEST_WEBHOOK_SECRET not set — running without auth check')
    return true
  }
  const provided = request.headers.get('X-Webhook-Secret')
  return provided === WEBHOOK_SECRET
}

export async function POST(request: Request) {
  // 1. Verify webhook secret
  if (!verifySecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse JSON body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 3. Validate with Zod
  const parsed = HealthAutoExportPayloadSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[ingest] Payload validation failed:', parsed.error.flatten())
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { metrics } = parsed.data.data

  // 4. Get user from Supabase — single-user app, get the first (only) user
  // The service role client bypasses RLS so we can look up the user
  const db = getServerSupabaseClient()
  const { data: users, error: userError } = await db.auth.admin.listUsers()
  if (userError || !users?.users?.length) {
    console.error('[ingest] No user found:', userError)
    return NextResponse.json({ error: 'No authenticated user found' }, { status: 500 })
  }
  const userId = users.users[0].id

  // 5. Parse all metric types
  const dailyMetrics = parseDailyMetrics(metrics)
  const sleepSessions = parseSleepSessions(metrics)
  const nutrition = parseNutrition(metrics)
  const bodyComp = parseBodyComposition(metrics)
  const water = parseWater(metrics)

  // 6. Upsert all in parallel (each handles its own dedup)
  const results = await Promise.allSettled([
    upsertDailyMetrics(db, userId, dailyMetrics),
    upsertSleepSessions(db, userId, sleepSessions),
    upsertNutrition(db, userId, nutrition),
    upsertBodyComposition(db, userId, bodyComp),
    upsertWater(db, userId, water),
  ])

  // 7. Report results
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason as Error).message)

  const counts = {
    dailyMetrics: dailyMetrics.length,
    sleepSessions: sleepSessions.length,
    nutrition: nutrition.length,
    bodyComp: bodyComp.length,
    water: water.length,
  }

  if (errors.length > 0) {
    console.error('[ingest] Partial failure:', errors)
    return NextResponse.json(
      { success: false, counts, errors },
      { status: 207 }, // 207 Multi-Status: partial success
    )
  }

  console.warn('[ingest] Ingested successfully:', counts)
  return NextResponse.json({ success: true, counts }, { status: 200 })
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'vital-ingest' })
}
