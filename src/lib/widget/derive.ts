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

/**
 * A dated series where several rows can share a date, rolled up per day.
 *
 * `sum` is right for anything logged in pieces — water arrives one glass at a
 * time — and `max` for anything where the rows are competing readings of one
 * event, which is what two sleep sessions on one night are.
 *
 * Days with no rows are OMITTED, not zeroed, on the same rule as `trendPoints`:
 * a day you forgot to log and a day you drank nothing are different days, and a
 * bar chart is the surface least able to tell them apart once one is drawn as
 * the other.
 */
export function dailySeries(
  rows: ReadonlyArray<{ date: string; value: number | null | undefined }>,
  opts: { limit: number; combine?: 'sum' | 'max' },
): TrendPoint[] {
  const combine = opts.combine ?? 'sum'
  const byDay = new Map<string, number>()
  for (const r of rows) {
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) continue
    const held = byDay.get(r.date)
    byDay.set(r.date, held == null ? r.value : combine === 'max' ? Math.max(held, r.value) : held + r.value)
  }
  return trendPoints([...byDay].map(([date, value]) => ({ date, value })), opts.limit)
}

/**
 * The newest reading of a field and how far it moved from the one before it.
 *
 * ── WHY THE PREVIOUS READING IS NOT SIMPLY THE SECOND ROW ────────────────────
 * `body_composition` carries values forward, so the three most recent rows very
 * often hold the same body-fat percentage — the scale was only stepped on once.
 * Taking row two would report a delta of exactly 0.0 every day between weigh-ins,
 * which reads as "held steady" and is really "not measured since". The previous
 * reading is the newest one that actually DIFFERS, on the same 0.05 rule the
 * weight card already uses, and a field with only one distinct value has no
 * delta at all rather than a zero.
 */
export function latestDelta(
  series: ReadonlyArray<TrendPoint>,
): { value: number | null; delta: number | null } {
  // `series` is oldest-first everywhere else in this file, so newest is the end.
  const latest = series[series.length - 1]
  if (!latest) return { value: null, delta: null }
  const previous = [...series].reverse().find((p) => Math.abs(p.v - latest.v) >= 0.05)
  return {
    value: latest.v,
    delta: previous ? Math.round((latest.v - previous.v) * 100) / 100 : null,
  }
}

// ── The training calendar ────────────────────────────────────────────────────

/** A session, as the calendar needs it. */
export interface CalendarSession { date: string; volumeKg: number | null }

/**
 * Scheduled-vs-logged for a run of days, oldest first.
 *
 * `scheduledFor` is injected rather than imported so this stays pure: the route
 * hands it a closure over `serverScheduleContext`, which is the only correct
 * server-side plan resolver — reading the schedule here would mean reading
 * `localStorage`, which on a server silently answers with the default plan and
 * ignores every swap.
 *
 * A day appears whether or not it was trained. The empty ones are the content:
 * a calendar that only showed sessions would be a list.
 */
export function calendarDays(
  days: readonly string[],
  sessions: readonly CalendarSession[],
  scheduledFor: (dateISO: string) => { dayKey: string | null; scheduled: boolean; label?: string | null },
): Array<{
  d: string; dayKey: string | null; label: string | null
  scheduled: boolean; logged: boolean; volumeKg: number | null
}> {
  // Two sessions on one date SUM. A day with sessions but no recorded volume
  // stays null rather than becoming 0 — "trained, tonnage unknown" and "trained
  // nothing" are different days, and the ring is drawn from `logged` anyway.
  const logged = new Set<string>()
  const volume = new Map<string, number>()
  for (const s of sessions) {
    logged.add(s.date)
    if (typeof s.volumeKg === 'number' && Number.isFinite(s.volumeKg)) {
      volume.set(s.date, (volume.get(s.date) ?? 0) + s.volumeKg)
    }
  }
  return days.map((d) => {
    const { dayKey, scheduled, label } = scheduledFor(d)
    // The plan's own words for that day — "Legs & Core B", not "legs_b". The
    // colour alone cannot name a session, and any face listing days as ROWS
    // rather than as dots needs the name.
    return { d, dayKey, label: label ?? null, scheduled, logged: logged.has(d), volumeKg: volume.get(d) ?? null }
  })
}

// `streakFrom` moved to lib/training/streak.ts. It was the app's only reason to
// import from the widget's payload workshop, and the streak is training domain,
// not serialisation. Re-exported so the payload route's import is unchanged.
export { streakFrom, STREAK_WINDOW_DAYS, type StreakDay } from '@/lib/training/streak'

/**
 * Weekly tonnage, oldest first, `d` set to each week's START date.
 *
 * A week with sessions but no recorded volume contributes 0 rather than being
 * dropped: the gap in a VOLUME series means "trained light", and leaving it out
 * would let the sparkline draw a straight line over a week that happened.
 * A week with no sessions at all is omitted, because that is a real gap.
 */
export function weeklyVolume(
  sessions: ReadonlyArray<{ date: string; volumeKg: number | null }>,
  weekStartOfDate: (dateISO: string) => string,
  limit: number,
): TrendPoint[] {
  const byWeek = new Map<string, number>()
  for (const s of sessions) {
    const w = weekStartOfDate(s.date)
    byWeek.set(w, (byWeek.get(w) ?? 0) + (s.volumeKg ?? 0))
  }
  return trendPoints([...byWeek].map(([d, v]) => ({ date: d, value: v })), limit)
}

// ── Cardio ───────────────────────────────────────────────────────────────────

/** One `cardio_logs` row, as the route selects it. */
export interface CardioRow {
  date: string
  kind: string | null
  distance_m: number | null
  duration_min: number | null
}

/**
 * The cardio block: the last session, and how the week is going against Zone 2.
 *
 * ── THE DEFINITION COMES FROM THE APP, NOT FROM HERE ─────────────────────────
 * `zone2MinMinutes` and `weekTarget` are injected rather than written down,
 * because `useCardio.ts` already owns them (`ZONE2_MIN_MINUTES`,
 * `ZONE2_WEEKLY_TARGET`) and a second copy is a second thing to change. Zone 2
 * in this app is a COUNT OF SESSIONS at or over that minimum — not a minute
 * total — and a widget that showed minutes under the word "Zone 2" would
 * disagree with the pips in the CardioLogger on the same phone.
 *
 * `paceOf` is injected for the same reason: pace is a MINIMUM with a 1 km floor
 * (`lib/cardio/metrics.ts`), and this module must not become the place that
 * rule is reimplemented.
 */
export function cardioBlock(
  rows: readonly CardioRow[],
  opts: {
    today: string
    weekStart: string
    zone2MinMinutes: number
    weekTarget: number
    paceOf: (distanceM: number | null, durationMin: number | null) => number | null
    trendDays: number
  },
): {
  last: {
    kind: string; date: string; distanceM: number | null
    durationMin: number | null; paceMinPerKm: number | null
  } | null
  weekSessions: number
  weekTarget: number
  weekMinutes: number
  trend: TrendPoint[]
} {
  // Newest first. A tie on the date keeps whichever the caller ordered first,
  // which is `created_at` ascending — so the LAST logged session of a day wins.
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const newest = sorted.find((r) => r.date <= opts.today) ?? null

  const thisWeek = rows.filter((r) => r.date >= opts.weekStart && r.date <= opts.today)
  const minutesOf = (r: CardioRow) =>
    typeof r.duration_min === 'number' && Number.isFinite(r.duration_min) ? r.duration_min : 0

  return {
    last: newest
      // A row with no `kind` is still a cardio session; "Cardio" is a truthful
      // fallback where an empty string would render as a missing line.
      ? {
        kind: newest.kind || 'Cardio',
        date: newest.date,
        distanceM: newest.distance_m ?? null,
        durationMin: newest.duration_min ?? null,
        paceMinPerKm: opts.paceOf(newest.distance_m, newest.duration_min),
      }
      : null,
    weekSessions: thisWeek.filter((r) => minutesOf(r) >= opts.zone2MinMinutes).length,
    weekTarget: opts.weekTarget,
    weekMinutes: Math.round(thisWeek.reduce((s, r) => s + minutesOf(r), 0)),
    // Summed per day: two twenty-minute walks are forty minutes of cardio, and
    // a day with none is omitted rather than zeroed — same rule as every other
    // series in this file.
    trend: dailySeries(
      rows.map((r) => ({ date: r.date, value: r.duration_min })),
      { limit: opts.trendDays },
    ),
  }
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
      // The per-day series behind the number. A chip says the lift moved; the
      // shape says whether it climbed or spiked once and gave it back — and
      // those two lifts want opposite decisions next session.
      trend: sorted.map(([d, v]) => ({ d, v: round1(v) })),
      lastDay,
    })
  }

  return out
    // Most recently trained first: a widget shows what you are working on, not
    // what you are best at. Heaviest breaks a same-day tie.
    .sort((a, b) => (a.lastDay === b.lastDay ? b.kg - a.kg : a.lastDay < b.lastDay ? 1 : -1))
    .slice(0, opts.limit ?? 3)
    .map(({ exercise, kg, deltaKg, trend }) => ({ exercise, kg, deltaKg, trend }))
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

/**
 * One overnight vital: today's reading, the trailing baseline, and the trace.
 *
 * ── THE BASELINE EXCLUDES TODAY, DELIBERATELY ────────────────────────────────
 * "Your HRV is 8 ms below normal" is only a sentence if "normal" is a thing
 * today can differ FROM. Averaging today into its own baseline drags the
 * reference toward the reading — over a fortnight that is a ~7% dilution, which
 * is the same order as the deltas these widgets exist to show, so a genuinely
 * bad night reads as a mildly bad one.
 *
 * Missing days are skipped, not zero-filled: a night with the watch on the
 * charger is an absent reading, and averaging a 0 ms HRV into a fortnight is
 * how a forgotten charge becomes a recovery alarm.
 */
export function vitalBlock(
  rows: ReadonlyArray<{ date: string; value: number | null | undefined }>,
  todayISO: string,
  opts: { trendLimit: number },
): { value: number | null; baseline: number | null; trend: TrendPoint[] } {
  const real = rows.filter(
    (r): r is { date: string; value: number } => typeof r.value === 'number' && Number.isFinite(r.value),
  )
  const today = real.find((r) => r.date === todayISO)?.value ?? null
  const past = real.filter((r) => r.date !== todayISO)
  const baseline = past.length
    ? Math.round((past.reduce((sum, r) => sum + r.value, 0) / past.length) * 10) / 10
    : null
  return {
    value: today,
    baseline,
    // `max`, not `sum`: these are readings, not quantities. Two rows for one day
    // (a re-sync) must not add up to a heart rate of 108.
    trend: dailySeries(real, { limit: opts.trendLimit, combine: 'max' }),
  }
}
