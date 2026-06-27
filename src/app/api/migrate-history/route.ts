/**
 * POST /api/migrate-history?dryRun=1
 *
 * One-time historical import of the Notion Daily Log + PPL Session Table into
 * Supabase. Protected (same-origin or webhook secret), idempotent, and supports
 * a dry run that returns counts without writing.
 */

import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { getNotionClient } from '@/lib/notion/client'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { runHistoricalImport } from '@/lib/notion/import'

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'

  const dailyDbId = process.env.NOTION_DAILY_LOG_DB_ID
  const gymDbId = process.env.NOTION_GYM_DB_ID
  if (!dailyDbId || !gymDbId) {
    return NextResponse.json(
      { error: 'NOTION_DAILY_LOG_DB_ID and NOTION_GYM_DB_ID must be configured' },
      { status: 500 },
    )
  }

  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'No user' }, { status: 401 })
  }
  const userId = users[0].id

  try {
    const notion = getNotionClient()
    const counts = await runHistoricalImport(supabase, userId, notion, dailyDbId, gymDbId, dryRun)
    return NextResponse.json({ ok: true, dryRun, counts })
  } catch (err) {
    console.error('[migrate-history] failed:', err)
    return NextResponse.json({ error: 'Migration failed', detail: String(err) }, { status: 500 })
  }
}
