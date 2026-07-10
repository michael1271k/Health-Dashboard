/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase v2 hand-authored Insert types resolve to `never`; payloads are cast at write sites. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { derivePhase } from '@/lib/nutrition/phase'
import { logicalTodayISO } from '@/lib/utils/day'
import { MIN_VALID_WEIGHT_KG } from '@/lib/utils/units'
import type { ShortcutPayload } from './schema'

type DB = SupabaseClient<Database>

/** Today's LOGICAL date (YYYY-MM-DD, 04:00 cutoff) — device/server local. */
export function todayIsrael(): string {
  return logicalTodayISO()
}

export interface SectionResult {
  ok: boolean
  action: 'upserted' | 'inserted' | 'skipped' | 'ignored'
  error?: string
}

/**
 * Detailed Shortcut response (Phase 15) — the iOS Shortcut can now show exactly
 * what landed, what was skipped (no data sent), what was ignored (validity
 * rules), and precise error messages per table.
 */
export interface IngestResult {
  date: string
  received: string[]
  results: {
    daily_log: SectionResult
    metrics: SectionResult
    nutrition: SectionResult
    body: SectionResult
    water: SectionResult
    sleep: SectionResult
  }
  warnings: string[]
}

const skipped = (): SectionResult => ({ ok: true, action: 'skipped' })

/** v5.1 metric columns that may not exist yet if the Phase-15 migration wasn't run. */
const V51_METRIC_KEYS = ['hrv_ms', 'exercise_minutes', 'stand_hours', 'vo2max'] as const

/** A Postgres/PostgREST "column does not exist / schema cache" error. */
function isMissingColumnError(msg: string): boolean {
  return /column|schema cache|PGRST204|42703|could not find/i.test(msg)
}

/**
 * Upsert daily_logs, self-healing when the DB hasn't been migrated for the v5.1
 * metric columns yet: if the first attempt fails on a missing column, strip the
 * v5.1 keys and retry so the core push (steps, macros, weight, sleep…) STILL
 * lands. A push must never be lost just because an optional new column is absent.
 */
async function upsertDailyLog(db: DB, row: Record<string, any>): Promise<{ error: { message: string } | null; strippedV51: boolean }> {
  const first = await db.from('daily_logs').upsert(row as any, { onConflict: 'user_id,date' })
  const hasV51 = V51_METRIC_KEYS.some((k) => k in row)
  if (first.error && hasV51 && isMissingColumnError(first.error.message)) {
    const stripped = { ...row }
    for (const k of V51_METRIC_KEYS) delete stripped[k]
    const retry = await db.from('daily_logs').upsert(stripped as any, { onConflict: 'user_id,date' })
    return { error: retry.error, strippedV51: true }
  }
  return { error: first.error, strippedV51: false }
}

/**
 * Upsert the flat Shortcut payload into daily_logs (merge — only provided keys,
 * preserving AI-completed advanced fields), then fan out to the normalized
 * tables that power scoring, the dashboard, and charts.
 */
export async function ingestDailyLog(
  db: DB, userId: string, payload: ShortcutPayload,
): Promise<IngestResult> {
  const date = payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) ? payload.date : todayIsrael()
  const warnings: string[] = []

  // Global weight-validity rule: sub-50 kg readings are scale/sync artifacts.
  let weight = payload.weight
  if (weight !== undefined && weight < MIN_VALID_WEIGHT_KG) {
    warnings.push(`weight ${weight}kg ignored (< ${MIN_VALID_WEIGHT_KG}kg validity minimum)`)
    weight = undefined
  }

  // ── 1. daily_logs (canonical flat row) ──
  const row: Record<string, any> = { user_id: userId, date }
  const set = (k: string, v: number | undefined) => { if (v !== undefined) row[k] = v }
  set('steps', payload.steps)
  set('water_ml', payload.water)
  set('sleep_minutes', payload.sleep_minutes)
  set('carbs_g', payload.carbs)
  set('protein_g', payload.protein)
  set('fats_g', payload.fats)
  set('weight_kg', weight)
  set('lean_mass_kg', payload.lean_mass)
  set('bmi', payload.bmi)
  set('training_minutes', payload.training_minutes)
  set('active_energy', payload.active_energy)
  set('body_fat_pct', payload.body_fat)
  set('standing_minutes', payload.standing_minutes)
  set('avg_heart_rate', payload.avg_heart_rate)
  set('avg_rest_heart_rate', payload.avg_rest_heart_rate)
  set('respiratory_rate', payload.respiratory_rate)
  set('blood_oxygen', payload.blood_oxygen)
  // v5.1+ metrics (Phase 15)
  set('hrv_ms', payload.hrv)
  set('exercise_minutes', payload.exercise_minutes)
  set('stand_hours', payload.stand_hours)
  set('vo2max', payload.vo2max)

  const received = Object.keys(row).filter((k) => k !== 'user_id' && k !== 'date')

  const result: IngestResult = {
    date, received,
    results: {
      daily_log: skipped(), metrics: skipped(), nutrition: skipped(),
      body: skipped(), water: skipped(), sleep: skipped(),
    },
    warnings,
  }

  const { error: dlErr, strippedV51 } = await upsertDailyLog(db, row)
  if (strippedV51) {
    warnings.push('advanced metrics (HRV / VO₂max / exercise / stand) skipped — those daily_logs columns are not migrated yet; run the Phase-15 SQL to enable them')
  }
  result.results.daily_log = dlErr
    ? { ok: false, action: 'upserted', error: dlErr.message }
    : { ok: true, action: 'upserted' }
  if (dlErr) throw Object.assign(new Error(`daily_logs upsert failed: ${dlErr.message}`), { result })

  // ── 2. Fan-out: daily_metrics (steps, active cal, resting HR) ──
  const restHr = payload.avg_rest_heart_rate ?? payload.avg_heart_rate
  if (payload.steps !== undefined || payload.active_energy !== undefined || restHr !== undefined) {
    const m: Record<string, any> = { user_id: userId, date }
    if (payload.steps !== undefined) m.steps = Math.round(payload.steps)
    if (payload.active_energy !== undefined) m.active_cal = Math.round(payload.active_energy)
    if (restHr !== undefined) m.rest_hr = Math.round(restHr)
    const { error } = await db.from('daily_metrics').upsert(m as any, { onConflict: 'user_id,date', ignoreDuplicates: false })
    result.results.metrics = error ? { ok: false, action: 'upserted', error: error.message } : { ok: true, action: 'upserted' }
  }

  // ── 3. Fan-out: nutrition_entries (compute calories from macros) ──
  if (payload.carbs !== undefined || payload.protein !== undefined || payload.fats !== undefined) {
    const carbs = payload.carbs ?? 0, protein = payload.protein ?? 0, fats = payload.fats ?? 0
    const calories = Math.round(4 * carbs + 4 * protein + 9 * fats)
    await db.from('nutrition_entries').delete().eq('user_id', userId).eq('date', date).eq('meal_type', 'daily')
    const { error } = await db.from('nutrition_entries').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, meal_type: 'daily',
      calories, protein_g: protein, carbs_g: carbs, fat_g: fats, fiber_g: null,
      phase: derivePhase(calories),
    } as any)
    result.results.nutrition = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
  }

  // ── 4. Fan-out: body_composition (only with a VALID weight) ──
  if (weight !== undefined || payload.lean_mass !== undefined || payload.body_fat !== undefined) {
    if (weight === undefined) {
      result.results.body = { ok: true, action: 'ignored', error: 'no valid weight — body_composition row requires ≥50kg' }
    } else {
      await db.from('body_composition').delete().eq('user_id', userId).eq('date', date)
      const { error } = await db.from('body_composition').insert({
        user_id: userId, hk_uuid: null, measured_at: `${date}T00:00:00Z`, date,
        weight_kg: weight, body_fat_pct: payload.body_fat ?? null,
        muscle_mass_kg: payload.lean_mass ?? null, water_pct: null,
        bone_mass_kg: null, bmi: payload.bmi ?? null,
      } as any)
      result.results.body = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
    }
  }

  // ── 5. Fan-out: water_intake ──
  if (payload.water !== undefined) {
    await db.from('water_intake').delete().eq('user_id', userId).eq('date', date)
    const { error } = await db.from('water_intake').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, amount_ml: payload.water,
    } as any)
    result.results.water = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
  }

  // ── 6. Fan-out: sleep_sessions (synthesize if none exists for the night) ──
  if (payload.sleep_minutes !== undefined && payload.sleep_minutes > 0) {
    const { data: existing } = await db.from('sleep_sessions').select('id')
      .eq('user_id', userId).gte('start_time', `${date}T00:00:00Z`).lt('start_time', `${date}T23:59:59Z`).limit(1)
    if (((existing ?? []) as unknown[]).length) {
      result.results.sleep = { ok: true, action: 'skipped', error: 'a sleep session already exists for this night' }
    } else {
      const dur = Math.round(payload.sleep_minutes)
      const { error } = await db.from('sleep_sessions').insert({
        user_id: userId, hk_uuid: null,
        start_time: `${date}T23:00:00Z`, end_time: `${date}T23:00:00Z`,
        duration_min: dur, deep_min: 0, rem_min: 0, core_min: dur, awake_min: 0, sleep_score: null,
      } as any)
      result.results.sleep = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
    }
  }

  return result
}
