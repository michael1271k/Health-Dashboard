import { READINESS, dailyLoads, type ReadinessHistory, type ReadinessSignals } from '@/lib/scoring/readiness'
import { fragmentationRatio } from '@/lib/scoring/stress'
import { nightOf } from '@/lib/sleep/nightWindow'
import type { ExportReadiness } from '@/lib/reports/weeklyExport'

/**
 * The data layer's half of readiness v9 — rows in, a `ReadinessHistory` out.
 *
 * ── ONE SHAPE, TWO CALLERS, TWO PLATFORMS ────────────────────────────────────
 * `computeForDate` (the scorer) and `useWeeklyLoop` (the export) both need the
 * 49-day series behind a date, and the phone's `ReadinessHistoryBuilder`
 * needs the same one. The formulas are vector-proven; what is NOT covered by
 * a vector is how rows become a series — which day a session files under,
 * which of two resting-HR columns wins, whether a missing day is a null or a
 * zero. Those rules live here, once, and `readiness-history.test.ts` pins
 * them so the Swift builder has a written contract to match.
 *
 * SERVER-SAFE: no React, no client module, no clock.
 */

export interface HistoryLogRow { date: string; hrv_ms: number | null; avg_rest_heart_rate: number | null }
export interface HistoryMetricRow { date: string; rest_hr: number | null }
export interface HistorySessionRow { started_at: string; session_rpe: number | null; duration_min: number | null }
export interface HistoryCardioRow { date: string; effort: number | null; duration_min: number | null }
/** A `sleep_sessions` row as the fragmentation series needs it (Phase 3 E3). */
export interface HistoryNightRow {
  start_time: string
  duration_min: number | null
  deep_min: number | null
  rem_min: number | null
  awake_min: number | null
}

export interface HistoryRows {
  logs: readonly HistoryLogRow[]
  metrics: readonly HistoryMetricRow[]
  sessions: readonly HistorySessionRow[]
  cardio: readonly HistoryCardioRow[]
  /**
   * Optional: only the stress index reads the nights, and a caller that does
   * not compute it (the export until E5) need not fetch them. Absent, the
   * fragmentation series is all null and the stress sleep term is neutral.
   */
  nights?: readonly HistoryNightRow[]
}

function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The first day the history reaches back to — what the queries filter on. */
export function historyStart(date: string): string {
  return addDays(date, -(READINESS.historyDays - 1))
}

/** 49 consecutive dates, oldest first, ending on `date`. */
export function historyDates(date: string): string[] {
  const start = historyStart(date)
  return Array.from({ length: READINESS.historyDays }, (_, i) => addDays(start, i))
}

/**
 * Which date a session belongs to: the UTC date of `started_at`, because that
 * is the window `computeForDate` reads the day's own sessions with
 * (`started_at >= date 00:00Z`). The phone files by its local logical day —
 * the two can differ on a session started after local midnight, which is a
 * known, pre-existing seam and not one this module introduces.
 */
export function sessionDateOf(startedAt: string): string {
  return startedAt.slice(0, 10)
}

/**
 * The 49-day series behind a date.
 *
 * Resting HR reads `daily_metrics.rest_hr` first and `daily_logs.
 * avg_rest_heart_rate` second — exactly the rule the scorer uses for the day
 * itself, so the rolling window and its own last entry agree. A day with
 * neither is null; a day with no session is a real zero load.
 */
export function readinessHistoryFor(date: string, rows: HistoryRows): ReadinessHistory {
  const dates = historyDates(date)
  const inWindow = new Set(dates)
  const hrvByDate = new Map<string, number | null>()
  const rhrLog = new Map<string, number | null>()
  for (const r of rows.logs) {
    if (!inWindow.has(r.date)) continue
    hrvByDate.set(r.date, r.hrv_ms)
    rhrLog.set(r.date, r.avg_rest_heart_rate)
  }
  const rhrMetric = new Map<string, number | null>()
  for (const r of rows.metrics) if (inWindow.has(r.date)) rhrMetric.set(r.date, r.rest_hr)

  const loads = dailyLoads(
    dates,
    rows.sessions.map((s) => ({ date: sessionDateOf(s.started_at), sessionRpe: s.session_rpe, durationMin: s.duration_min })),
    rows.cardio.map((c) => ({ date: c.date, effort: c.effort, durationMin: c.duration_min })),
  )

  // ── THE NIGHTS, ONE PER DATE, LONGEST WINS ────────────────────────────────
  // Filed under the morning they ended on (`nightOf`), which is the date the
  // scorer reads them under; where a window holds two rows the longest is the
  // night, as `computeForDate` and `sleepNightStream` already decide.
  const nightByDate = new Map<string, HistoryNightRow>()
  for (const n of rows.nights ?? []) {
    const d = nightOf(n.start_time)
    if (!inWindow.has(d)) continue
    const held = nightByDate.get(d)
    if (!held || (n.duration_min ?? 0) > (held.duration_min ?? 0)) nightByDate.set(d, n)
  }
  const asleepMin = dates.map((d) => {
    const n = nightByDate.get(d)
    return n && n.duration_min != null && n.duration_min > 0 ? n.duration_min : null
  })
  const awakeMin = dates.map((d) => {
    const n = nightByDate.get(d)
    if (!n || n.duration_min == null || n.duration_min <= 0) return null
    // A duration-only row (awake = deep = rem = 0) has no stage data; its
    // zero is an absence, not a still night. `fragmentationRatio` is the rule.
    return fragmentationRatio({ awakeMin: n.awake_min, asleepMin: n.duration_min, deepMin: n.deep_min, remMin: n.rem_min }) == null
      ? null
      : n.awake_min
  })

  return {
    hrv: dates.map((d) => hrvByDate.get(d) ?? null),
    rhr: dates.map((d) => rhrMetric.get(d) ?? rhrLog.get(d) ?? null),
    loads,
    awakeMin,
    asleepMin,
  }
}

/** The signals as the export carries them — the same fields, flat. */
export function flattenReadiness(s: ReadinessSignals): ExportReadiness {
  return {
    hrvZ: s.hrv.z, rhrZ: s.rhr.z,
    load: s.load.today, acute: s.load.acute, chronic: s.load.chronic, acwr: s.load.acwr,
    weeklyLoad: s.load.weeklyLoad, monotony: s.load.monotony, strain: s.load.strain, strainZ: s.load.strainZ,
  }
}
