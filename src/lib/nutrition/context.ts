/**
 * ONE context vocabulary, for the two systems that used to have their own.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * `daily_logs.nutrition_exception` held Event / Refeed / Travel / Illness /
 * Social — a per-day flag that forgives the nutrition grade. `user_goals.
 * context_mode` held normal / travel / illness / emergency — a global switch
 * that relaxes every penalty in the scorer. Travel and Illness existed in BOTH,
 * with separate storage, separate effects, and no code that read one to set the
 * other. Declaring illness on the day banner left the global scorer grading you
 * as a healthy person, and setting Illness in Settings left every day of it
 * looking, in the export, exactly like an ordinary week.
 *
 * ── THE MODEL: A CONTEXT IS A RANGE, MATERIALISED PER DAY ────────────────────
 * Settings holds `{mode, since}`; each day inside the range is stamped into
 * `daily_logs.nutrition_exception` as it is written. That keeps history
 * queryable with no new table, keeps every existing export and adherence reader
 * working unchanged, and — crucially — makes a RECOMPUTE of a past day stable:
 * the day carries its own context, so re-scoring last Tuesday does not grade it
 * against how you feel today.
 *
 * Selecting Normal ends the range. Nothing is retro-edited when it does; the
 * days that were stamped stay stamped, because they happened.
 *
 * ── ONE-DAY MODES AND RANGE MODES ────────────────────────────────────────────
 * Event, Refeed and Social are one-day statements — a dinner is not a state you
 * are in for a week. Travel, Illness and Emergency are ranges. Both are the same
 * enum because they answer the same question ("what is going on today?") and are
 * written to the same column; only their persistence differs.
 */

export const CONTEXT_MODES = [
  'normal', 'event', 'refeed', 'social', 'travel', 'illness', 'emergency',
] as const

export type ContextMode = (typeof CONTEXT_MODES)[number]

/** The four the SCORER understands. Unchanged — this is not a scoring change. */
export type ScoringContext = 'normal' | 'travel' | 'illness' | 'emergency'

/** Modes that persist until you end them. The rest describe a single day. */
const RANGE_MODES = new Set<ContextMode>(['travel', 'illness', 'emergency'])

export interface ContextMeta {
  label: string
  /** One line, written for the moment of choosing. */
  desc: string
  /** How it is stored in `daily_logs.nutrition_exception`. Null for normal. */
  dayLabel: string | null
}

export const CONTEXT_META: Record<ContextMode, ContextMeta> = {
  normal:    { label: 'Normal',    desc: 'Standard scoring and targets',              dayLabel: null },
  event:     { label: 'Event',     desc: 'A planned meal out — graded on protein',    dayLabel: 'Event' },
  refeed:    { label: 'Refeed',    desc: 'A deliberate surplus day',                  dayLabel: 'Refeed' },
  social:    { label: 'Social',    desc: 'Unplanned, and not a lapse',                dayLabel: 'Social' },
  travel:    { label: 'Travel',    desc: 'Relaxed penalties until you end it',        dayLabel: 'Travel' },
  illness:   { label: 'Illness',   desc: 'Penalties relaxed, step goal suspended',    dayLabel: 'Illness' },
  emergency: { label: 'Emergency', desc: 'Everything relaxed, step goal suspended',   dayLabel: 'Emergency' },
}

export const isRangeMode = (mode: ContextMode): boolean => RANGE_MODES.has(mode)

/** The mode a stored day label names, or 'normal'. Case- and space-tolerant. */
export function contextFromDayLabel(stored: string | null | undefined): ContextMode {
  const v = stored?.trim().toLowerCase()
  if (!v) return 'normal'
  return (CONTEXT_MODES as readonly string[]).includes(v) ? (v as ContextMode) : legacyDayLabel(v)
}

/**
 * A stored value written before this vocabulary existed.
 *
 * The old day flags were capitalised words from the same set, so they fold in
 * directly; anything else (a value written by hand, or by a future list) is
 * still an exception day and must keep counting as one — it maps to `event`,
 * the most conservative real mode, rather than to `normal`.
 */
function legacyDayLabel(lower: string): ContextMode {
  const known = CONTEXT_MODES.find((m) => m === lower)
  return known ?? 'event'
}

/** The mode a `user_goals.context_mode` value names. Tolerant of the old four. */
export function contextFromSetting(stored: string | null | undefined): ContextMode {
  const v = stored?.trim().toLowerCase()
  if (!v) return 'normal'
  return (CONTEXT_MODES as readonly string[]).includes(v) ? (v as ContextMode) : 'normal'
}

/**
 * What the scorer should apply.
 *
 * The one-day food modes map to `normal` DELIBERATELY: their forgiveness is
 * already delivered by `isExceptionDay` grading the day on protein alone, and
 * ALSO relaxing every other penalty would mean a dinner out improved your sleep
 * score.
 */
export function scoringContextFor(mode: ContextMode): ScoringContext {
  switch (mode) {
    case 'travel': return 'travel'
    case 'illness': return 'illness'
    case 'emergency': return 'emergency'
    default: return 'normal'
  }
}

/**
 * Does this context suspend the step target?
 *
 * Illness and Emergency only. A missed target you were TOLD to miss is not a
 * failure, and scoring it at 20% of goal is a punishment for following the
 * instruction — so the activity component goes null and drops out of the
 * weighted mean entirely rather than scoring low. Travel does NOT suspend it:
 * an airport is one of the few places you outwalk your goal by accident.
 */
export function suspendsStepGoal(mode: ContextMode): boolean {
  return mode === 'illness' || mode === 'emergency'
}

/**
 * The export's header line for an active range, or null.
 *
 * One line at the top instead of `[Exception: Illness]` repeated across four
 * day rows — a reader (human or model) should learn "he was ill from Tuesday"
 * once, as a fact about the week, not infer it four times from annotations.
 */
export function contextRangeLine(
  mode: ContextMode,
  since: string | null | undefined,
  today: string,
): string | null {
  if (mode === 'normal') return null
  const meta = CONTEXT_META[mode]
  if (!since) return `Context: ${meta.label} (active)`
  const days = daysBetween(since, today) + 1
  return `Context: ${meta.label} since ${since} (${days} day${days === 1 ? '' : 's'})`
}

/** Whole days from `a` to `b`, never negative. Both are ISO dates. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)
  if (!Number.isFinite(ms)) return 0
  return Math.max(0, Math.round(ms / 86_400_000))
}

/**
 * Is a date inside an active range?
 *
 * An absent `since` means the range began today as far as anyone can prove —
 * the column may not exist yet — so only today is inside it. Deliberately not
 * "everything is inside it": stamping the whole of history with a context
 * because one column was missing is unrecoverable.
 */
export function rangeCovers(
  mode: ContextMode,
  since: string | null | undefined,
  date: string,
  today: string,
): boolean {
  if (!isRangeMode(mode)) return false
  if (date > today) return false
  return since ? date >= since : date === today
}

export interface ContextRange {
  mode: ContextMode
  from: string
  to: string
  days: number
}

/**
 * Contiguous RANGE contexts across a set of stamped days, oldest first.
 *
 * Only the range modes appear. A refeed on Saturday is a property of Saturday
 * and belongs on Saturday's line; four days of illness is a property of the
 * WEEK, and repeating `[Exception: Illness]` on four consecutive rows makes a
 * reader infer four times what they should be told once.
 *
 * Gaps break a range: illness on Mon-Tue and again on Fri is two ranges, not one
 * five-day one, because the Wednesday in between was an ordinary day and saying
 * otherwise would be a claim the data does not support.
 */
export function contextRangesIn(
  days: Array<{ date: string; exception?: string | null }>,
): ContextRange[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const out: ContextRange[] = []
  let cur: ContextRange | null = null

  for (const d of sorted) {
    const mode = contextFromDayLabel(d.exception)
    const isRange = mode !== 'normal' && isRangeMode(mode)
    if (!isRange) { cur = null; continue }
    if (cur && cur.mode === mode && daysBetween(cur.to, d.date) === 1) {
      cur.to = d.date
      cur.days += 1
      continue
    }
    cur = { mode, from: d.date, to: d.date, days: 1 }
    out.push(cur)
  }
  return out
}

/** The export's one-line rendering of a range. */
export function contextRangeLabel(r: ContextRange): string {
  return r.from === r.to
    ? `${CONTEXT_META[r.mode].label} · ${r.from}`
    : `${CONTEXT_META[r.mode].label} · ${r.from} → ${r.to} (${r.days} days)`
}
