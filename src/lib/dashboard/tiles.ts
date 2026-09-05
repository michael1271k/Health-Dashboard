/**
 * The arithmetic behind the dashboard tiles — PURE, extracted from
 * `widgets/parts.tsx`, `PlanWidgets`, `FuelWidget` and `DailyWidgets` so each
 * rule has one home, a vector, and a port.
 */
import { phaseSpanFor } from '@/lib/phases'

// ── parts ────────────────────────────────────────────────────────────────────

/** Mean of the values that exist, or null when none do. */
export function mean(vals: Array<number | null | undefined>): number | null {
  const ok = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/**
 * Today against the mean of the days BEFORE it.
 *
 * Excluding today from its own baseline is the whole point: a seven-day mean
 * that includes today is a mean today is being compared against itself inside,
 * which damps every real move and makes a genuinely bad night look average.
 */
export function vsBaseline(series: Array<number | null>, today: number | null): number | null {
  if (today == null) return null
  const base = mean(series.slice(0, -1))
  if (base == null) return null
  return Math.round((today - base) * 10) / 10
}

// ── steps ────────────────────────────────────────────────────────────────────

/**
 * The waypoints a person actually reasons in, up to the goal.
 *
 * Derived from the goal rather than hardcoded at 2/4/6/8/10k: the goal is a
 * user setting, and a fixed ladder would put five marks under a 6,000-step goal
 * with three of them already past the end of the track.
 */
export function stepMarks(goal: number): number[] {
  const step = Math.max(500, Math.round(goal / 5 / 500) * 500)
  const marks = [step, step * 2, step * 3, step * 4].filter((v) => v < goal)
  return [...marks, goal]
}

// ── nutrients ────────────────────────────────────────────────────────────────

/**
 * How far a nutrient is from its target, as a fraction of that target.
 *
 * Expressing both floors and ceilings as a fraction of their own target is what
 * makes milligrams of sodium and grams of fibre comparable at all — the
 * alternative ranks by raw magnitude, which puts sodium first every single day
 * purely because it is measured in a smaller unit.
 *
 * An unmeasured nutrient scores -1 and sorts last. It is not at risk; it is
 * unknown, and promoting it would push a real shortfall off the tile in favour
 * of a row reading "—".
 */
export function nutrientRisk(have: number | null, target: number, kind: 'floor' | 'ceiling'): number {
  if (have == null) return -1
  if (target <= 0) return 0
  return kind === 'ceiling'
    ? Math.max(0, have / target - 1)
    : Math.max(0, 1 - have / target)
}

// ── the ledger window ────────────────────────────────────────────────────────

/**
 * The shortest window the ledger will report a rate from.
 *
 * A rate computed from three days is a rate computed from three days, and on a
 * cut those three days routinely include a refeed. Below this the arithmetic is
 * still arithmetic but the answer is noise wearing a decimal point.
 */
export const LEDGER_FLOOR_DAYS = 14

/** The most it will ever sum. Beyond a month the early days describe a body that
 *  no longer exists. */
export const LEDGER_MAX_DAYS = 30

/**
 * How many days the ledger should weigh, and how many of them belong to the
 * current phase. Phase-to-date, reaching BACK past the boundary to make up the
 * floor when the phase is younger than it.
 */
export function ledgerWindow(todayISO: string): { days: number; inPhase: number; label: string | null } {
  const span = phaseSpanFor(todayISO)
  if (!span) return { days: LEDGER_MAX_DAYS, inPhase: LEDGER_MAX_DAYS, label: null }
  const inPhase = Math.min(span.dayIndex + 1, LEDGER_MAX_DAYS)
  return {
    days: Math.min(LEDGER_MAX_DAYS, Math.max(inPhase, LEDGER_FLOOR_DAYS)),
    inPhase,
    label: `${span.def.short ?? span.def.name} · day ${span.dayIndex + 1}`,
  }
}

// ── consistency ──────────────────────────────────────────────────────────────

/**
 * How many days `Heatmap` will actually draw for `weeks` columns ending today.
 *
 * The grid is week-aligned: its last column is the current, partial week, so it
 * winds back to the Sunday that opens the earliest column. That is
 * `(weeks - 1) * 7` whole weeks plus however many days of this week have already
 * happened — NOT `weeks * 7`, and certainly not `weeks * 7 + 7`.
 */
export function consistencyWindow(weeks: number, todayISO: string): number {
  const dow = new Date(`${todayISO}T12:00:00Z`).getUTCDay()
  return (weeks - 1) * 7 + dow + 1
}

// ── cardio ───────────────────────────────────────────────────────────────────

/** `2026-08-25` → `today` / `yesterday` / `4d ago`. */
export function daysAgo(iso: string, today: string): string {
  const n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n}d ago`
}

// ── the stack ────────────────────────────────────────────────────────────────

export interface StackSlot { key: string; name: string; time: string }

/** `HH:MM` → minutes since midnight. An unparseable time sorts to the end. */
export function parseMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 24 * 60
}

export interface StackBlock { time: string; items: StackSlot[]; at: number }

export interface StackSchedule {
  /** Still ahead of you, collapsed into the time blocks they are taken in, soonest first. */
  blocks: StackBlock[]
  /** What is already behind you, most recent first. */
  behind: Array<StackSlot & { wasSkipped: boolean }>
  /** The protocol minus what was deliberately dropped — the honest denominator. */
  onProtocol: StackSlot[]
  /** How many distinct time blocks today's protocol was taken in. */
  blockCount: number
  /** The next block DUE, or null when nothing is left. */
  next: StackBlock | null
  /** Minutes until `next`, or null. */
  inMin: number | null
}

/**
 * The protocol, as the next thing to take.
 *
 * A dose whose time has passed is behind you, one whose time has not is ahead,
 * and a skip removes it from both. Untaken items are grouped by their EXACT due
 * time, because L-citrulline and caffeine at 11:45 are one act.
 */
export function stackSchedule(slots: readonly StackSlot[], skipped: ReadonlySet<string>, minutes: number): StackSchedule {
  const byTime = new Map<string, StackSlot[]>()
  for (const s of slots) {
    if (skipped.has(s.key) || parseMin(s.time) <= minutes) continue
    const list = byTime.get(s.time)
    if (list) list.push(s)
    else byTime.set(s.time, [s])
  }
  const blocks = [...byTime.entries()]
    .map(([time, items]) => ({ time, items, at: parseMin(time) }))
    .sort((a, b) => a.at - b.at)
  const behind = slots
    .filter((s) => skipped.has(s.key) || parseMin(s.time) <= minutes)
    .map((s) => ({ ...s, wasSkipped: skipped.has(s.key) }))
    .sort((a, b) => parseMin(b.time) - parseMin(a.time))
  const onProtocol = slots.filter((s) => !skipped.has(s.key))
  const next = blocks[0] ?? null
  return {
    blocks, behind, onProtocol,
    blockCount: new Set(onProtocol.map((s) => s.time)).size,
    next,
    inMin: next != null ? next.at - minutes : null,
  }
}

/** "in 12 min" · "in 2h 5m" · "now" · "40 min overdue". */
export function dueLabel(mins: number): string {
  if (mins < 0) return `${Math.abs(mins) < 60 ? `${Math.abs(mins)} min` : `${Math.floor(Math.abs(mins) / 60)}h`} overdue`
  if (mins < 1) return 'now'
  if (mins < 60) return `in ${mins} min`
  return `in ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim()
}
