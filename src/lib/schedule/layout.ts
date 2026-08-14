/**
 * The permanent weekday layout of a plan — pure, so the rule can be tested
 * without a database.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `ProgramDay.weekday` is a hardcoded TypeScript constant (programs.ts), and
 * `schedule_overrides` is strictly per-date. So "Delts & Arms moves off Tuesday
 * FOREVER" had nowhere to be recorded: it was a code edit and a deploy, or
 * nothing. A one-time swap was the only shape the app could express, which is
 * why every recurring change had to be re-made every week.
 *
 * A layout is `dayKey → weekday`. An absent key means "wherever programs.ts put
 * it", so a partial layout is meaningful and deleting the row restores the plan
 * exactly as authored — which is what "reset to default" has to mean.
 *
 * ── WHY IT IS ONE JSONB ROW AND NOT A ROW PER DAY ────────────────────────────
 * Because a swap is an EXCHANGE, and an exchange is atomic or it is corruption.
 * Per-day rows would need a `unique (user_id, program_id, weekday)` constraint
 * to stop two sessions landing on one date — and that constraint makes the
 * two-row swap A↔B collide with itself mid-statement, since ON CONFLICT checks
 * uniqueness as each row is written. One row, one upsert, no window in which the
 * layout is invalid. It also mirrors `routine_templates`, which stores a whole
 * deck the same way and for the same reason.
 *
 * No clock, no network, no React.
 */

import type { Program, ProgramDay } from '@/lib/programs'

/** `dayKey → weekday` (0 = Sunday … 6 = Saturday). */
export type DayLayout = Record<string, number>

/** Weekdays a layout may name. Anything else is a corrupt row, not a rest day. */
const VALID_WEEKDAY = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6

/**
 * Read a stored payload into a layout, dropping anything malformed.
 *
 * TOTAL by design. This runs during render, behind `scheduleDayFor` — a bad row
 * must degrade to the authored plan, never throw the page away. A duplicate
 * weekday is dropped rather than allowed to shadow: two days claiming Tuesday is
 * exactly the state the single-row design exists to prevent, so if it somehow
 * appears, the first key wins and the second falls back to its authored slot.
 */
export function parseLayout(raw: unknown): DayLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: DayLayout = {}
  const taken = new Set<number>()
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !VALID_WEEKDAY(value) || taken.has(value)) continue
    out[key] = value
    taken.add(value)
  }
  return out
}

/** Where a day actually sits: the layout's answer, else the authored weekday. */
export function effectiveWeekday(day: ProgramDay, layout: DayLayout): number {
  const mapped = layout[day.key]
  return VALID_WEEKDAY(mapped) ? mapped : day.weekday
}

/** Which day owns a weekday under this layout, or null when that day rests. */
export function dayKeyForWeekday(program: Program, layout: DayLayout, weekday: number): string | null {
  for (const d of program.days) {
    if (effectiveWeekday(d, layout) === weekday) return d.key
  }
  return null
}

/**
 * The COMPLETE layout a plan is currently running — every day named explicitly.
 *
 * Stored layouts are sparse (only what was moved). Writing a swap against a
 * sparse layout has to reason about days that are not in it, so every mutation
 * starts from this and the result is stored whole. A layout that names all five
 * days is also self-describing: you can read the row and know the week, without
 * also holding programs.ts in your head.
 */
export function fullLayout(program: Program, layout: DayLayout): DayLayout {
  const out: DayLayout = {}
  for (const d of program.days) out[d.key] = effectiveWeekday(d, layout)
  return out
}

/**
 * Move `dayKey` to `weekday`, as an EXCHANGE.
 *
 * If another day already sits there, the two trade slots — which is what keeps
 * the layout a bijection and the week the same set of sessions in a different
 * order. Placing without exchanging would silently delete a session, which is
 * the bug `planDaySwap` was written to fix for the per-date case; the permanent
 * case has to obey the same rule or the two tiers mean different things by the
 * word "swap".
 *
 * If the target weekday is free (a rest day), the day simply moves and its old
 * slot becomes rest — no session is destroyed either way.
 */
export function moveDay(program: Program, layout: DayLayout, dayKey: string, weekday: number): DayLayout {
  if (!VALID_WEEKDAY(weekday)) return fullLayout(program, layout)
  const next = fullLayout(program, layout)
  if (!(dayKey in next)) return next          // not a day of this plan
  const from = next[dayKey]
  if (from === weekday) return next

  const occupant = Object.keys(next).find((k) => k !== dayKey && next[k] === weekday)
  next[dayKey] = weekday
  if (occupant) next[occupant] = from         // the exchange
  return next
}

/** True when the layout says nothing the authored plan doesn't already say. */
export function isAuthoredLayout(program: Program, layout: DayLayout): boolean {
  return program.days.every((d) => effectiveWeekday(d, layout) === d.weekday)
}

/**
 * Key-order-independent serialisation, for idempotency checks.
 *
 * `JSON.stringify` is NOT usable against a stored jsonb value: Postgres
 * normalises jsonb object keys by length then bytewise, so a payload written as
 * `{cb_a, legs_a, arms}` reads back as `{arms, cb_a, legs_a}` and a string
 * comparison reports a difference that does not exist. This bit the routine
 * template backfill; the same trap is here.
 */
export function canonicalLayout(layout: DayLayout): string {
  return JSON.stringify(Object.keys(layout).sort().map((k) => [k, layout[k]]))
}
