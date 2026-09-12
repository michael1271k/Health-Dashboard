/**
 * PSYCHOLOGICAL STRESS, SELF-REPORTED — the `stress_logs` vocabulary.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * The feature is native-only. `stress_logs` is written by the Onyx app's Head
 * row (`PulseHead.swift`, `QuickLogSheet.swift`) and the vocabulary lives in
 * `OnyxCore/Recovery/PsychStress.swift`. Nothing on this side ever read it, so
 * the weekly export printed "no data" for a feature that had shipped.
 *
 * This is the READING half of that vocabulary and nothing else: the words a
 * stored level resolves to, and the order a day's slots happen in. It writes
 * nothing, it scores nothing, and it is deliberately not a second definition —
 * if the Swift ladder changes, this is the copy that has to follow it.
 *
 * ── WHY IT IS NOT A SECOND FATIGUE SCALE ─────────────────────────────────────
 * `recovery/fatigue.ts` asks what the BODY could do. This asks what is on the
 * mind, and the two answer differently on the same day: a calm week of heavy
 * training and a light week in the middle of a house move both exist, and one
 * self-report cannot separate them.
 */

/** One rung of the 1–5 scale, with the definition that keeps it stable. */
export interface StressLevel {
  value: number
  label: string
  /** The gloss shown beside the word in the app's picker. */
  hint: string
}

/**
 * 1 is settled and 5 is overwhelmed, so the scale centres on 3 the way fatigue
 * does and the two can be averaged without either being flipped first.
 *
 * The middle word is "Okay" — the same middle as fatigue, deliberately. The
 * lowest is not "Calm": the Stress tile prints `stressBand`'s own word for a
 * COMPUTED reading and its lowest band is spelled Calm, and two five-point
 * scales sharing a word is a screen where neither can be read.
 */
export const STRESS_LEVELS: readonly StressLevel[] = [
  { value: 1, label: 'Relaxed', hint: 'nothing on it' },
  { value: 2, label: 'Okay', hint: 'normal background noise' },
  { value: 3, label: 'Tense', hint: 'holding something' },
  { value: 4, label: 'Strained', hint: 'carrying more than usual' },
  { value: 5, label: 'Swamped', hint: 'cannot put it down' },
] as const

/**
 * The three buckets, IN THE ORDER A DAY HAPPENS.
 *
 * The order matters more than it looks: a string sort gives "evening, midday,
 * morning", which is very nearly the reverse of the day it describes — the
 * same trap `FATIGUE_SLOT_LABELS` documents.
 *
 * The slot is derived from the clock rather than chosen — "which part of the
 * day is this about" is a question the clock already answers — so a reading
 * never files somewhere surprising.
 */
export const STRESS_SLOTS = ['morning', 'midday', 'evening'] as const

export type StressSlot = (typeof STRESS_SLOTS)[number]

/** The word a stored level resolves to, or the bare number if it is off-ladder. */
export function stressLevelLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return STRESS_LEVELS.find((l) => l.value === value)?.label ?? String(value)
}
