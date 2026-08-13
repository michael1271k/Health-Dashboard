'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import {
  buildWeeklyExport, trendTotals,
  type ExportDay, type ExportSession, type ExportExercise, type ExportDoms, type ExportBodyComp,
  type ExportCardio, type WeeklyExportInput, type LedgerWeek, type ExportSupplement,
} from '@/lib/reports/weeklyExport'
import { weekLabelOf, WEEK0_START } from '@/lib/reports/weekNumber'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { activeProgram, activePhase, eraForDate, isTrainingDay } from '@/lib/programs'
import { repWindowFor } from '@/lib/training/ceilings'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, weeklyTonnageByMuscle, type MoverTokens, type ProgramPhase } from '@/lib/training/landmarks'
import { SUPPLEMENT_PROTOCOL } from '@/lib/supplements'
import { type CustomSupplement } from '@/lib/hooks/useCustomSupplements'
import { normalizeSpO2 } from '@/lib/utils/units'
import { activeKcalOf } from '@/lib/cardio/metrics'
import type { PrAxis } from '@/lib/training/prEngine'

/**
 * The user's stack, as rows, for the export to render.
 *
 * NO MERGE, and no "built-in" half any more: `custom_supplements` holds the
 * whole protocol, so this is a projection of the table and nothing else. The old
 * version rendered the hardcoded list and appended the user's additions to it,
 * which is why a dose edited in the app never reached the markdown.
 */
function supplementStack(customs: CustomSupplement[]): ExportSupplement[] {
  // The DATABASE, verbatim — dose, time, condition and rule all as the user last
  // saved them. When the table is unseeded the constant is the only stack there
  // is, so it renders instead; it is a fallback, never a merge partner.
  if (!customs.length) {
    return SUPPLEMENT_PROTOCOL.flatMap((slot) => slot.items.map((i) => ({
      time: slot.time, name: i.name, dose: i.dose,
      trainingOnly: i.trainingOnly, notes: i.notes,
    })))
  }
  return customs.map((c) => ({
    time: c.time,
    name: c.name,
    dose: c.dose,
    trainingDose: c.schedule?.trainingDose,
    restDose: c.schedule?.restDose,
    trainingOnly: c.schedule?.trainingOnly,
    notes: c.schedule?.notes,
  }))
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The AI weekly-summary report type stored in `reports`. */
export const WEEKLY_AI_TYPE = 'weekly_ai'

interface RawSet {
  id: string; pair_id: string | null; side: string | null; weight_kg: number; reps: number
  est_1rm_kg: number | null; set_type: string | null; is_pr: boolean | null
  session_id: string
  /** Performance order within the session — the export sorts on these. */
  exercise_order: number | null; set_number: number | null
  exercises: { name: string; muscle_groups: string[] | null }
}
interface RawSession {
  id: string; started_at: string; split_day: string; day_key: string | null
  total_volume_kg: number | null; set_count: number | null
  duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
  calories_estimated?: boolean | null; avg_bpm_estimated?: boolean | null
}

/** Pull every table a week's export needs, for an arbitrary [start, end] range. */
async function fetchRange(weekStart: string, weekEnd: string) {
  const startInstant = new Date(`${weekStart}T00:00:00`).toISOString()
  const endInstant = new Date(`${isoAddDays(weekEnd, 1)}T00:00:00`).toISOString()

  // Active Energy, Day Score and Battery are deliberately NOT fetched — none of
  // the three appears in the export any more (see weeklyExport.ts).
  const [logs, nutrition, sessions, sets, water, supps, doms, bodyComp, cardio, rpe, bodyLedger, skips, prAxes, whr, exceptions] = await Promise.all([
    // `active_energy` and `bmr` join the main select rather than getting their
    // own isolated slot: both are long-standing columns (verified live), and the
    // isolation convention exists for columns whose paste-SQL may not have run.
    // Neither is printed on a daily line — they are the two sides of the weekly
    // energy-balance estimate. See weeklyExport's header.
    supabase.from('daily_logs')
      .select('date, weight_kg, steps, distance_m, training_minutes, sleep_minutes, water_ml, avg_rest_heart_rate, hrv_ms, blood_oxygen, active_energy, bmr')
      .gte('date', weekStart).lte('date', weekEnd),
    supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g')
      .eq('meal_type', 'daily').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('workout_sessions')
      .select('id, started_at, split_day, day_key, total_volume_kg, set_count, duration_min, avg_bpm, calories_burned, calories_estimated, avg_bpm_estimated')
      .gte('started_at', startInstant).lt('started_at', endInstant).order('started_at', { ascending: true }),
    // Sets are scoped by their PARENT SESSION's started_at, not their own
    // created_at — a session logged days later (back-dated) has created_at
    // outside the week and used to vanish from its own export.
    // exercise_order + set_number are SELECTED and ORDERED here. Without them the
    // export took whatever order Postgres handed back — nondeterministic, which
    // is why sets sometimes read bottom-to-top. `useSessionDetail` has always
    // ordered this way, so the UI and the export were built on different rules.
    supabase.from('workout_sets')
      .select('id, pair_id, side, weight_kg, reps, est_1rm_kg, set_type, is_pr, session_id, exercise_order, set_number, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
      .gte('workout_sessions.started_at', startInstant).lt('workout_sessions.started_at', endInstant)
      .order('exercise_order', { ascending: true }).order('set_number', { ascending: true })
      .limit(3000),
    supabase.from('water_intake').select('date, amount_ml').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('supplement_log').select('date, item_key').eq('taken', true).gte('date', weekStart).lte('date', weekEnd),
    supabase.from('doms_logs').select('date, muscle_group, severity').gte('date', weekStart).lte('date', weekEnd),
    // Body composition — its own query so an un-migrated column can't take down
    // the daily-logs fetch above; on error it's simply omitted.
    supabase.from('daily_logs')
      .select('date, weight_kg, bmi, body_fat_pct, muscle_percent, water_percent, bone_mineral, visceral_fat, bmr, muscle_mass_kg, fat_free_mass_kg, fat_mass_kg, protein_mass_kg, bone_mineral_kg, water_mass_kg, skeletal_muscle_mass_kg')
      .gte('date', weekStart).lte('date', weekEnd),
    // Walks / runs — a separate ledger; exported flagged as already counted.
    supabase.from('cardio_logs').select('date, kind, distance_m, duration_min, kcal, active_kcal, total_kcal, avg_hr, effort')
      .gte('date', weekStart).lte('date', weekEnd).order('date', { ascending: true }),
    // Session effort (Borg CR10) — its OWN query. Folding session_rpe into the
    // sessions select above would make a pre-migration DB drop every session
    // from the export, not just the effort rating.
    supabase.from('workout_sessions').select('id, session_rpe')
      .gte('started_at', startInstant).lt('started_at', endInstant),
    // The body_composition LEDGER too. Reading daily_logs alone meant any date
    // that exists only in the ledger — a HealthKit weigh-in with no manual
    // entry — was silently absent from the export's InBody lines.
    supabase.from('body_composition')
      .select('date, weight_kg, bmi, body_fat_pct, muscle_pct, water_pct, bone_mineral_pct, visceral_fat, bmr, muscle_mass_kg, fat_free_mass_kg, fat_mass_kg, protein_mass_kg, bone_mass_kg, body_water_mass_kg, skeletal_muscle_mass_kg')
      .gte('date', weekStart).lte('date', weekEnd),
    // Why a weigh-in was skipped. Its OWN query, and deliberately so: the column
    // is newer than the rest of daily_logs, and folding it into the select above
    // would make one un-migrated column empty every day of the export rather
    // than just this field. On error the reason is simply unknown.
    supabase.from('daily_logs').select('date, weighin_skip_reason')
      .gte('date', weekStart).lte('date', weekEnd),
    // WHICH axis each record was set on. Scoped by achieved_on and matched by
    // session_id, exactly as `useSessionDetail` does it, so the export and the
    // Session Report can never name a different set of records for one session.
    // `personal_records` holds one STANDING row per (exercise, axis), so a
    // record later beaten is absent from both surfaces alike.
    supabase.from('personal_records').select('session_id, exercise_key, axis')
      .gte('achieved_on', weekStart).lte('achieved_on', weekEnd),
    // The scale's estimated waist-to-hip ratio, ALONE in its own query because
    // its paste-SQL may not have run — sharing a select with columns that exist
    // would 400 the whole statement and cost the export every body metric.
    supabase.from('daily_logs').select('date, estimated_waist_to_hip_ratio')
      .gte('date', weekStart).lte('date', weekEnd),
    // Declared nutrition context — days ALLOWED to miss the calorie target, and
    // days whose numbers are a guess. Isolated for the same reason as the two
    // selects above: these are the newest columns here, and folding them in
    // would cost the export a weigh-in reason or every body metric the day one
    // of them turns out not to be migrated.
    //
    // Both travel together because they are read together and fail together —
    // a second isolated select would double the round trip to buy nothing.
    supabase.from('daily_logs').select('date, nutrition_exception, nutrition_estimated')
      .gte('date', weekStart).lte('date', weekEnd),
  ])

  return {
    logs: (logs.data ?? []) as Array<Record<string, number | string | null>>,
    nutrition: (nutrition.data ?? []) as Array<Record<string, number | string | null>>,
    sessions: (sessions.data ?? []) as unknown as RawSession[],
    sets: (sets.data ?? []) as unknown as RawSet[],
    water: (water.data ?? []) as Array<{ date: string; amount_ml: number }>,
    supps: (supps.data ?? []) as Array<{ date: string; item_key: string }>,
    // doms_logs may not be migrated yet — an error just means no soreness rows.
    doms: (doms.error ? [] : (doms.data ?? [])) as Array<{ date: string; muscle_group: string; severity: number }>,
    bodyComp: (bodyComp.error ? [] : (bodyComp.data ?? [])) as Array<Record<string, number | string | null>>,
    bodyLedger: (bodyLedger.error ? [] : (bodyLedger.data ?? [])) as Array<Record<string, number | string | null>>,
    // cardio_logs may not be migrated yet — an error just means no walks.
    cardio: (cardio.error ? [] : (cardio.data ?? [])) as Array<{
      date: string; kind: string; distance_m: number | null; duration_min: number | null
      kcal: number | null; active_kcal?: number | null; total_kcal?: number | null
      avg_hr?: number | null; effort?: number | null
    }>,
    // session_rpe may not be migrated yet — an error just means nothing rated.
    rpe: (rpe.error ? [] : (rpe.data ?? [])) as unknown as Array<{ id: string; session_rpe: number | null }>,
    // weighin_skip_reason may not be migrated yet — an error just means no
    // stated reasons, and the export still says the weigh-in was skipped.
    skips: (skips.error ? [] : (skips.data ?? [])) as unknown as Array<{ date: string; weighin_skip_reason: string | null }>,
    // personal_records may be absent — the PRs still list, without their axes.
    prAxes: (prAxes.error ? [] : (prAxes.data ?? [])) as unknown as Array<{ session_id: string | null; exercise_key: string; axis: PrAxis }>,
    // estimated_waist_to_hip_ratio may not be migrated yet — an error just means
    // the ratio is absent, and every other body metric still prints.
    whr: (whr.error ? [] : (whr.data ?? [])) as unknown as Array<{ date: string; estimated_waist_to_hip_ratio: number | null }>,
    // Either column may not be migrated yet — an error just means no day was
    // declared an exception and none was estimated, which is also exactly what
    // an ordinary week looks like.
    exceptions: (exceptions.error ? [] : (exceptions.data ?? [])) as unknown as Array<{
      date: string; nutrition_exception: string | null; nutrition_estimated: boolean | null
    }>,
  }
}

/**
 * EVERY week of the programme, aggregated for the closing ledger.
 *
 * Five narrow selects over the whole span, bucketed by week in memory — so the
 * cost is FLAT in the number of weeks. A per-week fetch would be five round
 * trips × however long the programme has run, and that arithmetic is precisely
 * why the original "vs previous week" block was deleted rather than extended.
 *
 * Every week runs through the SAME `trendTotals` as the current week's own
 * figures. Two aggregation paths for one table is how a trend starts lying.
 */
async function fetchTrendLedger(firstWeekStart: string, lastWeekStart: string): Promise<LedgerWeek[]> {
  const lastEnd = isoAddDays(lastWeekStart, 6)
  const startInstant = new Date(`${firstWeekStart}T00:00:00`).toISOString()
  const endInstant = new Date(`${isoAddDays(lastEnd, 1)}T00:00:00`).toISOString()

  const [logs, nutrition, sessions, water, cardio] = await Promise.all([
    supabase.from('daily_logs').select('date, weight_kg, steps, water_ml')
      .gte('date', firstWeekStart).lte('date', lastEnd),
    supabase.from('nutrition_entries').select('date, calories')
      .eq('meal_type', 'daily').gte('date', firstWeekStart).lte('date', lastEnd),
    supabase.from('workout_sessions').select('started_at, total_volume_kg, notes')
      .gte('started_at', startInstant).lt('started_at', endInstant),
    supabase.from('water_intake').select('date, amount_ml')
      .gte('date', firstWeekStart).lte('date', lastEnd),
    supabase.from('cardio_logs').select('date, duration_min')
      .gte('date', firstWeekStart).lte('date', lastEnd),
  ])

  // The generated Supabase types narrow a partial select to `never`, so rows are
  // cast through the same `Record` shape `fetchRange` uses.
  const rows = (data: unknown) => (data ?? []) as Array<{ date: string } & Record<string, number | null>>
  const logByDate = new Map(rows(logs.data).map((r) => [r.date, r]))
  const kcalByDate = new Map(rows(nutrition.data).map((r) => [r.date, r]))
  const waterByDate = new Map<string, number>()
  for (const w of (water.data ?? []) as Array<{ date: string; amount_ml: number }>) {
    waterByDate.set(w.date, (waterByDate.get(w.date) ?? 0) + w.amount_ml)
  }
  const cardioByDate = new Map<string, number[]>()
  for (const c of (cardio.error ? [] : (cardio.data ?? [])) as Array<{ date: string; duration_min: number | null }>) {
    const a = cardioByDate.get(c.date) ?? []
    if (c.duration_min != null) a.push(c.duration_min)
    cardioByDate.set(c.date, a)
  }
  const volByDate = new Map<string, number[]>()
  for (const s of (sessions.data ?? []) as Array<{ started_at: string; total_volume_kg: number | null; notes: string | null }>) {
    // Seed rows are scaffolding, not training — the same filter the charts use.
    if (s.notes?.startsWith('__seed_') || s.total_volume_kg == null) continue
    const date = s.started_at.slice(0, 10)
    const a = volByDate.get(date) ?? []
    a.push(s.total_volume_kg)
    volByDate.set(date, a)
  }

  const out: LedgerWeek[] = []
  for (let ws = firstWeekStart; ws <= lastWeekStart; ws = isoAddDays(ws, 7)) {
    const dates = Array.from({ length: 7 }, (_, i) => isoAddDays(ws, i))
    const days = dates.map((date, i) => ({
      date, weekdayLabel: WD[i], isTrainingDay: isTrainingDay(date),
      weightKg: logByDate.get(date)?.weight_kg ?? null,
      calories: kcalByDate.get(date)?.calories ?? null,
      proteinG: null, carbsG: null, fatG: null,
      steps: logByDate.get(date)?.steps ?? null,
      distanceM: null, trainingMin: null, sleepMin: null, deepMin: null, remMin: null,
      restingHr: null, hrvMs: null,
      waterMl: waterByDate.get(date) ?? logByDate.get(date)?.water_ml ?? null,
      supplementsTaken: null, activeKcal: null, bmrKcal: null, weighInSkipReason: null,
      // These days feed `trendTotals` and nothing else, and no aggregate reads
      // either flag — neither one ever changes a number, only a day line, and
      // the trend ledger emits no day lines. Hardcoded rather than joined so
      // this path does not pay a read for something it cannot print.
      nutritionException: null,
      nutritionEstimated: false,
    } satisfies ExportDay))
    const weekSessions = dates.flatMap((d) =>
      (volByDate.get(d) ?? []).map((v) => ({ volumeKg: v } as ExportSession)))
    const weekCardio = dates.flatMap((d) =>
      (cardioByDate.get(d) ?? []).map((m) => ({ durationMin: m } as ExportCardio)))
    out.push({ label: weekLabelOf(ws), weekStart: ws, totals: trendTotals(days, weekSessions, weekCardio) })
  }
  return out
}

type RangeData = Awaited<ReturnType<typeof fetchRange>>

/** Shape a fetched range into the export's day rows. */
function toDays(weekStart: string, d: RangeData): ExportDay[] {
  const byDate = <T extends { date?: unknown }>(rows: T[]) =>
    new Map(rows.map((r) => [r.date as string, r]))
  const logs = byDate(d.logs), nutri = byDate(d.nutrition)

  const waterByDate = new Map<string, number>()
  for (const w of d.water) waterByDate.set(w.date, (waterByDate.get(w.date) ?? 0) + w.amount_ml)
  const suppsByDate = new Map<string, number>()
  for (const s of d.supps) suppsByDate.set(s.date, (suppsByDate.get(s.date) ?? 0) + 1)
  const skipByDate = new Map<string, string>()
  for (const s of d.skips) if (s.weighin_skip_reason) skipByDate.set(s.date, s.weighin_skip_reason)
  const exceptionByDate = new Map<string, string>()
  for (const e of d.exceptions) if (e.nutrition_exception) exceptionByDate.set(e.date, e.nutrition_exception)
  const estimatedByDate = new Set<string>()
  for (const e of d.exceptions) if (e.nutrition_estimated) estimatedByDate.add(e.date)

  return Array.from({ length: 7 }, (_, i) => {
    const date = isoAddDays(weekStart, i)
    const l = logs.get(date) as Record<string, number | null> | undefined
    const nt = nutri.get(date) as Record<string, number | null> | undefined
    return {
      date, weekdayLabel: WD[i], isTrainingDay: isTrainingDay(date),
      weightKg: l?.weight_kg ?? null,
      calories: nt?.calories ?? null,
      proteinG: nt?.protein_g ?? null,
      carbsG: nt?.carbs_g ?? null,
      fatG: nt?.fat_g ?? null,
      steps: l?.steps ?? null,
      distanceM: l?.distance_m ?? null,
      trainingMin: l?.training_minutes ?? null,
      sleepMin: l?.sleep_minutes ?? null,
      deepMin: null,   // stage split lives in sleep_sessions; totals suffice here
      remMin: null,
      restingHr: l?.avg_rest_heart_rate ?? null,
      hrvMs: l?.hrv_ms ?? null,
      waterMl: waterByDate.get(date) ?? l?.water_ml ?? null,
      supplementsTaken: suppsByDate.get(date) ?? null,
      // Estimate inputs only — neither reaches a daily line.
      activeKcal: l?.active_energy ?? null,
      bmrKcal: l?.bmr ?? null,
      weighInSkipReason: skipByDate.get(date) ?? null,
      nutritionException: exceptionByDate.get(date) ?? null,
      nutritionEstimated: estimatedByDate.has(date),
    }
  })
}

/**
 * One line per MOVEMENT, keeping the set that earned the record.
 *
 * Mirrors `highlightsOf` in the session report, deliberately: the export and
 * the report must not disagree about how many records a session held.
 */
function dedupePrs(rows: Array<{ name: string; weightKg: number; reps: number }>) {
  const best = new Map<string, { name: string; weightKg: number; reps: number }>()
  for (const r of rows) {
    const cur = best.get(r.name)
    const better = !cur
      || r.weightKg * r.reps > cur.weightKg * cur.reps
      || (r.weightKg * r.reps === cur.weightKg * cur.reps && r.weightKg > cur.weightKg)
    if (better) best.set(r.name, r)
  }
  return [...best.values()]
}

/**
 * The axes each movement set a record on, in this session.
 *
 * Ordered `weight → reps → volume → e1rm` rather than however Postgres returned
 * them, so the same session exports the same string twice — the export's first
 * design rule. De-duplicated because a unilateral movement writes one ledger row
 * per side and both name the same axis.
 */
// Every axis must be listed. `filter` DROPS anything missing here, so an
// unlisted axis renders a PR line with no reason beside a pr_count that still
// includes it — the export and the header disagreeing about the same session.
const AXIS_ORDER: PrAxis[] = ['weight', 'reps', 'volume', 'e1rm']

function axesBySession(rows: RangeData['prAxes']) {
  const byKey = new Map<string, Set<PrAxis>>()
  for (const r of rows) {
    if (!r.session_id) continue
    const key = `${r.session_id}::${r.exercise_key}`
    const set = byKey.get(key) ?? new Set<PrAxis>()
    set.add(r.axis)
    byKey.set(key, set)
  }
  return (sessionId: string, name: string): PrAxis[] => {
    const set = byKey.get(`${sessionId}::${name}`)
    return set ? AXIS_ORDER.filter((a) => set.has(a)) : []
  }
}

/** Shape a fetched range into the export's session rows (with every set). */
function toSessions(d: RangeData): ExportSession[] {
  const program = activeProgram()
  const rpeById = new Map(d.rpe.map((r) => [r.id, r.session_rpe]))
  const axesFor = axesBySession(d.prAxes)
  return d.sessions.map((s) => {
    // Warm-ups are KEPT and tagged. They were dropped here, so the export
    // silently hid the ramp-up: a session read as starting at its top load.
    // Sorted defensively so the builder never depends on transport order.
    const mine = d.sets
      .filter((r) => r.session_id === s.id)
      .slice()
      .sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0) || (a.set_number ?? 0) - (b.set_number ?? 0))
    const byName = new Map<string, ExportExercise>()
    for (const r of mine) {
      const e = byName.get(r.exercises.name) ?? {
        name: r.exercises.name, sets: [], topKg: null,
        repWindow: (() => {
          const w = repWindowFor(r.exercises.name, s.day_key)
          return w ? `${w.floor}–${w.ceiling}` : null
        })(),
      }
      e.sets.push({
        weightKg: r.weight_kg, reps: r.reps,
        side: r.side === 'L' || r.side === 'R' ? r.side : null,
        failure: r.set_type === 'failure',
        warmup: r.set_type === 'warmup',
        pairId: r.pair_id,
      })
      // Warm-ups must not define the top load.
      if (r.set_type !== 'warmup') e.topKg = Math.max(e.topKg ?? 0, r.weight_kg) || null
      byName.set(r.exercises.name, e)
    }
    // A unilateral pair (shared pair_id) is ONE set to failure, not two.
    const failurePairs = new Set(mine.filter((r) => r.set_type === 'failure').map((r) => r.pair_id ?? r.id))
    // Volume is RECOMPUTED from the set rows rather than read from
    // `total_volume_kg`, so historical sessions written before the asymmetry
    // rule existed still export a non-inflated number (an L/R pair scores at the
    // weaker side — see sessionVolumeKg). Includes warmups, same as the app.
    const allSets = d.sets.filter((r) => r.session_id === s.id)
    const volumeKg = allSets.length
      ? sessionVolumeKg(allSets.map((r) => ({
          weightKg: r.weight_kg, reps: r.reps,
          side: r.side === 'L' || r.side === 'R' ? r.side : null,
          pairId: r.pair_id,
        })))
      : s.total_volume_kg
    return {
      date: s.started_at.slice(0, 10),
      label: (s.day_key && program.days.find((x) => x.key === s.day_key)?.label) ?? s.split_day,
      volumeKg, setCount: s.set_count,
      failureSets: failurePairs.size,
      durationMin: s.duration_min, avgBpm: s.avg_bpm, caloriesBurned: s.calories_burned,
      caloriesEstimated: s.calories_estimated ?? false,
      avgBpmEstimated: s.avg_bpm_estimated ?? false,
      sessionRpe: rpeById.get(s.id) ?? null,
      exercises: [...byName.values()],
      // Named PRs, not a bare count. No est-1RM — the raw lift only.
      //
      // DEDUPLICATED PER EXERCISE. `is_pr` is a per-SET flag, so an exercise
      // that set records on two sets — or a unilateral movement whose L and R
      // rows both cleared — printed the same achievement twice, and a reader
      // counting lines got a PR total that matched neither the badge on the
      // report nor `pr_count`. One movement, one line, carrying the set that
      // won it (heaviest tonnage, ties to the heavier load).
      prs: dedupePrs(mine.filter((r) => r.is_pr).map((r) => ({
        name: r.exercises.name, weightKg: r.weight_kg, reps: r.reps,
      }))).map((p) => ({ ...p, axes: axesFor(s.id, p.name) })),
    }
  })
}

/** Days with a real scale reading → the export's body-composition rows. */
function toBodyComp(d: RangeData): ExportBodyComp[] {
  // Union of the two tables, daily_logs winning per FIELD — it holds the manual
  // InBody entry, which is richer than a HealthKit sync. The ledger's own
  // column names differ (muscle_pct / bone_mineral_pct / water_pct), so they
  // are folded onto the daily_logs spellings before merging.
  const merged = new Map<string, Record<string, number | string | null>>()
  for (const r of d.bodyLedger) {
    merged.set(r.date as string, {
      date: r.date, weight_kg: r.weight_kg, bmi: r.bmi, body_fat_pct: r.body_fat_pct,
      muscle_percent: r.muscle_pct, water_percent: r.water_pct, bone_mineral: r.bone_mineral_pct,
      visceral_fat: r.visceral_fat, bmr: r.bmr,
      muscle_mass_kg: r.muscle_mass_kg, fat_free_mass_kg: r.fat_free_mass_kg,
      // The ledger spells three of these differently again.
      fat_mass_kg: r.fat_mass_kg, protein_mass_kg: r.protein_mass_kg,
      bone_mineral_kg: r.bone_mass_kg, water_mass_kg: r.body_water_mass_kg,
      skeletal_muscle_mass_kg: r.skeletal_muscle_mass_kg,
    })
  }
  for (const r of d.bodyComp) {
    const cur = merged.get(r.date as string) ?? {}
    const out: Record<string, number | string | null> = { ...cur }
    for (const [k, v] of Object.entries(r)) if (v != null) out[k] = v
    merged.set(r.date as string, out)
  }
  // The ratio rides in from its own isolated query.
  for (const r of d.whr) {
    if (r.estimated_waist_to_hip_ratio == null) continue
    const cur = merged.get(r.date) ?? { date: r.date }
    merged.set(r.date, { ...cur, estimated_waist_to_hip_ratio: r.estimated_waist_to_hip_ratio })
  }

  return [...merged.values()]
    .map((r) => ({
      date: r.date as string,
      weightKg: (r.weight_kg as number | null) ?? null,
      bmi: (r.bmi as number | null) ?? null,
      bodyFatPct: (r.body_fat_pct as number | null) ?? null,
      musclePercent: (r.muscle_percent as number | null) ?? null,
      waterPercent: (r.water_percent as number | null) ?? null,
      visceralFat: (r.visceral_fat as number | null) ?? null,
      bmr: (r.bmr as number | null) ?? null,
      boneMineral: (r.bone_mineral as number | null) ?? null,
      // Every mass under its own name — see ExportBodyComp.
      muscleMassKg: (r.muscle_mass_kg as number | null) ?? null,
      fatFreeMassKg: (r.fat_free_mass_kg as number | null) ?? null,
      fatMassKg: (r.fat_mass_kg as number | null) ?? null,
      proteinMassKg: (r.protein_mass_kg as number | null) ?? null,
      boneMineralKg: (r.bone_mineral_kg as number | null) ?? null,
      waterMassKg: (r.water_mass_kg as number | null) ?? null,
      skeletalMuscleMassKg: (r.skeletal_muscle_mass_kg as number | null) ?? null,
      estimatedWaistToHipRatio: (r.estimated_waist_to_hip_ratio as number | null) ?? null,
    }))
    // Only days with a metric beyond bare weight (the daily table already lists weight).
    .filter((b) => [b.bmi, b.bodyFatPct, b.musclePercent, b.waterPercent, b.visceralFat, b.bmr,
      b.boneMineral, b.muscleMassKg, b.fatFreeMassKg, b.skeletalMuscleMassKg,
      b.estimatedWaistToHipRatio].some((v) => v != null))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Cardio ledger rows → the export's nested walk/run lines. */
function toCardio(d: RangeData): ExportCardio[] {
  return d.cardio.map((c) => ({
    date: c.date, kind: c.kind,
    distanceM: c.distance_m, durationMin: c.duration_min,
    // Pre-migration rows only have `kcal`; it always held the ACTIVE figure.
    kcal: activeKcalOf(c),
    totalKcal: c.total_kcal ?? null,
    avgHr: c.avg_hr ?? null,
    effort: c.effort ?? null,
  }))
}

/**
 * WEEKLY TONNAGE per muscle, aggregated per EXERCISE so the collapse rule can
 * run before attribution.
 *
 * `sessionVolumeKg` is applied to each (session, exercise) group rather than to
 * individual rows, because a unilateral pair is only recognisable as a pair when
 * both of its rows are in the same bucket — score them separately and the L/R
 * asymmetry rule never fires, which is exactly how a per-muscle figure ends up
 * disagreeing with the Session Report about the same lift.
 *
 * WARM-UPS ARE INCLUDED, matching `sessionVolumeKg` and the Session Report. The
 * sets-vs-target section above excludes them on purpose — a ramp-up is not a
 * working set — but this is tonnage, and a warm-up is real weight moved.
 */
function tonnageRows(sets: RangeData['sets']): Array<MoverTokens & { volumeKg: number }> {
  const byExercise = new Map<string, { name: string; sets: RangeData['sets'] }>()
  for (const r of sets) {
    const key = `${r.session_id}::${r.exercises.name}`
    const cur = byExercise.get(key) ?? { name: r.exercises.name, sets: [] }
    cur.sets.push(r)
    byExercise.set(key, cur)
  }
  return [...byExercise.values()].map((g) => ({
    ...resolveMovers(g.name, g.sets[0].exercises.muscle_groups),
    volumeKg: sessionVolumeKg(g.sets.map((r) => ({
      weightKg: r.weight_kg, reps: r.reps,
      side: r.side === 'L' || r.side === 'R' ? r.side : null,
      pairId: r.pair_id,
    }))),
  }))
}

/**
 * One fetched week → the finished `WeeklyExportInput`.
 *
 * Extracted so the current week and the appended previous week are assembled by
 * the SAME code. Two builders for one payload is how the reference week starts
 * quietly disagreeing with the week it is meant to give context to.
 */
function weekPayload(
  weekStart: string,
  range: RangeData,
  goals: { calorie_goal?: number; protein_goal_g?: number; steps_goal?: number; sleep_goal_hours?: number } | null,
  customs: CustomSupplement[],
  phase: ProgramPhase,
): WeeklyExportInput {
  const days = toDays(weekStart, range)
  const sessions = toSessions(range)

  // Weekly volume, same rule as the Weekly Volume card: a full set to the
  // primary movers, SECONDARY_SET_CREDIT to the assistants.
  const volumeByMuscle = weeklyVolumeByMuscle(
    range.sets.filter((r) => r.set_type !== 'warmup').map((r) => ({
      ...resolveMovers(r.exercises.name, r.exercises.muscle_groups),
      dedupeKey: r.pair_id ?? r.id,
    })),
    phase,
  ).map((m) => ({
    muscle: m.muscle, sets: m.sets, target: m.target,
    directSets: m.directSets, indirectSets: m.indirectSets,
  }))

  const doms: ExportDoms[] = range.doms
    .map((r) => ({ date: r.date, muscle: r.muscle_group, severity: r.severity }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.muscle.localeCompare(b.muscle))

  return {
    weekStart, weekEnd: isoAddDays(weekStart, 6),
    // The SAME counter the dashboard badge and the Momentum timeline use —
    // "Week 3" here has to mean the week the app calls Week 3.
    weekLabel: weekLabelOf(weekStart),
    programLabel: eraForDate(weekStart) === 'axis' ? `Helix ${phase === 'cut' ? 'Cut' : 'Bulk'}` : 'PPL (legacy)',
    calorieGoal: goals?.calorie_goal ?? null,
    proteinGoalG: goals?.protein_goal_g ?? null,
    stepsGoal: goals?.steps_goal ?? null,
    sleepGoalHours: goals?.sleep_goal_hours ?? null,
    days, sessions, volumeByMuscle, doms,
    tonnageByMuscle: weeklyTonnageByMuscle(tonnageRows(range.sets))
      .map((t) => ({ muscle: t.muscle, volumeKg: t.volumeKg })),
    bodyComp: toBodyComp(range),
    cardio: toCardio(range),
    supplementProtocol: supplementStack(customs),
  }
}

/**
 * Assemble the full week payload (days · sessions with every set · direct-set
 * volume · soreness · body composition) and render it as the AI prompt string.
 * One hook powers every "Export Week" button.
 */
export function useWeeklyExport(weekStart = weekStartOf(logicalTodayISO()), enabled = true) {
  const weekEnd = isoAddDays(weekStart, 6)
  return useQuery({
    queryKey: ['weekly_export', weekStart],
    // ~28 round-trips: TWO full weeks, because the payload now carries the
    // previous week's complete export as AI context. That is the deliberate
    // trade — a model given one week can only describe it — and it is why this
    // stays off until someone actually asks for the payload. It used to run the
    // moment a week capsule expanded. See `useSentinelExport` for the other
    // half of that bill.
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const prevStart = isoAddDays(weekStart, -7)
      const [cur, prevRange, ledger, goalsRes, customsRes] = await Promise.all([
        fetchRange(weekStart, weekEnd),
        fetchRange(prevStart, isoAddDays(prevStart, 6)),
        // Week 0 to the exported week — the whole programme, five selects.
        fetchTrendLedger(weekStartOf(WEEK0_START), weekStart),
        supabase.from('user_goals').select('calorie_goal, protein_goal_g, steps_goal, sleep_goal_hours').maybeSingle(),
        supabase.from('custom_supplements').select('id, name, dose, color, form, time, schedule, micros'),
      ])
      const customs = (customsRes.error ? [] : (customsRes.data ?? [])) as CustomSupplement[]
      const goals = goalsRes.data as {
        calorie_goal?: number; protein_goal_g?: number; steps_goal?: number; sleep_goal_hours?: number
      } | null
      // The ACTIVE phase, not a calorie guess — maintenance used to collapse to cut.
      const phase: ProgramPhase = activePhase() as ProgramPhase

      const prev = weekPayload(prevStart, prevRange, goals, customs, phase)
      // No `previous` and no `previousWeekMarkdown` on the reference week: it is
      // context, not a report, so it carries neither its own trend table nor a
      // third week behind it.
      const previousWeekMarkdown = buildWeeklyExport(prev)

      return buildWeeklyExport({
        ...weekPayload(weekStart, cur, goals, customs, phase),
        ledger,
        previousWeekMarkdown,
      })
    },
  })
}

export interface WeeklyAiSummary {
  id: string
  weekStart: string
  content: string
  createdAt: string
}

/** The stored AI weekly summaries (newest first). */
export function useWeeklyAiSummaries(limit = 12) {
  return useQuery({
    queryKey: ['reports', WEEKLY_AI_TYPE, limit],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyAiSummary[]> => {
      const { data, error } = await supabase.from('reports')
        .select('id, period_start, content_md, created_at')
        .eq('type', WEEKLY_AI_TYPE).order('period_start', { ascending: false }).limit(limit)
      if (error) return []
      return ((data ?? []) as unknown as Array<{ id: string; period_start: string; content_md: string | null; created_at: string }>)
        .map((r) => ({ id: r.id, weekStart: r.period_start, content: r.content_md ?? '', createdAt: r.created_at }))
    },
  })
}

// Re-exported so callers don't need a second import for the SpO2 helper.
export { normalizeSpO2 }
