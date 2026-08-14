/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the Supabase client are intentionally loose. */
import { describe, it, expect } from 'vitest'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'
import { manualWaterHkUuid, isManualWaterHkUuid } from '@/lib/nutrition/manualWater'
import { manualHkUuid } from '@/lib/nutrition/manualEntry'

/**
 * Hydration is the one metric stored in TWO places that have to agree:
 * `daily_logs.water_ml` is rendered, `water_intake` is summed by the scorer. The
 * override writes both; HealthKit has to decline both. Guarding one and not the
 * other is the failure this file exists to catch, because it is invisible — the
 * litres on screen and the litres being graded simply stop being the same number.
 */

/**
 * A db whose `water_intake` rows are scripted, and which records every write so
 * the test can assert what the ingest DID rather than only what it reported.
 */
function waterDb(existing: Array<{ hk_uuid: string | null }> = []) {
  const logRows: any[] = []
  const inserted: any[] = []
  const deletes: Array<{ hkUuidNull: boolean }> = []

  const chain = (table: string): any => {
    const self: any = {
      // `select(...).eq(...).eq(...)` is awaited directly by hasManualWater — no
      // .maybeSingle() — so the chain itself has to be thenable.
      select: () => self,
      eq: () => self,
      is: (col: string) => { if (table === 'water_intake') deletes.push({ hkUuidNull: col === 'hk_uuid' }); return self },
      gte: () => self, lt: () => self,
      limit: () => Promise.resolve({ data: [] }),
      maybeSingle: () => Promise.resolve({ data: null }),
      delete: () => { if (table === 'water_intake') deletes.push({ hkUuidNull: false }); return self },
      insert: (row: any) => { if (table === 'water_intake') inserted.push(row); return Promise.resolve({ error: null }) },
      upsert: (row: any) => { if (table === 'daily_logs') logRows.push(row); return Promise.resolve({ error: null }) },
      then: (res: any) => Promise.resolve({ data: table === 'water_intake' ? existing : [], error: null }).then(res),
    }
    return self
  }

  return {
    db: { from: (table: string) => chain(table) } as any,
    logRows, inserted, deletes,
  }
}

describe('manual-water sentinel', () => {
  it('is per-day, because water_intake.hk_uuid is UNIQUE', () => {
    expect(manualWaterHkUuid('2026-08-14')).toBe('manual-water-2026-08-14')
    expect(manualWaterHkUuid('2026-08-14')).not.toBe(manualWaterHkUuid('2026-08-15'))
  })

  it('recognises its own values', () => {
    expect(isManualWaterHkUuid(manualWaterHkUuid('2026-08-14'))).toBe(true)
    expect(isManualWaterHkUuid(null)).toBe(false)
    expect(isManualWaterHkUuid(undefined)).toBe(false)
    expect(isManualWaterHkUuid('')).toBe(false)
  })

  it('is NOT satisfied by a macro sentinel', () => {
    // Two tables, two call sites. A predicate loose enough to match `manual-<date>`
    // would let a hand-entered macro day silently suppress that day's water sync.
    expect(isManualWaterHkUuid(manualHkUuid('2026-08-14'))).toBe(false)
    expect(isManualWaterHkUuid('manual')).toBe(false)
  })
})

describe('ingest declines a hand-corrected day — BOTH stores or neither', () => {
  it('skips water_ml AND the water_intake fan-out when an override is present', async () => {
    const { db, logRows, inserted } = waterDb([{ hk_uuid: manualWaterHkUuid('2026-08-14') }])

    const result = await ingestDailyLog(db, 'user-1', { date: '2026-08-14', water: 1200, steps: 8000 } as any)

    // The rendered column is untouched…
    expect('water_ml' in logRows[0]).toBe(false)
    // …and so is the ledger the scorer sums.
    expect(inserted).toHaveLength(0)
    expect(result.results.water).toEqual({
      ok: true, action: 'ignored', error: 'manual override present — HealthKit water skipped',
    })
    // Declining one metric must not fail the push.
    expect(result.results.daily_log.ok).toBe(true)
    expect(logRows[0].steps).toBe(8000)
  })

  it('writes both stores when the day carries only synced rows', async () => {
    const { db, logRows, inserted } = waterDb([{ hk_uuid: null }])

    const result = await ingestDailyLog(db, 'user-1', { date: '2026-08-14', water: 1200 } as any)

    expect(logRows[0].water_ml).toBe(1200)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].amount_ml).toBe(1200)
    expect(inserted[0].hk_uuid).toBeNull()
    expect(result.results.water.action).toBe('inserted')
  })

  it('writes both stores when the day has no water rows at all', async () => {
    const { db, logRows, inserted } = waterDb([])
    await ingestDailyLog(db, 'user-1', { date: '2026-08-14', water: 900 } as any)
    expect(logRows[0].water_ml).toBe(900)
    expect(inserted).toHaveLength(1)
  })

  it('scopes its overwrite to null-hk_uuid rows, so a race cannot eat the override', async () => {
    const { db, deletes } = waterDb([{ hk_uuid: null }])
    await ingestDailyLog(db, 'user-1', { date: '2026-08-14', water: 1200 } as any)
    expect(deletes.some((d) => d.hkUuidNull)).toBe(true)
  })

  it('does not probe at all when the payload carries no water', async () => {
    // A macro-only push must not pay a round trip for a metric it never sent.
    const { db, inserted, deletes } = waterDb([{ hk_uuid: manualWaterHkUuid('2026-08-14') }])
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-08-14', protein: 180 } as any)
    expect(inserted).toHaveLength(0)
    expect(deletes).toHaveLength(0)
    expect(result.results.water.action).toBe('skipped')
  })
})
