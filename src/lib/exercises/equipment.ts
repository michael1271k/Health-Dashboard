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
 * ── AND WHY IT IS DERIVED, NOT STORED ────────────────────────────────────────
 * The catalogue already says it: the app's naming convention suffixes the
 * equipment — "(Machine)", "(Cable)", "(Dumbbell)", "(Smith)" — and
 * `exercises.name` is the one field every surface has. So a new exercise is
 * placed the moment it is typed, with no column, no migration and nothing to
 * keep in sync. The consequence is that this is a HEURISTIC and must behave
 * like one: every branch is a hint and the fallback is honest rather than
 * clever.
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
  const lower = name.toLowerCase()
  return EQUIPMENT_RULES.find((r) => r.test.test(lower))?.label ?? EQUIPMENT_FALLBACK
}
