'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import {
  buildWeeklyExport, trendTotals,
  type ExportDay, type ExportSession, type ExportExercise, type ExportDoms, type ExportFatigue, type ExportBodyComp,
  type ExportCardio, type WeeklyExportInput, type LedgerWeek, type ExportSupplement,
} from '@/lib/reports/weeklyExport'
import { weekLabelOf, WEEK0_START } from '@/lib/reports/weekNumber'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { restTargetFor, programRestSec } from '@/lib/training/restTargets'
import { FATIGUE_SLOTS, SLOT_LABEL, fatigueLevel, type FatigueSlot } from '@/lib/hooks/useFatigue'
import { epley1RM } from '@/lib/utils/epley'
import { activeProgram, eraForDate, isTrainingDay } from '@/lib/programs'
import { getWeekPhase } from '@/lib/phases'
import { repWindowFor } from '@/lib/training/ceilings'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, weeklyTonnageByMuscle, type MoverTokens, type ProgramPhase, type LandmarkMuscle } from '@/lib/training/landmarks'
import { leverPeriods, activeLeverOf } from '@/lib/nutrition/levers'
import { DAILY_TARGET_COLUMNS, type DailyTarget } from '@/lib/nutrition/dailyTargets'
import { SUPPLEMENT_PROTOCOL } from '@/lib/supplements'
import { type CustomSupplement } from '@/lib/hooks/useCustomSupplements'
import { normalizeSpO2 } from '@/lib/utils/units'
import { nightOf } from '@/lib/sleep/nightWindow'
import { supplementNutrients } from '@/lib/nutrition/supplementNutrients'
import { customSlotsForDate, nutrientPayloads } from '@/lib/hooks/useCustomSupplements'
import { stackForDate, supplementCountForDate } from '@/lib/supplements'
import { activeKcalOf } from '@/lib/cardio/metrics'
import { volumeCredits, type PrAxis } from '@/lib/training/prEngine'
import { isWorkingSet, isSetQuality } from '@/lib/training/setTags'

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
  /** numeric(3,1) — may arrive as a string on some PostgREST paths. */
  rpe: number | string | null
  est_1rm_kg: number | null; set_type: string | null; is_pr: boolean | null
  /** Technique note, null when the question was never asked. */
  quality: string | null
  session_id: string
  /** Performance order within the session — the export sorts on these. */
  exercise_order: number | null; set_number: number | null
  exercises: { name: string; muscle_groups: string[] | null }
}
interface RawSession {
  id: string; started_at: string; ended_at?: string | null; split_day: string; day_key: string | null
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
  const [logs, nutrition, sessions, sets, water, supps, doms, fatigue, bodyComp, cardio, rpe, bodyLedger, skips, prAxes, whr, exceptions, priorCount, sleepStages, onset] = await Promise.all([
    // `active_energy` and `bmr` join the main select rather than getting their
    // own isolated slot: both are long-standing columns (verified live), and the
    // isolation convention exists for columns whose paste-SQL may not have run.
    // Neither is printed on a daily line — they are the two sides of the weekly
    // energy-balance estimate. See weeklyExport's header.
    supabase.from('daily_logs')
      // `avg_heart_rate`, `respiratory_rate`, `vo2max`, `time_in_daylight_min`,
      // `exercise_minutes`, `stand_hours` and `standing_minutes` join here: all
      // seven are long-standing columns, populated every day, and none of them
      // had ever been fetched — the export's vitals line named five readings
      // out of twelve the app was already holding.
      .select('date, weight_kg, steps, distance_m, training_minutes, sleep_minutes, water_ml, avg_rest_heart_rate, hrv_ms, blood_oxygen, wrist_temp_delta, active_energy, bmr, avg_heart_rate, respiratory_rate, vo2max, time_in_daylight_min, exercise_minutes, stand_hours, standing_minutes')
      .gte('date', weekStart).lte('date', weekEnd),
    // `fiber_g` is a real column and every other dietary micro rides in the
    // `micros` jsonb the HealthKit sync writes — the same two facts
    // `useTodayNutrients` folds together for the dashboard.
    supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g, fiber_g, micros')
      .eq('meal_type', 'daily').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('workout_sessions')
      .select('id, started_at, ended_at, split_day, day_key, total_volume_kg, set_count, duration_min, avg_bpm, calories_burned, calories_estimated, avg_bpm_estimated')
      .gte('started_at', startInstant).lt('started_at', endInstant).order('started_at', { ascending: true }),
    // Sets are scoped by their PARENT SESSION's started_at, not their own
    // created_at — a session logged days later (back-dated) has created_at
    // outside the week and used to vanish from its own export.
    // exercise_order + set_number are SELECTED and ORDERED here. Without them the
    // export took whatever order Postgres handed back — nondeterministic, which
    // is why sets sometimes read bottom-to-top. `useSessionDetail` has always
    // ordered this way, so the UI and the export were built on different rules.
    supabase.from('workout_sets')
      .select('id, pair_id, side, weight_kg, reps, rpe, est_1rm_kg, set_type, quality, is_pr, session_id, exercise_order, set_number, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
      .gte('workout_sessions.started_at', startInstant).lt('workout_sessions.started_at', endInstant)
      .order('exercise_order', { ascending: true }).order('set_number', { ascending: true })
      .limit(3000),
    supabase.from('water_intake').select('date, amount_ml').gte('date', weekStart).lte('date', weekEnd),
    // ── THE WHOLE DAY, NOT ONLY THE TICKS ─────────────────────────────────
    // `.eq('taken', true)` made the export a record of when this app happened to
    // be open: the bedtime slot is 22:00, and eight days in August 2026 carry no
    // rows for it at all — every one of them reported as three skipped doses
    // that were actually swallowed. Absence now means TAKEN, so the only thing
    // worth reading is the exception, and `taken` has to come back to find it.
    supabase.from('supplement_log').select('date, item_key, taken, taken_at').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('doms_logs').select('date, muscle_group, severity, source_session_id, source_day_key').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('fatigue_logs').select('date, slot, level').gte('date', weekStart).lte('date', weekEnd),
    // Body composition — its own query so an un-migrated column can't take down
    // the daily-logs fetch above; on error it's simply omitted.
    supabase.from('daily_logs')
      .select('date, weight_kg, bmi, body_fat_pct, muscle_percent, water_percent, bone_mineral, visceral_fat, bmr, muscle_mass_kg, fat_free_mass_kg, fat_mass_kg, protein_mass_kg, protein_percent, bone_mineral_kg, water_mass_kg, skeletal_muscle_mass_kg')
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
      .select('date, weight_kg, bmi, body_fat_pct, muscle_pct, water_pct, bone_mineral_pct, visceral_fat, bmr, muscle_mass_kg, fat_free_mass_kg, fat_mass_kg, protein_mass_kg, protein_pct, bone_mass_kg, body_water_mass_kg, skeletal_muscle_mass_kg')
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
    // HOW MANY SESSIONS CAME BEFORE — the base for the "Session #15" ordinal.
    // A count, not a fetch: the number of preceding sessions is all that is
    // needed, and pulling their rows to length an array would cost a page of
    // data to compute an integer. `head: true` sends no rows at all.
    supabase.from('workout_sessions').select('id', { count: 'exact', head: true })
      .lt('started_at', startInstant),
    /* ── SLEEP ARCHITECTURE ────────────────────────────────────────────────────
       Keyed on `start_time`, which is BEDTIME — the previous evening — so the
       range is widened by a day at the front and the rows are bucketed with
       `nightOf`, the inverse of the window every other reader uses. Slicing
       `start_time` for the date instead would file every pre-midnight bedtime
       under the evening it began rather than the morning it ended, putting half
       the week's nights on the wrong day (and only the half you went to bed
       early on). */
    supabase.from('sleep_sessions')
      .select('start_time, end_time, duration_min, deep_min, rem_min, core_min, awake_min')
      .gte('start_time', `${isoAddDays(weekStart, -1)}T12:00:00Z`)
      .lt('start_time', `${isoAddDays(weekEnd, 1)}T12:00:00Z`),
    /* "Trouble falling asleep" — ALONE, and for the same reason the weigh-in
       reason and the waist-to-hip ratio are: it is the newest column on
       daily_logs, and a select that named it beside twenty live ones would cost
       the export every vital on the day its paste-SQL had not been run. On
       error the flag is simply unknown and the line prints an em-dash. */
    supabase.from('daily_logs').select('date, sleep_onset_trouble')
      .gte('date', weekStart).lte('date', weekEnd),
  ])

  return {
    logs: (logs.data ?? []) as Array<Record<string, number | string | null>>,
    nutrition: (nutrition.data ?? []) as Array<Record<string, number | string | null>>,
    sessions: (sessions.data ?? []) as unknown as RawSession[],
    sets: (sets.data ?? []) as unknown as RawSet[],
    water: (water.data ?? []) as Array<{ date: string; amount_ml: number }>,
    supps: (supps.data ?? []) as Array<{ date: string; item_key: string; taken: boolean; taken_at: string | null }>,
    // doms_logs may not be migrated yet — an error just means no soreness rows.
    doms: (doms.error ? [] : (doms.data ?? [])) as Array<{
      date: string; muscle_group: string; severity: number
      source_session_id?: string | null; source_day_key?: string | null
    }>,
    // sleep_sessions may hold nothing for a week the watch was not worn — an
    // empty list means the stage lines print em-dashes, not that sleep is absent
    // (the DURATION lives on daily_logs and is fetched separately above).
    sleepStages: (sleepStages.error ? [] : (sleepStages.data ?? [])) as Array<{
      start_time: string; end_time: string | null; duration_min: number | null
      deep_min: number | null; rem_min: number | null; core_min: number | null; awake_min: number | null
    }>,
    // Same courtesy as doms_logs: an un-migrated table means no readings, not a
    // failed export.
    fatigue: (fatigue.error ? [] : (fatigue.data ?? [])) as Array<{ date: string; slot: string; level: number }>,
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
    // Null (not []) when the column is absent, so `toDays` can tell "no night
    // was hard" from "the question has never been askable" — the export prints
    // `normal` for the first and an em-dash for the second.
    onset: (onset.error ? null : (onset.data ?? [])) as Array<{
      date: string; sleep_onset_trouble: boolean | null
    }> | null,
    // Sessions logged before this week. Null (not 0) when the count fails, so a
    // failed query prints no ordinal rather than restarting the numbering at 1.
    priorSessions: priorCount.error ? null : (priorCount.count ?? null),
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
      restingHr: null, hrvMs: null, wristTempDeltaC: null, bloodOxygenPct: null,
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
  // The ticks themselves, in the order they were taken. `taken_at` is the CLOCK
  // TIME, which is the half of adherence a count cannot carry — nine of nine
  // says the protocol was met, and 08:45 says the pre-workout was pre-workout.
  const suppLogByDate = new Map<string, Array<{ key: string; time: string | null }>>()
  for (const s of [...(d.supps ?? [])].sort((a, b) => (a.taken_at ?? '').localeCompare(b.taken_at ?? ''))) {
    const bucket = suppLogByDate.get(s.date) ?? []
    bucket.push({ key: s.item_key, time: s.taken_at })
    suppLogByDate.set(s.date, bucket)
  }
  // Bucketed by the night they BELONG to, never by the evening they began.
  const sleepByDate = new Map<string, RangeData['sleepStages'][number]>()
  // `?? []` for the same reason `range.fatigue` carries one: a caller building
  // a range by hand (every export-payload fixture does) predates this field,
  // and a builder that throws on an absent optional array is more fragile than
  // the data it is defending against.
  for (const r of d.sleepStages ?? []) sleepByDate.set(nightOf(r.start_time), r)
  const skipByDate = new Map<string, string>()
  for (const s of d.skips) if (s.weighin_skip_reason) skipByDate.set(s.date, s.weighin_skip_reason)
  const exceptionByDate = new Map<string, string>()
  for (const e of d.exceptions) if (e.nutrition_exception) exceptionByDate.set(e.date, e.nutrition_exception)
  const estimatedByDate = new Set<string>()
  for (const e of d.exceptions) if (e.nutrition_estimated) estimatedByDate.add(e.date)
  // `null` when the column could not be read at all — see `fetchRange`. A Map
  // rather than a Set, because `false` here is a real answer ("the night was
  // normal") and a Set could only ever say "not true", which is the one thing
  // the export must not confuse with "not asked".
  const onsetByDate = d.onset === undefined || d.onset === null
    ? null
    : new Map(d.onset.map((r) => [r.date, r.sleep_onset_trouble === true]))

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
      // They do NOT suffice — see ExportDay. `sleep_sessions` is now fetched and
      // these two stop being the only declared fields in this payload that no
      // builder ever filled.
      deepMin: sleepByDate.get(date)?.deep_min ?? null,
      remMin: sleepByDate.get(date)?.rem_min ?? null,
      restingHr: l?.avg_rest_heart_rate ?? null,
      hrvMs: l?.hrv_ms ?? null,
      wristTempDeltaC: l?.wrist_temp_delta ?? null,
      bloodOxygenPct: l?.blood_oxygen ?? null,
      // The seven vitals the app has always held and the export never named.
      avgHr: l?.avg_heart_rate ?? null,
      respiratoryRate: l?.respiratory_rate ?? null,
      vo2max: l?.vo2max ?? null,
      daylightMin: l?.time_in_daylight_min ?? null,
      exerciseMin: l?.exercise_minutes ?? null,
      standHours: l?.stand_hours ?? null,
      standMin: l?.standing_minutes ?? null,
      // The stage split, from the table that has carried it all along.
      coreMin: sleepByDate.get(date)?.core_min ?? null,
      awakeMin: sleepByDate.get(date)?.awake_min ?? null,
      bedTime: sleepByDate.get(date)?.start_time ?? null,
      wakeTime: sleepByDate.get(date)?.end_time ?? null,
      // A day with no `daily_logs` row has never been reported on, so it reads
      // `false` — the column is NOT NULL DEFAULT false and a missing row is the
      // same statement as an unticked one. Only an unreadable column is `null`.
      sleepOnsetTrouble: onsetByDate === null ? null : (onsetByDate.get(date) ?? false),
      waterMl: waterByDate.get(date) ?? l?.water_ml ?? null,
      supplementsTaken: suppsByDate.get(date) ?? null,
      supplementsLog: suppLogByDate.get(date) ?? [],
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
function dedupePrs<T extends { name: string; weightKg: number; reps: number }>(rows: T[]): T[] {
  // Generic so the winning ROW survives intact. Typing it to the three fields it
  // compares on quietly discarded everything else the caller attached — which is
  // how the PR line lost its tonnage and its 1RM on the way through.
  const best = new Map<string, T>()
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
  // The week's sessions arrive in chronological order, so the ordinal is simply
  // "everything before this week" plus this session's index within it.
  const priorSessions = d.priorSessions
  const rpeById = new Map(d.rpe.map((r) => [r.id, r.session_rpe]))
  const axesFor = axesBySession(d.prAxes)
  return d.sessions.map((s, sessionIndex) => {
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
        // Rest is a target, and the override that changes it lives in
        // localStorage — never in the database. This hook runs client-side, so
        // it can read both without a column or a migration. The export prints
        // the pair only when they disagree.
        restTargetSec: restTargetFor(r.exercises.name, s.day_key),
        restPlanSec: programRestSec(r.exercises.name, s.day_key),
      }
      e.sets.push({
        weightKg: r.weight_kg, reps: r.reps,
        // numeric(3,1) can arrive as a string; coerce once, and keep the
        // null — it is the difference between "felt easy" and "never rated".
        rpe: r.rpe != null && Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
        side: r.side === 'L' || r.side === 'R' ? r.side : null,
        failure: r.set_type === 'failure',
        warmup: r.set_type === 'warmup',
        /* ── THE THREE FIELDS THAT WERE SELECTED AND THEN DROPPED ─────────────
           `quality` has been in the SELECT and on `RawSet` since set tagging
           shipped, and it stopped here: the renderer reads `s.quality` through
           `SET_QUALITY` and prints "(RPE 9.5 — Very hard, momentum)" perfectly,
           and never once received one. Identical in shape to the `blood_oxygen`
           bug the export's own header documents — the column, the query and the
           reader all existed, and only the assignment was missing.

           `ghost` and `dropset` were never mapped either. Both are latent
           rather than live (no row carries either tag yet), and both fail in
           the direction that matters: a ghost is a set that did NOT happen and
           would have taken a numbered `Set N:` line as work, which is precisely
           what `ExportSet.ghost` was added to prevent. */
        ghost: r.set_type === 'ghost',
        dropset: r.set_type === 'dropset',
        quality: isSetQuality(r.quality) ? r.quality : null,
        pairId: r.pair_id,
      })
      // Warm-ups must not define the top load.
      if (isWorkingSet(r.set_type)) e.topKg = Math.max(e.topKg ?? 0, r.weight_kg) || null
      byName.set(r.exercises.name, e)
    }
    // Per-set volume CREDIT for every row, from the engine that owns the rule.
    // Indexed by row id because `dedupePrs` reorders and filters what follows.
    const credits = volumeCredits(mine.map((r) => ({
      weightKg: r.weight_kg, reps: r.reps, pairId: r.pair_id, side: r.side,
    })))
    const creditByRow = new Map(mine.map((r, i) => [r.id, credits[i]]))

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
          // Warm-ups still count here, as the comment above says. A GHOST does
          // not: it is a set that was not performed, and `sessionVolumeKg` is
          // now the place that knows the difference.
          setType: r.set_type,
        })))
      : s.total_volume_kg
    return {
      date: s.started_at.slice(0, 10),
      startedAt: s.started_at,
      endedAt: s.ended_at ?? null,
      sessionNumber: priorSessions == null ? null : priorSessions + sessionIndex + 1,
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
        // THE CREDITED TONNAGE, not `weight × reps`.
        //
        // Those differ on exactly the case this export is worst at explaining.
        // A unilateral pair is ONE set scored at the WEAKER side — L 5 kg × 8
        // and R 6 kg × 10 is a 40 kg set, not a 60 kg one — and `volumeCredits`
        // files that collapsed figure on whichever row completes the pair,
        // which is a positional rule and need not be the weaker side. So the
        // `is_pr` row's own product can be the STRONGER side's 60 while the
        // record that was actually set is 40, and printing 60 beside the axis
        // named "Volume" states a number that never entered the ledger.
        //
        // Asking `prEngine` rather than re-deriving it is the rule this file
        // already lives by for session totals (`sessionVolumeKg`): a second
        // implementation of a tonnage rule is a bug waiting for a unilateral
        // movement to set a record.
        volumeKg: creditByRow.get(r.id) ?? null,
        // `||` and not `??` on the stored estimate: unloaded work stores 0, and
        // 0 is a number the report would print as an estimate. `epley1RM`
        // returns null there, which is the honest answer.
        e1rmKg: (r.est_1rm_kg || epley1RM(r.weight_kg, r.reps)) ?? null,
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
      protein_percent: r.protein_pct,
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
      proteinPercent: (r.protein_percent as number | null) ?? null,
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
      setType: r.set_type,
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
export interface GoalRow {
  calorie_goal?: number
  protein_goal_g?: number
  carbs_goal_g?: number
  fat_goal_g?: number
  steps_goal?: number
  sleep_goal_hours?: number
  water_goal_ml?: number
  /** The rung currently selected — `'custom'` when the numbers are hand-set. */
  active_lever?: string | null
  /** The last day a `release` rung applies to. Inert for every other rung. */
  maintenance_until?: string | null
}

/** A user-set weekly landmark for one muscle, on one plan, in one phase. */
interface VolumeTargetRow {
  plan_id: string
  phase: string
  muscle: string
  target_sets: number
}

/**
 * Exported for the tests, which is the only reason it is not module-private.
 *
 * The bug this is now pinned against was a MISSING ARGUMENT — `volumeOverrides`
 * was never passed to `weeklyVolumeByMuscle`, so the export graded a week
 * against the program defaults while the app graded it against the user's own
 * landmarks. Nothing in the type system could see it (the parameter is
 * optional) and no test could reach it (this function was private).
 */
/**
 * Fold the day's MICRONUTRIENTS and its supplement denominator onto each day.
 *
 * ── WHY IT IS NOT IN `toDays` ────────────────────────────────────────────────
 * Both figures need the user's own supplement rows, which `toDays` has no
 * access to and should not: it turns one fetched range into day rows, and the
 * stack is a second source with its own resolution rules (a dose depends on the
 * weekday AND on whether the day trains).
 *
 * ── WHY FOOD AND STACK STAY APART ────────────────────────────────────────────
 * `useTodayNutrients` merges them because the dashboard asks "how much vitamin C
 * today". A raw-data export asks a different question, and 594 mg is not an
 * answer to it when 470 of those milligrams came out of a tablet. The renderer
 * prints the split; this only has to keep it.
 */
function withNutrients(
  days: ExportDay[],
  range: RangeData,
  customs: CustomSupplement[],
): ExportDay[] {
  const nutriByDate = new Map(
    (range.nutrition ?? []).map((r) => [r.date as string, r as Record<string, unknown>]),
  )
  // Only the EXCEPTIONS are stored now. Everything the protocol asked for and
  // this map does not name was taken.
  const skippedByDate = new Map<string, Set<string>>()
  for (const s of range.supps ?? []) {
    if (s.taken !== false) continue
    const bucket = skippedByDate.get(s.date) ?? new Set<string>()
    bucket.add(s.item_key)
    skippedByDate.set(s.date, bucket)
  }
  const payloads = nutrientPayloads(customs)

  return days.map((d) => {
    const nt = nutriByDate.get(d.date)
    // `fiber_g` is a column; every other dietary micro rides in the jsonb.
    const bundle = (nt?.micros ?? {}) as Record<string, number | undefined>
    const nutrientsFood: Record<string, number | undefined> = {
      ...bundle,
      fiber: numOrUndefined(nt?.fiber_g),
      protein: numOrUndefined(nt?.protein_g),
    }

    // WHICH DOSES WERE IN FORCE on that day, not today's. A Train↔Rest swap
    // changes the protocol, so a rest day must not be credited a training-only
    // item — which is also why this resolves per date rather than once.
    const training = d.isTrainingDay
    const weekday = new Date(`${d.date}T12:00:00`).getDay()
    const slots = stackForDate(customSlotsForDate(customs, weekday, training), training, weekday)
    const doses = new Map(slots.flatMap((sl) => sl.items.map((i) => [i.key, i.dose] as const)))

    // ── ADHERENCE, DERIVED FROM THE SCHEDULE ──────────────────────────────
    // The numerator used to be a row count, so it measured logging rather than
    // dosing. It is now the protocol minus what was explicitly dropped, and the
    // times printed are the SCHEDULED ones: half the old `taken_at` stamps were
    // auto-log writes already carrying the slot's own clock time, so the column
    // mixed "when it was swallowed" with "when it was due" and the export
    // printed both as though they were the first.
    const skippedKeys = skippedByDate.get(d.date) ?? new Set<string>()
    const scheduled = slots.flatMap((sl) => sl.items.map((i) => ({ key: i.key, name: i.name, time: sl.time })))
    const takenItems = scheduled.filter((i) => !skippedKeys.has(i.key))
    const nutrientsStack = supplementNutrients(takenItems.map((i) => i.key), doses, payloads)

    return {
      ...d,
      nutrientsFood,
      nutrientsStack,
      supplementsTaken: scheduled.length ? takenItems.length : null,
      supplementsLog: takenItems.map((i) => ({ key: i.key, time: i.time })),
      supplementsSkipped: scheduled.filter((i) => skippedKeys.has(i.key)).map((i) => i.name),
      supplementsPlanned: supplementCountForDate(training, customSlotsForDate(customs, weekday, training)),
    }
  })
}

/** A numeric column that PostgREST may hand back as a string. */
function numOrUndefined(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export function weekPayload(
  weekStart: string,
  range: RangeData,
  goals: GoalRow | null,
  customs: CustomSupplement[],
  phase: ProgramPhase,
  /** Per-muscle set targets the user has overridden — see `plan_phase_volume`. */
  volumeOverrides: Partial<Record<LandmarkMuscle, number>> = {},
  /** This week's `daily_targets` rows — the layer above the rung. */
  dailyTargets: readonly DailyTarget[] = [],
): WeeklyExportInput {
  const days = withNutrients(toDays(weekStart, range), range, customs)
  const sessions = toSessions(range)

  // Weekly volume, same rule as the Weekly Volume card: a full set to the
  // primary movers, SECONDARY_SET_CREDIT to the assistants — and, since the
  // card stopped excluding warm-ups, no warm-up filter here either. The export
  // and the card grade the same week against the same targets; the moment one
  // of them filtered and the other did not, the report and the screen were
  // quietly disagreeing about the week they both described.
  const volumeByMuscle = weeklyVolumeByMuscle(
    range.sets.map((r) => ({
      ...resolveMovers(r.exercises.name, r.exercises.muscle_groups),
      dedupeKey: r.pair_id ?? r.id,
    })),
    phase,
    // THE USER'S OWN LANDMARKS. This third argument was simply never passed —
    // the hook has accepted it since the overrides shipped, and the Command
    // Center passes it, so a target edited in Settings moved the app's grading
    // and left the export grading the same week against the program defaults.
    volumeOverrides,
  ).map((m) => ({
    muscle: m.muscle, sets: m.sets, target: m.target,
    directSets: m.directSets, indirectSets: m.indirectSets,
  }))

  /* ── SORENESS, WITH THE SESSION THAT CAUSED IT ──────────────────────────────
     `source_day_key` names the split ("legs_b"); the program turns it into the
     label a person uses ("Legs B"). The DATE comes from the source session
     where that session is inside this week — which is the common case, soreness
     being a two-to-three day signal — and is simply absent otherwise, so the
     line names the workout without claiming a day it cannot see. */
  const sessionDateById = new Map(range.sessions.map((r) => [r.id, r.started_at.slice(0, 10)]))
  const domsProgram = activeProgram()
  const doms: ExportDoms[] = range.doms
    .map((r) => ({
      date: r.date, muscle: r.muscle_group, severity: r.severity,
      sourceLabel: r.source_day_key
        ? domsProgram.days.find((x) => x.key === r.source_day_key)?.label ?? r.source_day_key
        : null,
      sourceDate: r.source_session_id ? sessionDateById.get(r.source_session_id) ?? null : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.muscle.localeCompare(b.muscle))

  // Sorted by date, then by SLOT ORDER rather than alphabetically — "eod,
  // evening, morning, noon" is the order a string sort gives and the reverse of
  // the day it describes.
  // `?? []` because a caller may predate the field — the ten export-payload
  // fixtures do, and a payload builder that throws on an absent optional array
  // is more fragile than the data it is defending against.
  const fatigue: ExportFatigue[] = (range.fatigue ?? [])
    .filter((r) => (FATIGUE_SLOTS as readonly string[]).includes(r.slot))
    // Sorted on the KEY before the label is applied. Sorting the rendered label
    // gives "End of day, Evening, Morning, Noon" — alphabetical, and very nearly
    // the reverse of the day it describes.
    .sort((a, b) => a.date.localeCompare(b.date)
      || FATIGUE_SLOTS.indexOf(a.slot as FatigueSlot) - FATIGUE_SLOTS.indexOf(b.slot as FatigueSlot))
    .map((r) => ({
      date: r.date,
      slot: SLOT_LABEL[r.slot as FatigueSlot],
      level: r.level,
      label: fatigueLevel(r.level)?.label ?? String(r.level),
    }))

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
    waterGoalMl: goals?.water_goal_ml ?? null,
    // The phase the week was RUN in, named. `programLabel` above already bakes
    // it into a title ("Helix Cut"), which is a name rather than a statement.
    //
    // A maintenance week is NOT a phase and never appears here — it is a lever,
    // and `targetPeriods` below is where it shows up, which is the axis it
    // actually moves. See `levers.ts`.
    phaseLabel: phase === 'bulk' ? 'Bulk' : 'Cut',
    /**
     * WHICH TARGETS WERE IN FORCE, DAY BY DAY.
     *
     * The four fields above are the goal row as it stands NOW. That is the
     * right answer for today and the wrong one for any finished day in a week
     * where a lever moved: pulling Lever 1 on a Wednesday does not retroactively
     * re-mark Sunday, and printing one figure for the whole week said it did.
     *
     * `leverForDate` has always known better — the past belongs to
     * `LEVER_SCHEDULE`, today onward to the current selection — and nothing in
     * the export had ever asked it.
     *
     * ── AND THE FALLBACK IS ONLY GOOD FOR THE OPEN STRETCH ────────────────────
     * Resolving the RUNG per day was half the job. `custom` carries no numbers,
     * so every `custom` day fell through to the goal row as it stands now —
     * which is how Week 6 (23–29 Aug) printed `Custom — 1955 kcal` for seven
     * days eaten at 1,999. `goalsForDate`, inside `leverPeriods`, now answers a
     * closed `custom` stretch from `LEVER_SCHEDULE` and reaches this fallback
     * only for the stretch still being lived in.
     */
    targetPeriods: leverPeriods(
      days.map((d) => d.date),
      activeLeverOf(goals),
      logicalTodayISO(),
      {
        calorie: goals?.calorie_goal ?? 0,
        protein: goals?.protein_goal_g ?? null,
        carbs: goals?.carbs_goal_g ?? null,
        fat: goals?.fat_goal_g ?? null,
        steps: goals?.steps_goal ?? null,
      },
      { releaseEndsOn: goals?.maintenance_until ?? null, dailyTargets },
    ),
    days, sessions, volumeByMuscle, doms, fatigue,
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
    // ── ONE WEEK, NOT TWO (2026-08-19) ──
    // This used to fetch the previous week in full as well — ~28 round trips —
    // and append its complete export at the bottom as AI context. The context
    // was real; the price was two hundred set rows of a week that had already
    // been reported on, ahead of the trend ledger that says the same thing in
    // six numbers per week. The prior week's REPORT is pasted alongside by hand
    // now, and the payload closes with a line saying so.
    //
    // Still gated: ~14 round trips is not free, and this used to run the moment
    // a week capsule expanded. See `useSentinelExport` for the other half.
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const [cur, ledger, goalsRes, customsRes, volRes, dailyRes] = await Promise.all([
        fetchRange(weekStart, weekEnd),
        // Week 0 to the exported week — the whole programme, five selects. THIS
        // is where the direction lives now that the previous week is not
        // embedded: a series beats a neighbour for seeing a trend, and it costs
        // one narrow query set rather than a second full week.
        fetchTrendLedger(weekStartOf(WEEK0_START), weekStart),
        // `active_lever` and the two macro columns are new here. Without them
        // the export could not say which RUNG a week was eaten against, only
        // what the goal row happens to hold today — see `leverPeriods`.
        supabase.from('user_goals')
          .select('calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, steps_goal, sleep_goal_hours, water_goal_ml, active_lever, maintenance_until')
          .maybeSingle(),
        supabase.from('custom_supplements').select('id, name, dose, color, form, time, schedule, micros'),
        // The user's OWN per-muscle set targets. The Command Center has applied
        // these since they shipped; the export did not, so the two graded the
        // same week against different landmarks the moment one was set.
        supabase.from('plan_phase_volume').select('plan_id, phase, muscle, target_sets'),
        // Per-day target overrides. The scorer and the widget have resolved
        // through this layer since it shipped and the export did not, so a
        // restaurant Tuesday was graded at 2,400 and reported at 1,955.
        supabase.from('daily_targets').select(DAILY_TARGET_COLUMNS)
          .gte('date', weekStart).lte('date', weekEnd),
      ])
      const customs = (customsRes.error ? [] : (customsRes.data ?? [])) as CustomSupplement[]
      const goals = goalsRes.data as GoalRow | null
      // A missing table is not an error — no rows means no day was overridden.
      const dailyTargets = (dailyRes.error ? [] : (dailyRes.data ?? [])) as unknown as DailyTarget[]
      /**
       * THE PHASE THE WEEK WAS RUN IN, not the one selected today.
       *
       * This read `activePhase()` — a localStorage mirror of the CURRENT
       * selection — and stamped it onto whatever week you exported, so
       * re-exporting a finished cut week after switching to a bulk labelled it
       * "Helix Bulk" and graded its volume against bulk landmarks. Same bug
       * class as the target line above, on the other axis.
       *
       * `PHASES` is the dated record, so ask it. `peak` and `deload` blocks are
       * not training prescriptions — they run the cut's deck (`forPhase` only
       * branches on `cut`), so they resolve to `cut` here.
       */
      const phase: ProgramPhase = getWeekPhase(weekStart)?.kind === 'bulk' ? 'bulk' : 'cut'

      // Overrides for THIS plan and phase only. A missing table is not an
      // error here: no rows simply means the program's own landmarks stand.
      const volumeOverrides: Partial<Record<LandmarkMuscle, number>> = {}
      if (!volRes.error) {
        const planId = activeProgram().id
        for (const r of (volRes.data ?? []) as unknown as VolumeTargetRow[]) {
          if (r.plan_id !== planId || r.phase !== phase) continue
          volumeOverrides[r.muscle as LandmarkMuscle] = r.target_sets
        }
      }

      return buildWeeklyExport({
        ...weekPayload(weekStart, cur, goals, customs, phase, volumeOverrides, dailyTargets),
        ledger,
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
