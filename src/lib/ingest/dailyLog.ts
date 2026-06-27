import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { ShortcutPayload } from './schema'

type DB = SupabaseClient<Database>

/** Today's date (YYYY-MM-DD) in Israel time, regardless of server timezone. */
export function todayIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export interface IngestResult {
  date: string
  dailyLog: boolean
  fanOut: { metrics: boolean; nutrition: boolean; body: boolean; water: boolean; sleep: boolean }
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

  // ── 1. daily_logs (canonical flat row) ──
  // Only include keys the Shortcut sent so ON CONFLICT preserves AI fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = { user_id: userId, date }
  const set = (k: string, v: number | undefined) => { if (v !== undefined) row[k] = v }
  set('steps', payload.steps)
  set('water_ml', payload.water)
  set('sleep_minutes', payload.sleep_minutes)
  set('carbs_g', payload.carbs)
  set('protein_g', payload.protein)
  set('fats_g', payload.fats)
  set('weight_kg', payload.weight)
  set('lean_mass_kg', payload.lean_mass)
  set('bmi', payload.bmi)
  set('training_minutes', payload.training_minutes)
  set('active_energy', payload.active_energy)
  set('body_fat_pct', payload.body_fat)
  set('move_minutes', payload.move_minutes)
  set('standing_minutes', payload.standing_minutes)
  set('avg_heart_rate', payload.avg_heart_rate)
  set('blood_oxygen', payload.blood_oxygen)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dlErr } = await db.from('daily_logs').upsert(row as any, { onConflict: 'user_id,date' })
  if (dlErr) throw new Error(`daily_logs upsert failed: ${dlErr.message}`)

  const result: IngestResult = {
    date, dailyLog: true,
    fanOut: { metrics: false, nutrition: false, body: false, water: false, sleep: false },
  }

  // ── 2. Fan-out: daily_metrics (steps, active cal, avg HR proxy) ──
  if (payload.steps !== undefined || payload.active_energy !== undefined || payload.avg_heart_rate !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: Record<string, any> = { user_id: userId, date }
    if (payload.steps !== undefined) m.steps = Math.round(payload.steps)
    if (payload.active_energy !== undefined) m.active_cal = Math.round(payload.active_energy)
    if (payload.avg_heart_rate !== undefined) m.rest_hr = Math.round(payload.avg_heart_rate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.from('daily_metrics').upsert(m as any, { onConflict: 'user_id,date', ignoreDuplicates: false })
    result.fanOut.metrics = true
  }

  // ── 3. Fan-out: nutrition_entries (compute calories from macros) ──
  if (payload.carbs !== undefined || payload.protein !== undefined || payload.fats !== undefined) {
    const carbs = payload.carbs ?? 0, protein = payload.protein ?? 0, fats = payload.fats ?? 0
    const calories = Math.round(4 * carbs + 4 * protein + 9 * fats)
    await db.from('nutrition_entries').delete().eq('user_id', userId).eq('date', date).eq('meal_type', 'daily')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.from('nutrition_entries').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, meal_type: 'daily',
      calories, protein_g: protein, carbs_g: carbs, fat_g: fats, fiber_g: null,
    } as any)
    result.fanOut.nutrition = true
  }

  // ── 4. Fan-out: body_composition ──
  if (payload.weight !== undefined || payload.lean_mass !== undefined || payload.body_fat !== undefined) {
    await db.from('body_composition').delete().eq('user_id', userId).eq('date', date)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.from('body_composition').insert({
      user_id: userId, hk_uuid: null, measured_at: `${date}T00:00:00Z`, date,
      weight_kg: payload.weight ?? 0, body_fat_pct: payload.body_fat ?? null,
      muscle_mass_kg: payload.lean_mass ?? null, water_pct: null,
      bone_mass_kg: null, bmi: payload.bmi ?? null,
    } as any)
    result.fanOut.body = true
  }

  // ── 5. Fan-out: water_intake ──
  if (payload.water !== undefined) {
    await db.from('water_intake').delete().eq('user_id', userId).eq('date', date)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.from('water_intake').insert({
      user_id: userId, hk_uuid: null, logged_at: `${date}T00:00:00Z`, date, amount_ml: payload.water,
    } as any)
    result.fanOut.water = true
  }

  // ── 6. Fan-out: sleep_sessions (synthesize if none exists for the night) ──
  if (payload.sleep_minutes !== undefined && payload.sleep_minutes > 0) {
    const { data: existing } = await db.from('sleep_sessions').select('id')
      .eq('user_id', userId).gte('start_time', `${date}T00:00:00Z`).lt('start_time', `${date}T23:59:59Z`).limit(1)
    if (!((existing ?? []) as unknown[]).length) {
      const dur = Math.round(payload.sleep_minutes)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from('sleep_sessions').insert({
        user_id: userId, hk_uuid: null,
        start_time: `${date}T23:00:00Z`, end_time: `${date}T23:00:00Z`,
        duration_min: dur, deep_min: 0, rem_min: 0, core_min: dur, awake_min: 0, sleep_score: null,
      } as any)
      result.fanOut.sleep = true
    }
  }

  return result
}
