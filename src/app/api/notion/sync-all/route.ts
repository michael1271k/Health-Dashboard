/**
 * POST /api/notion/sync-all
 *
 * Batch-exports every logged day NOT yet in Notion. "Unexported" is a real diff:
 * daily_logs dates minus notion_exports dates. Sequential + capped per call so
 * we stay under Notion's rate limits; returns { exported, skipped, failed,
 * remaining } and can be tapped again to continue. Idempotent + resumable.
 *
 * GET returns the pending count for the Settings button.
 */

import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { requireUserId } from '@/lib/auth/identity'
import { buildDaySummaryLines, createNotionDayPage } from '@/lib/notion/export'

const BATCH_CAP = 20 // pages per call — a second tap continues

/**
 * Per-user Notion credentials (multi-tenant): each user saves their own
 * integration secret + database id in Settings → notion_credentials (RLS-scoped).
 * Falls back to the legacy single-tenant env token so an existing deploy keeps
 * working until creds are saved.
 */
async function resolveCreds(
  db: ReturnType<typeof getServerSupabaseClient>,
  userId: string,
): Promise<{ token?: string; dbId?: string }> {
  try {
    const { data } = await db.from('notion_credentials').select('token, db_id').eq('user_id', userId).maybeSingle()
    const c = data as { token?: string; db_id?: string } | null
    if (c?.token && c?.db_id) return { token: c.token, dbId: c.db_id }
  } catch { /* notion_credentials not migrated yet — fall through to env */ }
  return { token: process.env.NOTION_TOKEN, dbId: process.env.NOTION_DAILY_LOG_DB_ID }
}

/** Dates with logged data minus dates already exported. */
/**
 * Dates to push. Normally only days NOT yet in Notion; with `force` it returns
 * EVERY logged day so the sync becomes a full UPSERT of all days + metrics
 * (re-pushing a day replaces its page content).
 */
async function pendingDates(
  db: ReturnType<typeof getServerSupabaseClient>,
  userId: string,
  force = false,
): Promise<string[]> {
  const [logsRes, exportedRes] = await Promise.all([
    db.from('daily_logs').select('date').eq('user_id', userId).order('date', { ascending: true }),
    force ? Promise.resolve({ data: [] }) : db.from('notion_exports').select('date').eq('user_id', userId),
  ])
  const logged = ((logsRes.data ?? []) as Array<{ date: string }>).map((r) => r.date)
  if (force) return logged
  const exported = new Set(((exportedRes.data ?? []) as Array<{ date: string }>).map((r) => r.date))
  return logged.filter((d) => !exported.has(d))
}

export async function GET(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied
  const db = getServerSupabaseClient()
  const userId = await requireUserId(req, db)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { token, dbId } = await resolveCreds(db, userId)
  if (!token || !dbId) return NextResponse.json({ configured: false, pending: 0 })
  try {
    const pending = await pendingDates(db, userId)
    return NextResponse.json({ configured: true, pending: pending.length })
  } catch {
    // notion_exports not migrated yet.
    return NextResponse.json({ configured: true, pending: null, needsMigration: true })
  }
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const db = getServerSupabaseClient()
  const userId = await requireUserId(req, db)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, dbId } = await resolveCreds(db, userId)
  if (!token || !dbId) {
    return NextResponse.json(
      { error: 'Notion is not connected — add your integration secret + database ID in Settings.' },
      { status: 501 },
    )
  }

  // `force` → re-push every logged day (full upsert), not just the new ones.
  const body = await req.json().catch(() => ({})) as { force?: boolean }
  let pending: string[]
  try {
    pending = await pendingDates(db, userId, !!body.force)
  } catch {
    return NextResponse.json({ error: 'The notion_exports table is missing — run the paste-SQL first.' }, { status: 501 })
  }

  const batch = pending.slice(0, BATCH_CAP)
  let exported = 0, skipped = 0
  const failed: Array<{ date: string; error: string }> = []

  for (const date of batch) {
    try {
      const lines = await buildDaySummaryLines(db, userId, date)
      if (!lines) { skipped++; continue }
      const { url } = await createNotionDayPage(token, dbId, date, lines)
      await db.from('notion_exports').upsert(
        { user_id: userId, date, exported_at: new Date().toISOString(), page_url: url } as never,
        { onConflict: 'user_id,date' },
      )
      exported++
    } catch (e) {
      failed.push({ date, error: e instanceof Error ? e.message : 'unknown' })
    }
    await new Promise((r) => setTimeout(r, 120)) // gentle on Notion's rate limit
  }

  return NextResponse.json({
    ok: true,
    exported, skipped, failed,
    remaining: Math.max(0, pending.length - batch.length),
  })
}
