/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase v2 hand-authored Insert types resolve to `never`; payloads are cast at write sites. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { derivePhase } from '@/lib/nutrition/phase'
import { logicalTodayInTZ } from '@/lib/utils/day'
import { MIN_VALID_WEIGHT_KG } from '@/lib/utils/units'
import type { IngestPayload } from './schema'

type DB = SupabaseClient<Database>

const HOME_TZ = 'Asia/Jerusalem'

/**
 * The user's logical "today" — computed in THEIR timezone, never the server's.
 * Netlify functions run in UTC: a 09:25 local push used to be stamped with
 * yesterday's date and become invisible in the UI. The day boundary is
 * hardcoded to midnight (00:00 local); only the timezone is user-specific.
 * Timezone comes from user_goals.timezone; home fallback if unset/unmigrated.
 */
export async function logicalTodayForUser(db: DB, userId: string): Promise<string> {
  let tz = HOME_TZ
  try {
    const { data, error } = await db.from('user_goals').select('timezone').eq('user_id', userId).maybeSingle()
    const g = data as { timezone?: string | null } | null
    if (!error && g?.timezone) tz = g.timezone
  } catch { /* column not migrated yet — home fallback stands */ }
  return logicalTodayInTZ(tz)
}

export interface SectionResult {
  ok: boolean
  action: 'upserted' | 'inserted' | 'skipped' | 'ignored'
  error?: string
}

export interface FieldError { field: string; error: string }

/**
 * Ultra-detailed ingest response — the client shows exactly what landed
 * (`inserted`), what wasn't sent (`omitted`), and any per-metric DB/validity
 * problems (`errors`). `results`/`warnings` keep the richer per-table breakdown.
 * The route NEVER 500s on a DB error: everything is reported here so the phone
 * sees precisely what worked and what didn't.
 */
export interface IngestResult {
  date: string
  inserted: string[]         // metric keys stored successfully
  omitted: string[]          // known metric keys absent/null in the payload
  errors: FieldError[]       // per-metric DB or validity failures ([] if clean)
  received: string[]         // metric keys present in the payload (inserted ∪ errored)
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

/** Every metric key a push source can send (canonical names, post-normalization). */
const KNOWN_KEYS = [
  'steps', 'water', 'sleep_minutes', 'carbs', 'protein', 'fats', 'weight', 'lean_mass',
  'bmi', 'training_minutes', 'active_energy', 'body_fat', 'standing_minutes', 'avg_heart_rate',
  'avg_rest_heart_rate', 'respiratory_rate', 'blood_oxygen', 'hrv', 'exercise_minutes',
  'stand_hours', 'vo2max', 'wrist_temp', 'time_in_daylight', 'heart_rate_recovery',
] as const

/** Newer metric columns that may not exist yet if the latest migration wasn't run. */
const V51_METRIC_KEYS = [
  'hrv_ms', 'exercise_minutes', 'stand_hours', 'vo2max',
  'wrist_temp_delta', 'time_in_daylight_min', 'heart_rate_recovery',
] as const
/** Payload key → the corresponding daily_logs column (for error attribution). */
const V51_PAYLOAD_TO_COLUMN: Record<string, string> = {
  hrv: 'hrv_ms', exercise_minutes: 'exercise_minutes', stand_hours: 'stand_hours', vo2max: 'vo2max',
  wrist_temp: 'wrist_temp_delta', time_in_daylight: 'time_in_daylight_min', heart_rate_recovery: 'heart_rate_recovery',
}

/**
 * Adaptive stand-unit conversion. Real payloads carry MINUTES here (observed:
 * 278, 46), but small values (≤ 24) are indistinguishable from an Apple
 * stand-hours ring count — those pass through untouched; anything larger is
 * minutes and converts to hours.
 */
export function standToHours(v: number | undefined): number | undefined {
  if (v === undefined) return undefined
  return v > 24 ? Math.round(v / 60) : Math.round(v)
}

/**
 * Payload key → destination column for keys whose NAME differs from where the
 * value lands, so the response can say "training_minutes → exercise_minutes"
 * and stop reporting satisfied targets as "omitted".
 */
const MAPPED_KEYS: Record<string, string> = {
  training_minutes: 'exercise_minutes',
  standing_minutes: 'stand_hours',
}

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
 * Upsert the flat ingest payload into daily_logs (merge — only provided keys,
 * preserving AI-completed advanced fields), then fan out to the normalized
 * tables that power scoring, the dashboard, and charts.
 */
export async function ingestDailyLog(
  db: DB, userId: string, payload: IngestPayload,
): Promise<IngestResult> {
  const date = payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) ? payload.date : await logicalTodayForUser(db, userId)
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
  // Advanced metrics. HealthKit's exercise-ring minutes arrive as `training_minutes`
  // minutes, and its `standing_minutes` is Apple's STAND-HOURS count despite
  // the name (Apple has no standing-minutes metric; typical value 8–14) → both
  // feed the v5.1 columns (explicit keys win); legacy columns stay dual-written.
  set('hrv_ms', payload.hrv)
  set('exercise_minutes', payload.exercise_minutes ?? payload.training_minutes)
  set('stand_hours', payload.stand_hours ?? standToHours(payload.standing_minutes))
  set('vo2max', payload.vo2max)
  // Environmental & cardiac metrics. NOTE: wrist_temp_delta stores the raw
  // value the Shortcut sends — since 2026-07 that is the night's AVERAGE wrist
  // temperature in °C, not a delta. The column name is kept as-is (renaming
  // would risk the pinned Shortcut ingest path); the Vitals UI labels it °C.
  set('wrist_temp_delta', payload.wrist_temp)
  set('time_in_daylight_min', payload.time_in_daylight)
  set('heart_rate_recovery', payload.heart_rate_recovery)

  // Present = keys the source actually sent (canonical, post-normalization).
  // Omitted = everything it didn't — EXCEPT targets satisfied through a mapped
  // source key (training_minutes fills exercise_minutes, so exercise_minutes is
  // NOT "omitted"). A push NEVER fails for omitted keys.
  const p = payload as Record<string, unknown>
  const present = KNOWN_KEYS.filter((k) => p[k] !== undefined)
  const satisfiedTargets = new Set(
    Object.entries(MAPPED_KEYS).filter(([src]) => p[src] !== undefined).map(([, target]) => target),
  )
  const omitted = KNOWN_KEYS.filter((k) => p[k] === undefined && !satisfiedTargets.has(k))
  const errors: FieldError[] = []
  const failed = new Set<string>()

  // Weight below the validity floor is a scale artifact — reported, not stored.
  if (payload.weight !== undefined && weight === undefined) {
    failed.add('weight')
    errors.push({ field: 'weight', error: `ignored — below ${MIN_VALID_WEIGHT_KG}kg validity minimum` })
  }

  const result: IngestResult = {
    date, inserted: [], omitted, errors, received: present,
    results: {
      daily_log: skipped(), metrics: skipped(), nutrition: skipped(),
      body: skipped(), water: skipped(), sleep: skipped(),
    },
    warnings,
  }

  const { error: dlErr, strippedV51 } = await upsertDailyLog(db, row)
  if (strippedV51) {
    warnings.push('advanced metrics (HRV / VO₂max / exercise / stand / wrist temp / daylight / HRR) skipped — the newest daily_logs columns are not migrated yet; run the latest paste-SQL to store them')
    for (const k of present) {
      if (k in V51_PAYLOAD_TO_COLUMN) {
        failed.add(k)
        errors.push({ field: k, error: `daily_logs.${V51_PAYLOAD_TO_COLUMN[k]} column not migrated — run the latest paste-SQL` })
      }
    }
  }
  if (dlErr) {
    // Genuine DB failure: report it per the detailed contract — never throw/500.
    for (const k of present) failed.add(k)
    errors.push({ field: 'daily_logs', error: dlErr.message })
  }
  result.results.daily_log = dlErr
    ? { ok: false, action: 'upserted', error: dlErr.message }
    : { ok: true, action: 'upserted' }

  // ── 2. Fan-out: daily_metrics (steps, active cal, resting HR) ──
  const restHr = payload.avg_rest_heart_rate ?? payload.avg_heart_rate
  if (payload.steps !== undefined || payload.active_energy !== undefined || restHr !== undefined) {
    const m: Record<string, any> = { user_id: userId, date }
    if (payload.steps !== undefined) m.steps = Math.round(payload.steps)
    if (payload.active_energy !== undefined) m.active_cal = Math.round(payload.active_energy)
    if (restHr !== undefined) m.rest_hr = Math.round(restHr)
    const { error } = await db.from('daily_metrics').upsert(m as any, { onConflict: 'user_id,date', ignoreDuplicates: false })
    result.results.metrics = error ? { ok: false, action: 'upserted', error: error.message } : { ok: true, action: 'upserted' }
    if (error) errors.push({ field: 'daily_metrics', error: error.message })
  }

  // ── 3. Fan-out: nutrition_entries (explicit dietary energy ONLY — never derived) ──
  // We store the source's own calorie total (HealthKit Dietary Energy / MFP's
  // Atwater+fiber value). We do NOT synthesize calories from 4·C + 4·P + 9·F —
  // a fabricated number silently drifts from the app the user actually logged in.
  // A macro-only payload leaves its macros in daily_logs (section 1) and skips
  // this summary row rather than inventing a calorie value (and would violate the
  // NOT-NULL calories column anyway).
  if (payload.calories !== undefined) {
    const calories = payload.calories
    const carbs = payload.carbs ?? 0, protein = payload.protein ?? 0, fats = payload.fats ?? 0
    await db.from('nutrition_entries').delete().eq('user_id', userId).eq('date', date).eq('meal_type', 'daily')
    const { error } = await db.from('nutrition_entries').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, meal_type: 'daily',
      calories, protein_g: protein, carbs_g: carbs, fat_g: fats, fiber_g: null,
      phase: derivePhase(calories),
    } as any)
    result.results.nutrition = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
    if (error) errors.push({ field: 'nutrition_entries', error: error.message })
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
      if (error) errors.push({ field: 'body_composition', error: error.message })
    }
  }

  // ── 5. Fan-out: water_intake ──
  if (payload.water !== undefined) {
    await db.from('water_intake').delete().eq('user_id', userId).eq('date', date)
    const { error } = await db.from('water_intake').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, amount_ml: payload.water,
    } as any)
    result.results.water = error ? { ok: false, action: 'inserted', error: error.message } : { ok: true, action: 'inserted' }
    if (error) errors.push({ field: 'water_intake', error: error.message })
  }

  // ── 6. Fan-out: sleep_sessions — UNCONDITIONAL OVERWRITE for the night ──
  // A daily push must always reflect the latest reading. The delete window spans
  // the whole night (prev-day noon → this-day end) so a session stamped with its
  // REAL bed_start (the previous evening) is replaced on re-sync instead of
  // duplicated — while the prior night (bedtime two evenings ago) is untouched.
  if (payload.sleep_minutes !== undefined && payload.sleep_minutes > 0) {
    const prev = new Date(`${date}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1)
    const prevDate = prev.toISOString().slice(0, 10)
    await db.from('sleep_sessions').delete()
      .eq('user_id', userId).gte('start_time', `${prevDate}T12:00:00Z`).lt('start_time', `${date}T23:59:59Z`)

    const dur = Math.round(payload.sleep_minutes)
    const deep = payload.deep_min ?? 0
    const rem = payload.rem_min ?? 0
    const awake = payload.awake_min ?? 0
    // Real per-stage split when present; else all sleep counts as core (legacy).
    const core = payload.core_min ?? Math.max(0, dur - deep - rem)
    const startTime = payload.bed_start ?? `${date}T23:00:00Z`
    const endTime = payload.bed_end ?? startTime
    const { error } = await db.from('sleep_sessions').insert({
      user_id: userId, hk_uuid: null,
      start_time: startTime, end_time: endTime,
      duration_min: dur, deep_min: deep, rem_min: rem, core_min: core, awake_min: awake, sleep_score: null,
    } as any)
    result.results.sleep = error ? { ok: false, action: 'upserted', error: error.message } : { ok: true, action: 'upserted' }
    if (error) errors.push({ field: 'sleep_sessions', error: error.message })
  }

  // Finalize: everything present that didn't fail is confirmed inserted —
  // mapped keys carry their destination so the client sees where data landed.
  result.inserted = present
    .filter((k) => !failed.has(k))
    .map((k) => (MAPPED_KEYS[k] && p[MAPPED_KEYS[k]] === undefined ? `${k} → ${MAPPED_KEYS[k]}` : k))
  return result
}
