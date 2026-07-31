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
  if (v == null) return '#8E9AAC'
  if (v <= 4) return '#3E9E7A'
  if (v <= 6) return '#C9A227'
  if (v <= 8) return '#E0703C'
  return '#C4514E'
}
