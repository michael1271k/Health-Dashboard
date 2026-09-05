/**
 * The chart series builders — the golden source for
 * `HelixCore/Charts/Series.swift` (Phase 2 §6.5).
 *
 * Four questions the screens ask of the ledger, answered once each:
 *
 *  - `exerciseTrend`        the per-session headline of one lift (mean est-1RM,
 *                           or mean reps/seconds for unloaded work), with the
 *                           progression verdict beside it;
 *  - `sessionVolumeSeries`  tonnage per day for one split (or all of them);
 *  - `macroAdherenceSeries` seven dots — hit, miss, exception, untracked;
 *  - `vitalSeries`          a 7- or 30-day window of one reading, padded.
 *
 * `exerciseTrend` is the pure core of `useSessionTrends`, lifted out so the
 * Swift twin has something to replay; the hook now calls it. Nothing here
 * reads a store or a clock: dates arrive as ISO strings and `endingOn` is the
 * caller's "today".
 */

import { epley1RM } from '@/lib/utils/epley'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import {
  progressionVerdict, timedProgressionVerdict, workLoads, type ProgressionVerdict, type WorkingSet,
} from '@/lib/training/ceilings'
import { resolveChartSplit, type ChartSplit } from '@/lib/charts/volumeSplit'
import { dailySeries, paddedWindow, type PaddedPoint } from '@/lib/widget/derive'
import type { TrendPoint } from '@/lib/widget/snapshot'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'

// ── Estimated 1RM per session ────────────────────────────────────────────────

/** One working set as the trend reads it. `est` is the STORED estimate. */
export interface TrendSetRow {
  weightKg: number
  reps: number
  est?: number | null
  side?: string | null
  pairId?: string | null
}

export interface ExerciseTrend {
  /**
   * Per-session headline, oldest → newest: the MEAN across that session's
   * working sets (one decimal). For a loaded lift that is mean est-1RM (kg);
   * for a timed hold, mean hold (seconds); for unloaded work, mean reps.
   *
   * ── WHY THE MEAN AND NOT THE BEST SET ───────────────────────────────────────
   * On a double-progression program a max is a curve that stops moving: the
   * top set reaches the ceiling first and then holds there while the remaining
   * sets climb toward it. Five sessions each better than the last drew as a
   * dead flat line. The mean moves when any set moves.
   */
  points: number[]
  /** % change from the previous session's headline to this one. */
  pctChange: number | null
  /** All-time best SET (kg loaded, seconds timed, reps unloaded). */
  best: number
  /** Latest session's total working volume (kg loaded · reps/seconds otherwise). */
  tonnage: number
  tonnageDelta: number | null
  topSet: WorkingSet | null
  /** How many of the latest session's sets AT THE TOP LOAD reached the ceiling. */
  setsAtCeiling: number
  progression: ProgressionVerdict
  timed: boolean
  /** True when `points`/`tonnage` are reps or seconds rather than kg. */
  byReps: boolean
}

/**
 * How many sets AT THE TOP LOAD reached the ceiling — the "2/3 @ 12" chip.
 * Counting every set whose reps met the number credited back-off sets as if
 * they were at the load being chased.
 */
export function setsAtCeilingOf(sets: readonly WorkingSet[], ceiling: number | null): number {
  if (ceiling == null) return 0
  const work = workLoads([...sets])
  if (!work.length) return 0
  const top = Math.max(...work.map((s) => s.weightKg))
  return work.filter((s) => s.weightKg === top && s.reps >= ceiling).length
}

/**
 * A unilateral exercise logs L + R as two rows sharing a pair_id. For
 * progression they are ONE set: differing L/R loads would otherwise trip the
 * "single top weight" gate and never clear. The RIGHT side leads (it sets the
 * rep count), falling back to the higher-rep side.
 */
export function collapsePairs<T extends TrendSetRow>(sets: readonly T[]): T[] {
  const pairs = new Map<string, T[]>()
  const out: T[] = []
  for (const s of sets) {
    if (!s.pairId) { out.push(s); continue }
    const g = pairs.get(s.pairId) ?? []
    g.push(s); pairs.set(s.pairId, g)
  }
  for (const g of pairs.values()) {
    out.push(g.find((s) => s.side === 'R') ?? g.reduce((m, s) => (s.reps > m.reps ? s : m), g[0]))
  }
  return out
}

/**
 * The trend of one exercise over its sessions, oldest FIRST, working sets
 * only (the caller drops warm-ups). Null when there are no sessions.
 *
 * Unloaded work (no session ever carried load) is scored on reps, the axis it
 * actually progresses on — checked across the WHOLE history so an exercise
 * that later gets loaded switches to est-1RM rather than plotting two units
 * on one axis. A stored est-1RM wins over the Epley fallback (`||`, so a
 * stored 0 on a legacy row is "missing").
 */
export function exerciseTrend(
  sessions: readonly (readonly TrendSetRow[])[],
  timed: boolean,
  ceiling: number | null,
): ExerciseTrend | null {
  if (!sessions.length) return null
  const unloaded = !timed && sessions.every((sets) => sets.every((s) => !(s.weightKg > 0)))
  const byReps = timed || unloaded

  const headline = (s: TrendSetRow) => (byReps ? s.reps : (s.est || epley1RM(s.weightKg, s.reps) || 0))
  const bestOf = (sets: readonly TrendSetRow[]) => sets.reduce((m, s) => Math.max(m, headline(s)), 0)
  const meanOf = (sets: readonly TrendSetRow[]) => {
    const one = collapsePairs(sets)
    if (!one.length) return 0
    return one.reduce((sum, s) => sum + headline(s), 0) / one.length
  }
  const tonnageOf = (sets: readonly TrendSetRow[]) =>
    Math.round(byReps
      ? collapsePairs(sets).reduce((s, x) => s + x.reps, 0)
      : sessionVolumeKg(sets.map((x) => ({
          weightKg: x.weightKg, reps: x.reps,
          side: x.side === 'L' || x.side === 'R' ? x.side : null, pairId: x.pairId ?? null,
        }))))
  const asWorking = (sets: readonly TrendSetRow[]): WorkingSet[] =>
    collapsePairs(sets).map((s) => ({ weightKg: s.weightKg, reps: s.reps }))

  // One decimal: reps and seconds are whole PER SET, but a mean over three of
  // them is not, and rounding "14, 13, 13" to a flat 13 loses the movement.
  const points = sessions.map((sets) => Math.round(meanOf(sets) * 10) / 10)
  const cur = points[points.length - 1]
  const prev = points.length >= 2 ? points[points.length - 2] : null
  const latestSets = sessions[sessions.length - 1]
  const prevSets = sessions.length >= 2 ? sessions[sessions.length - 2] : null

  const topSet = latestSets.reduce<TrendSetRow | null>(
    (best, s) => (!best || headline(s) > headline(best) ? s : best), null,
  )
  const tonnage = tonnageOf(latestSets)

  return {
    points,
    pctChange: prev && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
    best: Math.max(...sessions.map(bestOf)),
    tonnage,
    tonnageDelta: prevSets ? tonnage - tonnageOf(prevSets) : null,
    topSet: topSet ? { weightKg: topSet.weightKg, reps: topSet.reps } : null,
    setsAtCeiling: setsAtCeilingOf(asWorking(latestSets), ceiling),
    progression: (timed ? timedProgressionVerdict : progressionVerdict)(
      prevSets ? [asWorking(prevSets), asWorking(latestSets)] : [asWorking(latestSets)],
      ceiling,
    ),
    timed,
    byReps,
  }
}

// ── Session volume by split ──────────────────────────────────────────────────

export interface VolumeSession {
  date: string
  /** `workout_sessions.day_key` — what was PERFORMED. */
  dayKey?: string | null
  /** The legacy `split_day` column, for rows written before `day_key`. */
  split?: string | null
  volumeKg: number | null
}

/**
 * Tonnage per day for one chart split (`null` = every session), newest
 * `limit` days, oldest first. Two sessions on one day add up; days with no
 * session are omitted (see `dailySeries`) — pad with `paddedWindow` for a
 * fixed axis.
 */
export function sessionVolumeSeries(
  sessions: readonly VolumeSession[],
  splitDay: ChartSplit | null,
  era: 'all' | 'ppl' | 'axis',
  limit: number,
): TrendPoint[] {
  const rows = sessions
    .filter((s) => splitDay == null || resolveChartSplit(s.date, s.split ?? '', era, s.dayKey) === splitDay)
    .map((s) => ({ date: s.date, value: s.volumeKg }))
  return dailySeries(rows, { limit, combine: 'sum' })
}

// ── Macro adherence, seven days ──────────────────────────────────────────────

export interface AdherenceDayIn {
  date: string
  kcal?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatG?: number | null
  /** `daily_logs.nutrition_exception`, verbatim. */
  exception?: string | null
  estimated?: boolean | null
}

/** What the day was graded against — `ResolvedTargets` for that date. */
export interface AdherenceTargets {
  kcal: number
  protein: number | null
  carbs: number | null
  fat: number | null
}

/**
 * `untracked` nothing logged (no kcal, or 0) · `ungraded` logged but no target ·
 * `exception` a declared exception day (graded on protein only, and drawn
 * in its own colour rather than as a hit or a miss) · `hit` · `miss`.
 */
export type AdherenceVerdict = 'untracked' | 'ungraded' | 'exception' | 'hit' | 'miss'

export interface AdherenceDay {
  date: string
  verdict: AdherenceVerdict
  /** intake ÷ target × 100, one decimal; null without both. */
  kcalPct: number | null
  proteinPct: number | null
  carbsPct: number | null
  fatPct: number | null
  estimated: boolean
}

/** A day within this much of its calorie target is a hit (`coach/insights`). */
export const ADHERENCE_TOLERANCE_PCT = 10

const pctOf = (intake: number | null | undefined, target: number | null): number | null =>
  intake != null && target != null && target > 0 ? Math.round((intake / target) * 1000) / 10 : null

/**
 * The seven dots (or `limit` of them) ending on `endingOn`, oldest first,
 * every date present. A hit is calories within ±10 % of target AND protein
 * at least 90 % of its target when one is set; an exception day is a hit on
 * protein alone. `targets` is keyed by date — the day is graded against the
 * rung in force ON THAT DATE, not today's.
 */
export function macroAdherenceSeries(
  days: readonly AdherenceDayIn[],
  targets: Readonly<Record<string, AdherenceTargets | null | undefined>>,
  endingOn: string,
  limit = 7,
): AdherenceDay[] {
  const byDate = new Map(days.map((d) => [d.date, d] as const))
  return paddedWindow([], endingOn, limit).map(({ date }) => {
    const day = byDate.get(date)
    const t = targets[date] ?? null
    const kcalPct = pctOf(day?.kcal, t?.kcal ?? null)
    const proteinPct = pctOf(day?.proteinG, t?.protein ?? null)
    const base = {
      date,
      kcalPct,
      proteinPct,
      carbsPct: pctOf(day?.carbsG, t?.carbs ?? null),
      fatPct: pctOf(day?.fatG, t?.fat ?? null),
      estimated: day?.estimated === true,
    }
    // `<= 0` is nothing logged, as `computeNutritionScore` reads it.
    if (day?.kcal == null || !(day.kcal > 0)) return { ...base, verdict: 'untracked' }
    if (isExceptionDay(day.exception)) return { ...base, verdict: 'exception' }
    if (kcalPct == null) return { ...base, verdict: 'ungraded' }
    const kcalHit = Math.abs(kcalPct - 100) <= ADHERENCE_TOLERANCE_PCT
    const proteinHit = proteinPct == null || proteinPct >= 100 - ADHERENCE_TOLERANCE_PCT
    return { ...base, verdict: kcalHit && proteinHit ? 'hit' : 'miss' }
  })
}

// ── Vitals ───────────────────────────────────────────────────────────────────

/** `max` for readings (a re-sync must not double a heart rate), `sum` for quantities. */
export type VitalCombine = 'max' | 'sum'

export interface VitalSeries {
  /** Exactly `days` buckets ending on `endingOn`; `value` null where nothing landed. */
  points: PaddedPoint[]
  latest: number | null
  /** Movement from the newest reading that DIFFERS (≥ 0.05), two decimals. */
  delta: number | null
  /** Mean of the readings in the window, one decimal. */
  mean: number | null
  /** Days in the window with a reading. */
  coverage: number
}

/**
 * One vital over a 7- or 30-day window. Days outside the window are dropped,
 * never folded onto its edge; a missing day is a gap, never a zero.
 */
export function vitalSeries(
  rows: ReadonlyArray<{ date: string; value: number | null | undefined }>,
  days: number,
  endingOn: string,
  combine: VitalCombine,
): VitalSeries {
  // No `limit` clamp before the window: a reading dated after `endingOn` must
  // not push a real day out of the newest-N slice.
  const points = paddedWindow(dailySeries(rows, { limit: rows.length, combine }), endingOn, days)
  const real = points.filter((p): p is { date: string; value: number } => p.value != null)
  const latest = real.length ? real[real.length - 1].value : null
  const previous = latest == null ? undefined : [...real].reverse().find((p) => Math.abs(p.value - latest) >= 0.05)
  return {
    points,
    latest,
    delta: latest != null && previous ? Math.round((latest - previous.value) * 100) / 100 : null,
    mean: real.length ? Math.round((real.reduce((s, p) => s + p.value, 0) / real.length) * 10) / 10 : null,
    coverage: real.length,
  }
}
