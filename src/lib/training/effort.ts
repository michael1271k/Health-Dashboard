/**
 * Borg CR10 — the session-level effort scale, shared by strength and cardio.
 *
 * CR10 is a RATIO scale, not the 6–20 Borg RPE scale: 10 is "maximal", and the
 * numbers are anchored to perceived exertion, not to heart rate. Half-steps are
 * meaningful (7.5 is a real rating), which is why the column is numeric(3,1)
 * rather than an int.
 *
 * This is deliberately SESSION-level. Per-set RPE already exists on
 * `DraftSet.rpe` and answers a different question ("how close to failure was
 * that set"); this answers "how hard was the whole session", which is what
 * drives weekly load management and shows up in the telemetry report.
 */

import { EMERALD, SAND, AMBER, EMBER, OXIDE, GARNET, STEEL } from '@/lib/theme/palette'

export const CR10_MIN = 1
export const CR10_MAX = 10

/** Verbal anchors. Only the canonical CR10 points are named; the rest interpolate. */
export const CR10_ANCHORS: Record<number, string> = {
  1: 'Very light',
  2: 'Light',
  3: 'Moderate',
  4: 'Somewhat hard',
  5: 'Hard',
  7: 'Very hard',
  9: 'Extremely hard',
  10: 'Maximal',
}

/** The nearest anchor at or below `v` — every rating gets a word. */
export function cr10Label(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const keys = Object.keys(CR10_ANCHORS).map(Number).sort((a, b) => a - b)
  let label = CR10_ANCHORS[keys[0]]
  for (const k of keys) if (v >= k) label = CR10_ANCHORS[k]
  return label
}

/**
 * Clamp + snap to the 0.5 grid the column stores. Returns null for anything
 * unusable so a blank input never writes a 0 (which would read as "no effort"
 * rather than "not rated").
 */
export function normalizeCr10(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const snapped = Math.round(v * 2) / 2
  if (snapped < CR10_MIN) return CR10_MIN
  if (snapped > CR10_MAX) return CR10_MAX
  return snapped
}

/** Colour ramp for the effort chip: green (easy) → amber → red (maximal). */
export function cr10Color(v: number | null | undefined): string {
  if (v == null) return STEEL
  if (v <= 4) return EMERALD
  // Deliberately NOT the palette GOLD: gold means a personal record app-wide.
  if (v <= 6) return '#C9A227'
  if (v <= 8) return EMBER
  return OXIDE
}

/* ── The per-set ladder ─────────────────────────────────────────────────────
 *
 * Per-set RPE used to be three chips (Easy 7 / Hard 9 / Failure 10), which
 * collapsed the distinction that matters most in a hypertrophy block: a set with
 * zero reps left but clean form is not a set you failed.
 *
 * Eight stops, all already on the 0.5 grid `workout_sets.rpe` stores, so this
 * needed no migration. It stays CR10-compatible on purpose — `session_rpe` and
 * `cardio_logs.effort` speak the same scale, and one app should not hold two
 * vocabularies for "how hard was that".
 *
 * The granularity lives where the granularity is. Below 7 one word is enough,
 * because a set that easy is a data point about the LOAD, not about the effort.
 *
 * ── WHY 8.0 WAS ADDED ────────────────────────────────────────────────────────
 * The seven-stop ladder was not evenly spaced where it mattered. From "Medium"
 * to "Hard" was a full point (7.5 → 8.5) — the single widest gap on the ladder —
 * while the top crammed four stops into the 1.5 points above it (8.5, 9, 9.5,
 * 10). That is backwards: the hard-but-not-near-failure band is where a
 * hypertrophy block actually LIVES, and it was the one band with no rung to
 * stand on. A set with three clean reps left and a set with two are different
 * sets, and the ladder made you round one of them into the other.
 *
 * ── WHY THIS BREAKS NO HISTORY ───────────────────────────────────────────────
 * 8.0 is already on the 0.5 grid, so `numeric(3,1)` stores it unchanged: no
 * DDL, no migration, no backfill, and every historical value keeps rendering —
 * `rpeStopIndex` returns -1 off-ladder and `rpeLabel` falls through to
 * `cr10Label`. The ONLY visible change to existing data is that rows already
 * holding a bare 8 stop borrowing CR10's "Very hard" and start reading
 * "Challenging", which is a better description of the number they always held.
 * The stored value does not move.
 */

export interface RpeStop {
  /** Stored value. Always on the 0.5 grid. */
  value: number
  label: string
  /** Reps-in-reserve gloss — the question you can actually answer. */
  hint: string
}

export const RPE_LADDER: readonly RpeStop[] = [
  { value: 5, label: 'Very Easy', hint: '5+ reps left' },
  { value: 6.5, label: 'Easy', hint: '~4 left' },
  { value: 7.5, label: 'Medium', hint: '3 left' },
  { value: 8, label: 'Challenging', hint: '2–3 left' },
  { value: 8.5, label: 'Hard', hint: '2 left' },
  { value: 9, label: 'Very Hard', hint: '1 left' },
  { value: 9.5, label: 'Max Effort', hint: '0 left, form held' },
  { value: 10, label: 'Failure', hint: 'missed or form broke' },
] as const

/** Index of the lit pip, or -1 for unrated and for nudged off-ladder values. */
export function rpeStopIndex(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return -1
  return RPE_LADDER.findIndex((s) => s.value === v)
}

/**
 * Ladder label on an exact stop, CR10 anchor otherwise. The fallback is
 * load-bearing: rows written before the ladder existed hold 6, 7, 8, 9 and 10,
 * and none of them may render as a dash.
 */
export function rpeLabel(v: number | null | undefined): string {
  const i = rpeStopIndex(v)
  return i >= 0 ? RPE_LADDER[i].label : cr10Label(v)
}

/**
 * A ramp of its own rather than `cr10Color`, for two reasons. The ladder lives
 * in a compressed 5–10 band where CR10's bands paint four of the eight stops
 * the same red; and CR10's middle band is GOLD, which means a personal record
 * app-wide (`WEEK_STATE.pr`) and must not also mean "medium effort".
 *
 * The AMBER band exists for the 8.0 stop. Without it the three stops that were
 * added or kept to separate "hard" from "nearly failed" — 8, 8.5, 9 — all
 * painted EMBER, so the pip row said the same thing at three different ratings.
 * A ladder whose rungs are indistinguishable is a slider with extra steps.
 */
export function rpeColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return STEEL   // unrated
  if (v <= 6.5) return EMERALD
  if (v <= 7.5) return SAND
  if (v <= 8) return AMBER
  if (v <= 9) return EMBER
  if (v <= 9.5) return OXIDE
  return GARNET   // failure reads distinct from max effort
}

/** Long-press ±0.5, so the column's full resolution stays reachable without
 *  paying for it in tap targets. Never invents a rating on an unrated set. */
export function nudgeRpe(v: number | null | undefined, dir: 1 | -1): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return normalizeCr10(v + dir * 0.5)
}

/* ────────────────────────────────────────────────────────────────────────────
 * SESSION EFFORT, IN WORDS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How hard the SESSION was, as five words.
 *
 * ── WHY WORDS, AND WHY THIS IS NOT A SCALE CONVERSION ────────────────────────
 * Per-set RPE is reps-in-reserve: `RPE_LADDER` starts at 5 and, by design,
 * clusters at 8–9.5 on a hypertrophy block. Session CR10 asks a different
 * question — how hard was the WHOLE session — and its own anchors call 9
 * "Extremely hard" and 10 "Maximal". Averaging one into the other is a category
 * error, and the numbers say so: across this athlete's logged sets the mean
 * per-set rating is 8.86, while across the sessions he actually rated by hand
 * the mean is 7.16 and the maximum is 8. The suggestion proposed roughly 8.9
 * against an answer of roughly 7.2, every single session.
 *
 * A number invites that comparison. A word does not: nobody reads "Hard" and
 * asks why it is not 8.9.
 *
 * ── THE NUMBER IS STILL STORED ───────────────────────────────────────────────
 * Each word carries a canonical `cr10`, written to `session_rpe` exactly as
 * before. `battery.ts`, `computeForDate`, the weekly export, the widget
 * snapshot and `SessionHero` all keep reading one numeric column, the 19
 * historical rows stay comparable, and there is no second source of truth for
 * one fact. The word is what you pick; the number is the index.
 */
export interface EffortWord {
  key: string
  label: string
  /** What lands in `session_rpe`. */
  cr10: number
  hint: string
}

export const EFFORT_WORDS: readonly EffortWord[] = [
  { key: 'easy',       label: 'Easy',       cr10: 5,   hint: 'lighter than usual — plenty left' },
  { key: 'solid',      label: 'Solid',      cr10: 6.5, hint: 'a normal working session' },
  { key: 'hard',       label: 'Hard',       cr10: 8,   hint: 'the session you planned, in full' },
  { key: 'brutal',     label: 'Brutal',     cr10: 9,   hint: 'harder than this day usually is' },
  { key: 'everything', label: 'Everything', cr10: 10,  hint: 'nothing left in the tank' },
] as const

/** The stored number for a word. */
export function effortCr10(key: string | null | undefined): number | null {
  return EFFORT_WORDS.find((w) => w.key === key)?.cr10 ?? null
}

/**
 * The word a stored `session_rpe` reads back as — nearest rung, never a range.
 *
 * Historical rows are 6, 7 and 8, which land on Solid, Solid and Hard — 7 is
 * nearer 6.5 than 8, and the nearest rung is the only defensible reading of a
 * number recorded on a different control. It is not worth inventing a sixth
 * word to preserve a distinction the athlete was not reliably drawing: 6, 7 and
 * 8 were the only three values ever used, out of ten available.
 */
export function effortWordFor(cr10: number | null | undefined): EffortWord | null {
  if (cr10 == null || !Number.isFinite(cr10)) return null
  return EFFORT_WORDS.reduce((best, w) =>
    Math.abs(w.cr10 - cr10) < Math.abs(best.cr10 - cr10) ? w : best)
}

/**
 * The baseline used when a day type has no history yet.
 *
 * 8.8 — this athlete's own trailing mean per-set rating, so a first session of
 * a new split lands on "Hard" rather than being graded against an absolute
 * ladder it was never calibrated to.
 */
export const EFFORT_COLD_BASELINE = 8.8

/** Below three prior sessions of the same type, a median is a coin toss. */
export const EFFORT_MIN_HISTORY = 3

/**
 * Suggest a word from this session's mean per-set rating, RELATIVE to what this
 * day type usually costs you.
 *
 * ── WHY RELATIVE ─────────────────────────────────────────────────────────────
 * An absolute map is what made the old suggestion harsh: rating sets at 8.5–9
 * is what a hypertrophy block LOOKS like, so an absolute reading calls every
 * ordinary Tuesday "Extremely hard" and leaves no room to say when a session
 * was genuinely worse than usual. Measured against your own recent sessions of
 * the same day, a typical one sits at delta ≈ 0 and reads "Hard" — the top of
 * the range you actually use — and the words above and below it become
 * available again for the days that earn them.
 *
 * `mean` comes from `deriveSessionRpe`, which is unchanged and still tested.
 * This function only decides what that number MEANS.
 */
export function suggestEffortWord(
  mean: number | null,
  /** Means of recent sessions of the same day type, any order. */
  history: readonly number[] = [],
): EffortWord | null {
  if (mean == null || !Number.isFinite(mean)) return null

  const usable = history.filter((v) => Number.isFinite(v))
  const baseline = usable.length >= EFFORT_MIN_HISTORY ? median(usable) : EFFORT_COLD_BASELINE
  const delta = mean - baseline

  // Quarter-point bands. Per-set ratings move on a 0.5 grid, so a session mean
  // rarely shifts by less than ~0.25 without something real changing.
  if (delta <= -0.75) return EFFORT_WORDS[0]
  if (delta <= -0.25) return EFFORT_WORDS[1]
  if (delta < 0.25) return EFFORT_WORDS[2]
  if (delta < 0.75) return EFFORT_WORDS[3]
  return EFFORT_WORDS[4]
}

/** Median, not mean: one savage session must not move the baseline it is
 *  about to be judged against. */
function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
