import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type {
  DailyAggregate,
  ParsedSleepSession,
  ParsedNutrition,
  ParsedBodyComp,
  ParsedWater,
} from './parse'

type DB = SupabaseClient<Database>

// Supabase v2 TypeScript: when Database['public']['Tables'][T]['Insert'] is an Omit<...> type,
// the .upsert()/.insert() parameter resolves to never[]. Casting via (rows as unknown as T[])
// is the standard workaround while keeping type safety at the data construction level.

// All upserts use onConflict for idempotency:
// - hk_uuid where available (exact HealthKit sample match)
// - (user_id, date) for daily aggregates
// This ensures re-sending the same Health Auto Export payload is safe.

export async function upsertDailyMetrics(
  db: DB,
  userId: string,
  rows: DailyAggregate[],
): Promise<void> {
  if (rows.length === 0) return

  const data: InsertRow<'daily_metrics'>[] = rows.map((r) => ({
    user_id: userId,
    date: r.date,
    steps: r.steps ?? null,
    active_cal: r.activeCal ?? null,
    rest_hr: r.restHr ?? null,
  }))

  const { error } = await db
    .from('daily_metrics')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(data as unknown as any, { onConflict: 'user_id,date', ignoreDuplicates: false })

  if (error) throw new Error(`upsertDailyMetrics failed: ${error.message}`)
}

export async function upsertSleepSessions(
  db: DB,
  userId: string,
  sessions: ParsedSleepSession[],
): Promise<void> {
  if (sessions.length === 0) return

  for (const session of sessions) {
    const row: InsertRow<'sleep_sessions'> = {
      user_id: userId,
      hk_uuid: session.hkUuid ?? null,
      start_time: session.startTime,
      end_time: session.endTime,
      duration_min: session.durationMin,
      deep_min: session.deepMin,
      rem_min: session.remMin,
      core_min: session.coreMin,
      awake_min: session.awakeMin,
      sleep_score: null,
    }

    if (session.hkUuid) {
      // Exact dedup by HealthKit UUID
      const { error } = await db
        .from('sleep_sessions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(row as unknown as any, { onConflict: 'hk_uuid', ignoreDuplicates: true })
      if (error) throw new Error(`upsertSleepSessions (uuid) failed: ${error.message}`)
    } else {
      // Fallback: insert with ignore on duplicate
      const { error } = await db
        .from('sleep_sessions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(row as unknown as any)
      if (error && !error.message.includes('duplicate')) {
        throw new Error(`upsertSleepSessions (no uuid) failed: ${error.message}`)
      }
    }
  }
}

export async function upsertNutrition(
  db: DB,
  userId: string,
  rows: ParsedNutrition[],
): Promise<void> {
  if (rows.length === 0) return

  // We store daily aggregates (one per date)
  const data: InsertRow<'nutrition_entries'>[] = rows.map((r) => ({
    user_id: userId,
    hk_uuid: null,
    logged_at: `${r.date}T00:00:00Z`,
    date: r.date,
    meal_type: 'daily',
    calories: Math.round(r.calories * 100) / 100,
    protein_g: Math.round(r.proteinG * 100) / 100,
    carbs_g: Math.round(r.carbsG * 100) / 100,
    fat_g: Math.round(r.fatG * 100) / 100,
    fiber_g: r.fiberG !== undefined ? Math.round(r.fiberG * 100) / 100 : null,
  }))

  // No hk_uuid for nutrition aggregates — dedup by user_id+date
  // Since there's no UNIQUE(user_id,date) on nutrition_entries, use delete+insert pattern
  for (const row of data) {
    await db
      .from('nutrition_entries')
      .delete()
      .eq('user_id', userId)
      .eq('date', row.date)
      .eq('meal_type', 'daily')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await db.from('nutrition_entries').insert(row as unknown as any)
    if (error) throw new Error(`upsertNutrition failed: ${error.message}`)
  }
}

export async function upsertBodyComposition(
  db: DB,
  userId: string,
  rows: ParsedBodyComp[],
): Promise<void> {
  if (rows.length === 0) return

  const data: InsertRow<'body_composition'>[] = rows.map((r) => ({
    user_id: userId,
    hk_uuid: r.hkUuid ?? null,
    measured_at: r.measuredAt,
    date: r.date,
    weight_kg: r.weightKg,
    body_fat_pct: r.bodyFatPct ?? null,
    muscle_mass_kg: null,
    water_pct: null,
    bone_mass_kg: null,
    bmi: null,
  }))

  const { error } = await db
    .from('body_composition')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(data as unknown as any, { onConflict: 'hk_uuid', ignoreDuplicates: true })

  if (error) throw new Error(`upsertBodyComposition failed: ${error.message}`)
}

export async function upsertWater(
  db: DB,
  userId: string,
  rows: ParsedWater[],
): Promise<void> {
  if (rows.length === 0) return

  const data: InsertRow<'water_intake'>[] = rows.map((r) => ({
    user_id: userId,
    hk_uuid: r.hkUuid ?? null,
    logged_at: r.loggedAt,
    date: r.date,
    amount_ml: Math.round(r.amountMl * 10) / 10,
  }))

  const { error } = await db
    .from('water_intake')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(data as unknown as any, { onConflict: 'hk_uuid', ignoreDuplicates: true })

  if (error) throw new Error(`upsertWater failed: ${error.message}`)
}
