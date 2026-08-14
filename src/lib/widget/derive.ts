import { epley1RM } from '@/lib/utils/epley'
import { prFloorFor } from '@/lib/training/prTruth'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { toLandmarkMuscle, SECONDARY_SET_CREDIT } from '@/lib/training/landmarks'
import { familyOf, type MuscleFamily } from '@/lib/theme/muscleHue'
import type { TrendPoint, WidgetE1rm, WidgetFamilyVolume, WidgetRecord } from '@/lib/widget/snapshot'

/**
 * The arithmetic behind the widget payload — pure, so it can be tested without
 * a database and reused without a route.
 *
 * ── SERVER-SAFE OR NOTHING ───────────────────────────────────────────────────
 * Everything imported here is framework-free. `/api/widget/snapshot` returned
 * **500 on every request it ever served** because of one `'use client'` import
 * (see `src/tests/route-client-boundary.test.ts`), and the tempting helper for
 * the 1RM collapse below — `collapseToSessionBest` — lives in `useCharts.ts`,
 * which is exactly such a module. It is reimplemented here rather than imported.
 *
 * ── AND NULL, NEVER ZERO ─────────────────────────────────────────────────────
 * `snapshot.ts` states the contract: a widget rendering "—" is correct, one
 * rendering an invented number is not. Every function here omits an entry it
 * cannot compute instead of emitting a zero for it.
 */

// ── Trends ───────────────────────────────────────────────────────────────────

/**
 * A dated series, oldest first, with the gaps left as gaps.
 *
 * A widget sparkline is drawn from the points it is given; interpolating a
 * missing weigh-in would draw a line through a day that was never measured, and
 * the whole point of the fortnight trace is to show what the scale actually
 * said.
 */
export function trendPoints(
  rows: ReadonlyArray<{ date: string; value: number | null | undefined }>,
  limit: number,
): TrendPoint[] {
  const clean = rows
    .filter((r): r is { date: string; value: number } => typeof r.value === 'number' && Number.isFinite(r.value))
    // Rounded to two places: a bodyweight scale reports 0.05 kg and a step count
    // is an integer, so nothing here needs more, and every digit is bytes over
    // the wire into a memory-capped extension.
    .map((r) => ({ d: r.date, v: Math.round(r.value * 100) / 100 }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return clean.slice(Math.max(0, clean.length - limit))
}

/**
 * The mean over a half-open date window `[from, to)`, or null when the window
 * is empty.
 *
 * Null rather than zero is load-bearing: this is the dotted baseline the weight
 * trendline is compared against, and a baseline of 0 kg would draw the whole
 * fortnight as a catastrophic gain.
 */
export function meanBetween(
  points: ReadonlyArray<TrendPoint>,
  fromISO: string,
  toISO: string,
): number | null {
  const inWindow = points.filter((p) => p.d >= fromISO && p.d < toISO)
  if (!inWindow.length) return null
  const sum = inWindow.reduce((s, p) => s + p.v, 0)
  return Math.round((sum / inWindow.length) * 100) / 100
}

// ── Records ──────────────────────────────────────────────────────────────────

/** One row of the `personal_records` ledger, as the route selects it. */
export interface LedgerRow {
  exercise_key: string
  axis: string
  value: number | null
  reps: number | null
  achieved_on: string | null
}

const AXIS_FLOOR_KEY: Record<string, 'weight' | 'e1rm' | 'volume' | 'reps'> = {
  weight: 'weight', e1rm: 'e1rm', volume: 'volume', reps: 'reps',
}

/**
 * The most recent genuine records, newest first.
 *
 * ── WHY THE LEDGER ALONE IS NOT ENOUGH ───────────────────────────────────────
 * 75 of the logged sessions are Notion-era and carry **zero sets**, so Helix's
 * own history cannot see the bests set before 2026-07-16. `personal_records`
 * holds what Helix has detected; `prFloorFor` holds what the asserted book knows
 * it cannot have detected. A ledger row below its floor is not a personal
 * record — it is a Helix-era best that the pre-Helix book already beats — and
 * announcing it on a home screen as a PR is the widget lying about the one thing
 * it exists to celebrate.
 *
 * Such rows are dropped rather than clamped. Clamping would put the asserted
 * number under today's date, which invents an achievement that never happened.
 */
export function topRecords(rows: readonly LedgerRow[], limit = 3): WidgetRecord[] {
  return rows
    .filter((r) => r.value != null && Number.isFinite(r.value) && r.achieved_on != null)
    .filter((r) => {
      const key = AXIS_FLOOR_KEY[r.axis]
      if (!key) return true                       // an axis with no asserted book
      const floor = prFloorFor(r.exercise_key)?.[key]
      return floor == null || (r.value as number) >= floor
    })
    .sort((a, b) => (a.achieved_on! < b.achieved_on! ? 1 : a.achieved_on! > b.achieved_on! ? -1 : 0))
    .slice(0, limit)
    .map((r) => ({
      exercise: r.exercise_key,
      axis: r.axis,
      value: Math.round((r.value as number) * 100) / 100,
      reps: r.reps ?? null,
      achievedOn: r.achieved_on as string,
    }))
}

// ── Estimated 1RM ────────────────────────────────────────────────────────────

/** One working set, joined to the exercise's display name and its session day. */
export interface SetRow {
  exercise: string
  day: string
  weightKg: number | null
  reps: number | null
  /** The stored estimate, which is `0` — not null — for unloaded work. */
  est1rmKg?: number | null
  setType?: string | null
}

/**
 * Current estimated 1RM per lift, and how far it has moved over a window.
 *
 * ── THE COLLAPSE IS NOT OPTIONAL ─────────────────────────────────────────────
 * A session is a top set followed by back-offs. Reading each set as its own
 * point makes every workout look like a collapse in strength halfway through,
 * so a lift's series must be the per-DAY maximum, not the per-set value.
 *
 * ── AND `est_1rm_kg` IS ZERO, NOT NULL, FOR UNLOADED WORK ────────────────────
 * A Plank or a Pull-Up stores a literal `0`. `?? epley` would therefore keep the
 * zero; `|| epley` falls through to the estimate, which itself returns null at
 * zero load. Either way an unloaded lift has no 1RM and is dropped — a one-rep
 * max is not a fact about a movement you do fifteen of.
 */
export function e1rmTrends(
  sets: readonly SetRow[],
  opts: { asOf: string; windowDays?: number; limit?: number },
): WidgetE1rm[] {
  const windowDays = opts.windowDays ?? 28
  const cutoff = shiftISO(opts.asOf, -windowDays)

  // exercise → day → best estimate that day
  const byExercise = new Map<string, Map<string, number>>()
  for (const s of sets) {
    if (s.setType === 'warmup') continue
    const est = (s.est1rmKg && s.est1rmKg > 0 ? s.est1rmKg : null)
      ?? epley1RM(s.weightKg ?? 0, s.reps ?? 0)
    if (est == null || !(est > 0)) continue
    let days = byExercise.get(s.exercise)
    if (!days) { days = new Map(); byExercise.set(s.exercise, days) }
    days.set(s.day, Math.max(days.get(s.day) ?? 0, est))
  }

  const out: Array<WidgetE1rm & { lastDay: string }> = []
  for (const [exercise, days] of byExercise) {
    const sorted = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    const [lastDay, current] = sorted[sorted.length - 1]
    // The most recent session at or before the cutoff — the honest "four weeks
    // ago" reading. A lift trained only inside the window has nothing to compare
    // against and reports a null delta rather than a fabricated +0.
    const baseline = [...sorted].reverse().find(([d]) => d <= cutoff)?.[1] ?? null
    out.push({
      exercise,
      kg: round1(current),
      deltaKg: baseline == null ? null : round1(current - baseline),
      lastDay,
    })
  }

  return out
    // Most recently trained first: a widget shows what you are working on, not
    // what you are best at. Heaviest breaks a same-day tie.
    .sort((a, b) => (a.lastDay === b.lastDay ? b.kg - a.kg : a.lastDay < b.lastDay ? 1 : -1))
    .slice(0, opts.limit ?? 3)
    .map(({ exercise, kg, deltaKg }) => ({ exercise, kg, deltaKg }))
}

// ── Volume by muscle family ──────────────────────────────────────────────────

/**
 * Tonnage and set counts rolled up to the six muscle families.
 *
 * Secondary movers earn **half** credit, primaries full — the app-wide rule
 * (`SECONDARY_SET_CREDIT`), so the widget's bars and the analytics page's cannot
 * disagree. A family named by both lists takes the primary's full share once,
 * never full plus a half.
 *
 * Deliberately NOT graded into volume zones. `volumeZone` measures direct SETS
 * against per-landmark Renaissance-Periodisation targets; there are no targets
 * at family granularity, and inventing them by summing thirteen landmark numbers
 * into six would produce a colour that looks like a verdict and is not one. The
 * bars are scaled against the week's own maximum instead, which is a comparison
 * the data actually supports.
 */
export function volumeByFamily(sets: readonly SetRow[]): WidgetFamilyVolume[] {
  const kg = new Map<MuscleFamily, number>()
  const setCount = new Map<MuscleFamily, number>()

  for (const s of sets) {
    if (s.setType === 'warmup') continue
    const volume = (s.weightKg ?? 0) * (s.reps ?? 0)
    const movers = resolveMovers(s.exercise)
    const families = (tokens: readonly string[]) => {
      const out = new Set<MuscleFamily>()
      for (const t of tokens) {
        const landmark = toLandmarkMuscle(t)
        if (landmark) out.add(familyOf(landmark))
      }
      return out
    }
    const primary = families(movers.primary)
    const secondary = families(movers.secondary)

    const credit = (f: MuscleFamily, share: number) => {
      if (volume > 0) kg.set(f, (kg.get(f) ?? 0) + volume * share)
      setCount.set(f, (setCount.get(f) ?? 0) + share)
    }
    for (const f of primary) credit(f, 1)
    for (const f of secondary) if (!primary.has(f)) credit(f, SECONDARY_SET_CREDIT)
  }

  const families = new Set<MuscleFamily>([...kg.keys(), ...setCount.keys()])
  return [...families]
    .map((family) => ({
      family,
      kg: Math.round(kg.get(family) ?? 0),
      // Half-credit means a family's set count is genuinely fractional; one
      // decimal keeps "3.5 sets" honest instead of rounding it into a lie.
      sets: round1(setCount.get(family) ?? 0),
    }))
    .filter((f) => f.kg > 0 || f.sets > 0)
    .sort((a, b) => b.kg - a.kg || b.sets - a.sets)
}

// ── Small shared helpers ─────────────────────────────────────────────────────

const round1 = (v: number) => Math.round(v * 10) / 10

/** `YYYY-MM-DD` shifted by whole days, midday-anchored to dodge DST. */
export function shiftISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
