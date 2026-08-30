/**
 * Is this date inside a planned maintenance / deload week?
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 * Two independent things in this codebase already claim to know the answer, and
 * nothing connected them:
 *
 *   · the LEVER axis — `leverForDate(date, …) === 'maintenance-week'`, which is
 *     what the nutrition targets, the scorer and the export all resolve against;
 *   · the PHASE axis — `phaseSpanFor(date).def.kind === 'deload'`, which is
 *     what the timeline chips, the era filter and the body-composition dead band
 *     read.
 *
 * `LEVER_SCHEDULE` used to carry a comment asking whoever edited it to keep a
 * row in sync with `PHASES` by hand, which is a rule enforced by nobody. The two
 * axes had already disagreed once — the timeline showed a maintenance week while
 * the goals, the score and the export still ran the cut's numbers.
 *
 * ── AND THE DUPLICATE IS NOW DELETED (2026-08-30) ────────────────────────────
 * The one-week `Maintenance Week` row in `PHASES` is gone: the lever owns that
 * week outright, and the phase kind it used has been renamed `deload` to say
 * what the axis actually holds. So the two axes can no longer describe the SAME
 * week in two places. What remains here is a genuine union of two different
 * things — a nutrition rung you pull, and the historical training deloads (the
 * Thailand trip, the Transition block) that predate levers entirely.
 *
 * Every surface that wants to soften a grade, tint a chart band or print a tag
 * asks THIS function instead of picking an axis and hoping.
 *
 * ── WHICH AXIS WINS ──────────────────────────────────────────────────────────
 * The lever, when it has an opinion. It is the axis with a live user selection
 * behind it (the Settings toggle) and the one the numbers are actually graded
 * against, so a week you pulled today counts immediately even though `PHASES` is
 * a compiled constant that cannot know about it. The phase is the fallback: it
 * covers the historical deloads (the Thailand trip, the Transition block) that
 * predate levers entirely and have no schedule rows.
 *
 * Pure and server-safe — no `'use client'`, because `computeForDate` imports it.
 * `todayISO` is a parameter for the same reason it is one on `leverForDate`: a
 * clock read in here would make the same week render differently tomorrow.
 */

import { leverForDate } from './levers'
import { phaseSpanFor } from '@/lib/phases'
import { isoAddDays } from '@/lib/utils/week'

/** How much of the workout drain budget a maintenance day may spend. */
export const MAINTENANCE_DRAIN_FACTOR = 0.75

/**
 * The lever selection, bounded by its end date. One call, so the `maintenance_until`
 * argument cannot be forgotten by half the callers.
 */
export function maintenanceLeverOn(
  dateISO: string,
  storedLeverId: string | null | undefined,
  maintenanceUntil: string | null | undefined,
  todayISO: string,
): boolean {
  return leverForDate(dateISO, storedLeverId, todayISO, maintenanceUntil) === 'maintenance-week'
}

/** Is `dateISO` a planned maintenance / deload day? Lever first, phase as fallback. */
export function isMaintenanceDate(
  dateISO: string,
  storedLeverId: string | null | undefined,
  maintenanceUntil: string | null | undefined,
  todayISO: string,
): boolean {
  if (maintenanceLeverOn(dateISO, storedLeverId, maintenanceUntil, todayISO)) return true
  return phaseSpanFor(dateISO)?.def.kind === 'deload'
}

/**
 * The inclusive span of the maintenance block containing `dateISO`, or null.
 *
 * Charts need a band, not a predicate — a `ReferenceArea` is drawn once from a
 * start to an end, and asking `isMaintenanceDate` per point would give you the
 * dots but no shaded region behind them.
 *
 * Answered from `PHASES` only. The phase is the thing with a declared LENGTH; a
 * lever selection knows when it started and, at best, when it is meant to stop,
 * and drawing a band out to a date the user may still move would paint the
 * future as though it had already happened.
 */
export function maintenanceSpanFor(dateISO: string): { start: string; end: string } | null {
  const span = phaseSpanFor(dateISO)
  if (!span || span.def.kind !== 'deload') return null
  return { start: span.start, end: isoAddDays(span.start, span.def.weeks * 7 - 1) }
}

/**
 * Every maintenance span touching a run of dates, as inclusive `[start, end]`
 * pairs clamped to the dates actually present.
 *
 * Clamping matters: a chart's x-axis is a list of the points it HAS, and a band
 * drawn to a phase boundary that falls outside them lands nowhere. The returned
 * bounds are always values from `dates`, which is what Recharts needs for a
 * `ReferenceArea` on a categorical axis.
 */
export function maintenanceBands(dates: readonly string[]): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = []
  // Keyed on the SPAN's own start, not on the previous date — two maintenance
  // blocks separated by a cut must not merge into one band just because every
  // date between them happened to be adjacent in the array.
  let openSpan: string | null = null
  for (const date of dates) {
    const span = maintenanceSpanFor(date)
    if (!span) { openSpan = null; continue }
    if (openSpan === span.start && out.length) { out[out.length - 1].end = date; continue }
    openSpan = span.start
    out.push({ start: date, end: date })
  }
  return out
}
