/**
 * What a movement is done WITH, derived from its name.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
 * The rules lived in `icons.ts` beside the lucide glyph they choose, which made
 * the equipment answer unreachable from anywhere that cannot import React —
 * `tags.ts` is pure and server-safe, and the weekly export and the phone both
 * read the same question. So the TABLE lives here and `icons.ts` maps its label
 * to a glyph. One list, two readers, and the Swift port (`ExerciseIcon` in
 * `Flags.swift`) stays a port of one thing.
 *
 * ── IT WAS DERIVED. NOW IT IS A TABLE FIRST, AND RULES SECOND ────────────────
 * This file used to say the catalogue already told us: the naming convention
 * suffixed the equipment — "(Machine)", "(Cable)", "(Dumbbell)" — so a new
 * exercise placed itself the moment it was typed, with no column to keep in
 * sync. On 2026-09-07 that premise was deliberately removed: the founder asked
 * for the kit out of the titles and into a tag, so `exercises.equipment` is a
 * real column and thirteen movements lost the only word that placed them.
 *
 * The failure that makes this a table and not a smaller regex change: with
 * "(Cable)" gone, `Single Arm Triceps Pushdown` fell through to the LAST rule
 * and came back `Bodyweight` — and the logger hides the load column on a
 * bodyweight movement, so a cable pushdown would have had no way to record
 * what it was done with. A missing hint degraded into a confident wrong claim.
 *
 * So: `EQUIPMENT_BY_NAME` is consulted first and is the truth for every
 * movement in this catalogue; `EQUIPMENT_RULES` stays underneath it as the
 * heuristic for a movement nobody has classified yet, which is still the right
 * behaviour for a name typed five seconds ago. Keep the table in step with
 * `exercises.equipment` (docs/sql/hotfix-polish.sql) and with the Swift twin.
 *
 * The consequence is unchanged for the RULES: every branch is a hint and the
 * fallback is honest rather than clever.
 *
 * ── ORDER MATTERS, AND IT IS SPECIFIC-FIRST ──────────────────────────────────
 * "Cable Lateral Raise (Machine)" is a cable movement whichever suffix it also
 * carries, and a treadmill is a treadmill before it is anything else. So the
 * rules run most-specific first and the first match wins — an alphabetised or
 * equipment-first list would file half the deck under the wrong label.
 */

export interface EquipmentRule {
  /** Matched against the LOWERCASED name. */
  test: RegExp
  /** What the match is claiming — the glyph's `aria-label`, and a tag. */
  label: string
}

export const EQUIPMENT_RULES: readonly EquipmentRule[] = [
  // ── The movement itself, where the name says it outright ──
  { test: /\b(treadmill|walk|run|jog|incline\s*walk)\b/, label: 'Treadmill' },
  { test: /\b(plank|hollow\s*hold|dead\s*hang|wall\s*sit|l-?sit|hold)\b/, label: 'Timed hold' },
  { test: /\b(carry|farmer)\b/, label: 'Loaded carry' },
  { test: /\b(pull-?up|chin-?up|hang(ing)?)\b/, label: 'Hanging' },

  // ── Equipment, in the app's own naming convention ──
  { test: /\bcable\b|\(cable\)/, label: 'Cable' },
  { test: /\bdumbbell\b|\(dumbbell\)|\bdb\b/, label: 'Dumbbell' },
  { test: /\bbarbell\b|\(barbell\)|\bsmith\b|\bbb\b/, label: 'Barbell' },
  { test: /\bmachine\b|\(machine\)|\bpress\s*machine\b|\bsled\b/, label: 'Machine' },

  // ── Bodyweight, last, because almost anything can be named without gear ──
  { test: /\b(bodyweight|push-?up|dip|sit-?up|crunch|raise)\b/, label: 'Bodyweight' },
]

/**
 * The catalogue's own answer, by canonical name.
 *
 * Every entry here is a movement whose equipment is a FACT rather than a guess
 * — either because the title used to carry it and no longer does, or because
 * the title never carried it and the rules were quietly wrong about it.
 * Lower-cased keys, like `EXERCISE_ALIASES`, so a caller's casing cannot miss.
 */
export const EQUIPMENT_BY_NAME: Readonly<Record<string, string>> = {
  // Lost "(Machine)" or a leading "Machine" on 2026-09-07.
  'chest press': 'Machine',
  'hip adduction': 'Machine',
  'hip thrust': 'Machine',
  'preacher curl': 'Machine',
  'lateral raise': 'Machine',
  // Never carried it, and the rules placed them as `Exercise` or worse.
  'calf press': 'Machine',
  'leg extension': 'Machine',
  'leg press': 'Machine',
  'hack squat': 'Machine',
  'seated leg curl': 'Machine',
  'pec deck': 'Machine',
  'lat pulldown': 'Machine',
  'neutral-grip lat pulldown': 'Machine',
  'crunch machine': 'Machine',
  // Lost "(DB)" or a leading "DB".
  'bicep curl': 'Dumbbell',
  'hammer curl': 'Dumbbell',
  'shoulder press': 'Dumbbell',
  'romanian deadlift': 'Dumbbell',
  'seated lateral raise': 'Dumbbell',
  // Lost "(Cable)".
  'overhead triceps extension': 'Cable',
  'single arm lateral raise': 'Cable',
  'single arm triceps pushdown': 'Cable',
  // Cable movements the rules already caught, pinned so a future rename cannot
  // silently reclassify them the way the pushdown was.
  'straight-arm pulldown': 'Cable',
  'rope triceps pushdown': 'Cable',
  'face pull': 'Cable',
}

/**
 * What an unmatched movement is called.
 *
 * Not "probably a dumbbell exercise": picking the most common equipment as a
 * default would put a confidently wrong claim on every unmatched row. "A lift",
 * and nothing else.
 */
export const EQUIPMENT_FALLBACK = 'Exercise'

/** The equipment label for a movement. Never null. */
export function equipmentLabelFor(name: string | null | undefined): string {
  if (!name) return EQUIPMENT_FALLBACK
  const lower = name.toLowerCase().trim()
  // The table is the catalogue's own answer and outranks every heuristic.
  return EQUIPMENT_BY_NAME[lower]
    ?? EQUIPMENT_RULES.find((r) => r.test.test(lower))?.label
    ?? EQUIPMENT_FALLBACK
}
