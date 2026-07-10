/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the Supabase client are intentionally loose. */
import { describe, it, expect } from 'vitest'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'

/**
 * Phase 15 hotfix: a Shortcut push must NEVER be lost just because the optional
 * v5.1 metric columns (hrv_ms / exercise_minutes / stand_hours / vo2max) aren't
 * migrated into daily_logs yet. The upsert self-heals by stripping those keys
 * and retrying, so the core payload still lands.
 */

// Minimal chainable stub for the fan-out tables we don't exercise here.
function noopChain(): any {
  const chain: any = {
    eq: () => chain, gte: () => chain, lt: () => chain, limit: () => Promise.resolve({ data: [] }),
    select: () => chain, delete: () => chain,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
  }
  return chain
}

function mockDb(dailyLogsUpsert: (row: any) => { error: { message: string } | null }) {
  return {
    from(table: string) {
      if (table === 'daily_logs') return { upsert: (row: any) => Promise.resolve(dailyLogsUpsert(row)) }
      return noopChain()
    },
  } as any
}

describe('ingest resilience — missing v5.1 columns', () => {
  it('strips the v5.1 metric keys and retries when the column is missing', async () => {
    const rows: any[] = []
    const db = mockDb((row) => {
      rows.push(row)
      // First attempt (with hrv_ms) fails on a missing column; retry succeeds.
      return rows.length === 1
        ? { error: { message: 'Could not find the \'hrv_ms\' column of \'daily_logs\' in the schema cache' } }
        : { error: null }
    })

    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', hrv: 65 } as any)

    expect(rows).toHaveLength(2)                       // failed, then retried
    expect('hrv_ms' in rows[0]).toBe(true)             // first attempt carried it
    expect('hrv_ms' in rows[1]).toBe(false)            // retry stripped it
    expect(result.results.daily_log.ok).toBe(true)     // push still landed
    expect(result.warnings.some((w) => /migrated/i.test(w))).toBe(true)
  })

  it('does NOT retry and writes hrv_ms directly once the column exists', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })

    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', hrv: 65 } as any)

    expect(rows).toHaveLength(1)
    expect(rows[0].hrv_ms).toBe(65)
    expect(result.results.daily_log.ok).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('rethrows a genuine (non-column) daily_logs failure', async () => {
    const db = mockDb(() => ({ error: { message: 'duplicate key value violates unique constraint' } }))
    await expect(ingestDailyLog(db, 'user-1', { date: '2026-07-10', steps: 8000 } as any)).rejects.toThrow(/daily_logs upsert failed/)
  })

  it('never treats a null/omitted weight as sub-50 (no false ignore)', async () => {
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', steps: 8000 } as any)
    expect(result.warnings.some((w) => /validity minimum/i.test(w))).toBe(false)
    expect(result.results.daily_log.ok).toBe(true)
  })
})
