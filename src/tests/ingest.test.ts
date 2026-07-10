/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the Supabase client are intentionally loose. */
import { describe, it, expect } from 'vitest'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'

/**
 * Ingest contract: partial pushes are bulletproof (missing keys never fail),
 * the response is a detailed inserted/omitted/errors report, DB errors are
 * reported (never thrown/500), and sleep is an unconditional overwrite.
 */

// Minimal chainable stub for the fan-out tables we don't assert on.
function noopChain(): any {
  const chain: any = {
    eq: () => chain, gte: () => chain, lt: () => chain, limit: () => Promise.resolve({ data: [] }),
    select: () => chain, delete: () => chain,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
  }
  return chain
}

/** db whose daily_logs.upsert is scripted; all other tables succeed as no-ops. */
function mockDb(
  dailyLogsUpsert: (row: any) => { error: { message: string } | null },
  onTable?: (table: string) => void,
) {
  return {
    from(table: string) {
      onTable?.(table)
      if (table === 'daily_logs') return { upsert: (row: any) => Promise.resolve(dailyLogsUpsert(row)) }
      return noopChain()
    },
  } as any
}

describe('ingest — missing v5.1 columns self-heal', () => {
  it('strips the v5.1 keys, retries, and reports them under errors (not inserted)', async () => {
    const rows: any[] = []
    const db = mockDb((row) => {
      rows.push(row)
      return rows.length === 1
        ? { error: { message: 'Could not find the \'hrv_ms\' column of \'daily_logs\' in the schema cache' } }
        : { error: null }
    })

    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', hrv: 65 } as any)

    expect(rows).toHaveLength(2)                        // failed, then retried
    expect('hrv_ms' in rows[0]).toBe(true)
    expect('hrv_ms' in rows[1]).toBe(false)             // retry stripped it
    expect(result.results.daily_log.ok).toBe(true)      // core push still landed
    expect(result.inserted).not.toContain('hrv')
    expect(result.errors.some((e) => e.field === 'hrv')).toBe(true)
    expect(result.warnings.some((w) => /migrated/i.test(w))).toBe(true)
  })

  it('writes hrv_ms directly and marks it inserted once the column exists', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', hrv: 65 } as any)

    expect(rows).toHaveLength(1)
    expect(rows[0].hrv_ms).toBe(65)
    expect(result.inserted).toContain('hrv')
    expect(result.errors).toHaveLength(0)
  })
})

describe('ingest — detailed inserted / omitted / errors response', () => {
  it('lists present keys as inserted and absent keys as omitted', async () => {
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', steps: 8000, protein: 180 } as any)

    expect(result.inserted).toEqual(expect.arrayContaining(['steps', 'protein']))
    expect(result.omitted).toEqual(expect.arrayContaining(['water', 'weight', 'sleep_minutes', 'vo2max']))
    expect(result.inserted).not.toContain('water')
    expect(result.errors).toHaveLength(0)
  })

  it('reports a genuine DB failure in errors and does NOT throw', async () => {
    const db = mockDb(() => ({ error: { message: 'duplicate key value violates unique constraint' } }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', steps: 8000 } as any)

    expect(result.errors.some((e) => e.field === 'daily_logs')).toBe(true)
    expect(result.inserted).toHaveLength(0)
    expect(result.results.daily_log.ok).toBe(false)
  })

  it('never treats a null/omitted weight as sub-50 (no false ignore)', async () => {
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', steps: 8000 } as any)
    expect(result.errors.some((e) => e.field === 'weight')).toBe(false)
    expect(result.inserted).toContain('steps')
  })

  it('reports a sub-50 weight as an error, not stored', async () => {
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', weight: 0 } as any)
    expect(result.inserted).not.toContain('weight')
    expect(result.errors.some((e) => e.field === 'weight' && /validity/i.test(e.error))).toBe(true)
  })
})

describe('ingest — sleep is an unconditional overwrite', () => {
  it('deletes the night and re-inserts (upserted), never conflict-skips', async () => {
    const ops: string[] = []
    const db = mockDb(() => ({ error: null }), (t) => { if (t === 'sleep_sessions') ops.push(t) })
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', sleep_minutes: 420 } as any)

    expect(result.results.sleep.ok).toBe(true)
    expect(result.results.sleep.action).toBe('upserted')  // not 'skipped'
    expect(result.inserted).toContain('sleep_minutes')
  })
})
