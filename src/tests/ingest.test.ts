/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the Supabase client are intentionally loose. */
import { describe, it, expect } from 'vitest'
import { ingestDailyLog } from '@/lib/ingest/dailyLog'
import { IngestPayloadSchema } from '@/lib/ingest/schema'
import { nightWindow } from '@/lib/sleep/nightWindow'

/**
 * Ingest contract: partial pushes are bulletproof (missing keys never fail),
 * the response is a detailed inserted/omitted/errors report, DB errors are
 * reported (never thrown/500), and sleep is an unconditional overwrite.
 */

// Minimal chainable stub for the fan-out tables we don't assert on.
function noopChain(): any {
  const chain: any = {
    eq: () => chain, gte: () => chain, lt: () => chain, limit: () => Promise.resolve({ data: [] }),
    select: () => chain, delete: () => chain, maybeSingle: () => Promise.resolve({ data: null }),
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

describe('ingest — native key → column mapping', () => {
  it('training_minutes feeds exercise_minutes AND legacy training_minutes', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })
    await ingestDailyLog(db, 'user-1', { date: '2026-07-10', training_minutes: 70 } as any)
    expect(rows[0].training_minutes).toBe(70)
    expect(rows[0].exercise_minutes).toBe(70)
  })

  it('standing_minutes converts adaptively: minutes ÷60 when > 24, ring-hours pass through', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })
    await ingestDailyLog(db, 'user-1', { date: '2026-07-10', standing_minutes: 278 } as any)
    expect(rows[0].standing_minutes).toBe(278)   // legacy column keeps the raw value
    expect(rows[0].stand_hours).toBe(5)          // 278 min ≈ 5 h
    await ingestDailyLog(db, 'user-1', { date: '2026-07-10', standing_minutes: 11 } as any)
    expect(rows[1].stand_hours).toBe(11)         // ≤ 24 → already an hours count
  })

  it('reports mapped keys with destination notation and cleans satisfied targets from omitted', async () => {
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-10', training_minutes: 70, standing_minutes: 278 } as any)
    expect(result.inserted).toContain('training_minutes → exercise_minutes')
    expect(result.inserted).toContain('standing_minutes → stand_hours')
    expect(result.omitted).not.toContain('exercise_minutes')
    expect(result.omitted).not.toContain('stand_hours')
  })

  it('explicit exercise_minutes / stand_hours keys win over derived values', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })
    await ingestDailyLog(db, 'user-1', { date: '2026-07-10', training_minutes: 70, exercise_minutes: 45, standing_minutes: 11, stand_hours: 9 } as any)
    expect(rows[0].exercise_minutes).toBe(45)
    expect(rows[0].stand_hours).toBe(9)
  })
})

describe('ingest — recovery keys: wrist_temp / time_in_daylight', () => {
  it('accepts all three and stores them in their daily_logs columns', async () => {
    const rows: any[] = []
    const db = mockDb((row) => { rows.push(row); return { error: null } })
    const result = await ingestDailyLog(db, 'user-1', {
      date: '2026-07-17', wrist_temp: 36.2, time_in_daylight: 45,
    } as any)

    expect(rows[0].wrist_temp_delta).toBe(36.2)         // column stores the night's avg °C as sent
    expect(rows[0].time_in_daylight_min).toBe(45)
    expect(result.inserted).toEqual(expect.arrayContaining(['wrist_temp', 'time_in_daylight']))
    expect(result.errors).toHaveLength(0)
  })

  it('silently drops unknown keys alongside the new ones (strict-accept, graceful-ignore)', async () => {
    const parsed = IngestPayloadSchema.parse({ wrist_temp: 36.1, some_future_metric: 999 })
    expect(parsed.wrist_temp).toBe(36.1)
    expect('some_future_metric' in parsed).toBe(false)
    const db = mockDb(() => ({ error: null }))
    const result = await ingestDailyLog(db, 'user-1', parsed as any)
    expect(result.errors).toHaveLength(0)
  })
})

describe('ingest — nutrition uses explicit dietary energy, never derived', () => {
  // db that captures nutrition_entries inserts; other tables are no-ops.
  //
  // `daily_logs` and `user_goals` are readable here because the phase is no
  // longer a pure function of calories: a declared day keeps the active phase.
  function nutritionDb(
    context: {
      exception?: string | null
      estimated?: boolean | null
      goalPreset?: string | null
    } = {},
  ): { db: any; getRow: () => any; inserted: () => boolean } {
    let row: any = null
    let didInsert = false
    const db: any = {
      from(table: string) {
        if (table === 'daily_logs') {
          const chain: any = {
            upsert: () => Promise.resolve({ error: null }),
            select: () => chain, eq: () => chain,
            maybeSingle: () => Promise.resolve({
              data: {
                nutrition_exception: context.exception ?? null,
                nutrition_estimated: context.estimated ?? false,
              },
            }),
          }
          return chain
        }
        if (table === 'user_goals') {
          const chain: any = {
            select: () => chain, eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: { goal_preset: context.goalPreset ?? null } }),
          }
          return chain
        }
        if (table === 'nutrition_entries') {
          const chain: any = {
            eq: () => chain, delete: () => chain,
            // manual-override guard: no existing daily row → proceed
            select: () => chain, maybeSingle: () => Promise.resolve({ data: null }),
            insert: (r: any) => { row = r; didInsert = true; return Promise.resolve({ error: null }) },
            upsert: (r: any) => { row = r; didInsert = true; return Promise.resolve({ error: null }) },
          }
          return chain
        }
        return noopChain()
      },
    }
    return { db, getRow: () => row, inserted: () => didInsert }
  }

  it('writes the explicit calories value (no 4/4/9 math) alongside macros', async () => {
    const { db, getRow } = nutritionDb()
    await ingestDailyLog(db, 'user-1', { date: '2026-07-19', calories: 1934, protein: 170, carbs: 187, fats: 52 } as any)
    const row = getRow()
    expect(row.calories).toBe(1934)                     // exactly as sent
    expect(4 * 187 + 4 * 170 + 9 * 52).not.toBe(1934)   // proves it is NOT the derived estimate
    expect(row.protein_g).toBe(170)
    expect(row.carbs_g).toBe(187)
  })

  it('does NOT write a nutrition row (or fabricate calories) for a macro-only payload', async () => {
    const { db, inserted } = nutritionDb()
    const result = await ingestDailyLog(db, 'user-1', { date: '2026-07-19', protein: 170, carbs: 187, fats: 52 } as any)
    expect(inserted()).toBe(false)                      // no calorie invention
    expect(result.errors.some((e) => e.field === 'nutrition_entries')).toBe(false)
  })

  it('bands an ORDINARY day off its calories', async () => {
    const { db, getRow } = nutritionDb({ goalPreset: 'cut' })
    await ingestDailyLog(db, 'user-1', { date: '2026-08-12', calories: 2150 } as any)
    expect(getRow().phase).toBe('maintenance')          // 2050 < 2150 < 2450
  })

  it('keeps a DECLARED day in the active phase — the 2026-08-11 date night', async () => {
    // 2,150 kcal, flagged Social + Estimated, week four of a strict cut. The
    // threshold said 'maintenance' and the history page filed a cut day under a
    // phase that has not started. The phase belongs to the block, not the meal.
    const { db, getRow } = nutritionDb({ exception: 'Social', estimated: true, goalPreset: 'cut' })
    await ingestDailyLog(db, 'user-1', { date: '2026-08-11', calories: 2150 } as any)
    expect(getRow().phase).toBe('cut')
  })

  it('an ESTIMATED-only day is held too — a guess is not evidence of a new phase', async () => {
    const { db, getRow } = nutritionDb({ estimated: true, goalPreset: 'cut' })
    await ingestDailyLog(db, 'user-1', { date: '2026-08-11', calories: 2150 } as any)
    expect(getRow().phase).toBe('cut')
  })

  it('falls back to the calorie band when the active phase is unknown', async () => {
    const { db, getRow } = nutritionDb({ exception: 'Social', goalPreset: null })
    await ingestDailyLog(db, 'user-1', { date: '2026-08-11', calories: 2150 } as any)
    expect(getRow().phase).toBe('maintenance')
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

  it('writes real stage minutes + bed times when the native payload provides them', async () => {
    let sleepRow: any = null
    const db: any = {
      from(table: string) {
        if (table === 'daily_logs') return { upsert: () => Promise.resolve({ error: null }) }
        if (table === 'sleep_sessions') {
          const chain: any = {
            eq: () => chain, gte: () => chain, lt: () => chain, delete: () => chain,
            insert: (row: any) => { sleepRow = row; return Promise.resolve({ error: null }) },
          }
          return chain
        }
        return noopChain()
      },
    }
    await ingestDailyLog(db, 'user-1', {
      date: '2026-07-19', sleep_minutes: 462, deep_min: 68, rem_min: 96, core_min: 298, awake_min: 12,
      bed_start: '2026-07-18T23:10:00.000Z', bed_end: '2026-07-19T06:52:00.000Z',
    } as any)

    expect(sleepRow.deep_min).toBe(68)
    expect(sleepRow.rem_min).toBe(96)
    expect(sleepRow.core_min).toBe(298)
    expect(sleepRow.awake_min).toBe(12)
    expect(sleepRow.start_time).toBe('2026-07-18T23:10:00.000Z')
    expect(sleepRow.end_time).toBe('2026-07-19T06:52:00.000Z')
  })

  it('falls back to all-core + synthetic bedtime for a stage-less payload', async () => {
    let sleepRow: any = null
    const db: any = {
      from(table: string) {
        if (table === 'daily_logs') return { upsert: () => Promise.resolve({ error: null }) }
        if (table === 'sleep_sessions') {
          const chain: any = {
            eq: () => chain, gte: () => chain, lt: () => chain, delete: () => chain,
            insert: (row: any) => { sleepRow = row; return Promise.resolve({ error: null }) },
          }
          return chain
        }
        return noopChain()
      },
    }
    await ingestDailyLog(db, 'user-1', { date: '2026-07-19', sleep_minutes: 462 } as any)

    expect(sleepRow.core_min).toBe(462)
    expect(sleepRow.deep_min).toBe(0)
    expect(sleepRow.rem_min).toBe(0)
    // The synthetic bedtime is the PREVIOUS evening and must land inside the
    // night window every reader queries. It used to be `${date}T23:00:00Z` —
    // an hour PAST the window's end — so the row was written but invisible to
    // compute-score and useTodaySleep, reading as "Awaiting Sleep Data".
    expect(sleepRow.start_time).toBe('2026-07-18T23:00:00Z')
    const w = nightWindow('2026-07-19')
    expect(sleepRow.start_time >= w.from && sleepRow.start_time < w.to).toBe(true)
  })
})

describe('ingest — manual macro override is never clobbered by a HealthKit sync', () => {
  // A day the user hand-corrected (double-tap → nutrition_entries.hk_uuid='manual')
  // must survive the continuous sync AND the one-time yesterday catch-up, both of
  // which flow through this same ingest path (only the `date` differs).
  function mockDbWithManualNutrition(existingHkUuid: string | null, onUpsert: () => void) {
    return {
      from(table: string) {
        if (table === 'nutrition_entries') {
          const chain: any = {
            select: () => chain, eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: { hk_uuid: existingHkUuid } }),
            upsert: () => { onUpsert(); return Promise.resolve({ error: null }) },
          }
          return chain
        }
        return noopChain()
      },
    } as any
  }

  it('skips the macro upsert and reports "ignored" when the day is manual', async () => {
    let upserts = 0
    const db = mockDbWithManualNutrition('manual', () => { upserts += 1 })
    const result = await ingestDailyLog(db, 'user-1', {
      date: '2026-07-20', calories: 2100, protein: 150, carbs: 220, fats: 60,
    } as any)
    expect(upserts).toBe(0)                                  // the hand-entered macros are untouched
    expect(result.results.nutrition?.action).toBe('ignored')
    expect(result.results.nutrition?.ok).toBe(true)
  })

  it('DOES write macros when the day is not manual (hk_uuid null)', async () => {
    let upserts = 0
    const db = mockDbWithManualNutrition(null, () => { upserts += 1 })
    const result = await ingestDailyLog(db, 'user-1', {
      date: '2026-07-20', calories: 2100, protein: 150, carbs: 220, fats: 60,
    } as any)
    expect(upserts).toBe(1)
    expect(result.results.nutrition?.action).toBe('inserted')
  })
})
