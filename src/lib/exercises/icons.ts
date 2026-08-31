import type { LucideIcon } from 'lucide-react'
import {
  Anchor, Cable, CircleDot, Dumbbell, Footprints, Grip, MoveVertical,
  PersonStanding, Timer, Weight,
} from 'lucide-react'

/**
 * A glyph for every movement, derived from its name.
 *
 * ── WHY A GLYPH AND NOT AN EMOJI ─────────────────────────────────────────────
 * An emoji is a different typeface on every platform, renders at a size the
 * stylesheet does not control, and cannot take a colour — so 👣 beside a lucide
 * `Dumbbell` reads as two design systems in one row, and neither can be tinted
 * with the exercise's own muscle hue the way the card's left rule already is.
 * A stroke icon is one line of SVG that inherits `currentColor`, sits on the
 * text baseline, and disappears into the card it belongs to.
 *
 * ── AND WHY IT IS DERIVED, NOT STORED ────────────────────────────────────────
 * The catalogue already says what a movement is done with: the app's own naming
 * convention suffixes the equipment — "(Machine)", "(Cable)", "(Dumbbell)",
 * "(Smith)" — and `exercises.name` is the one field every surface has. So this
 * is a pure function of the name, which means a new exercise gets an icon the
 * moment it is typed, with no column, no migration, no seed row, and nothing to
 * keep in sync.
 *
 * The consequence is that this file is a HEURISTIC and must behave like one:
 * every branch is a hint, the fallback is honest rather than clever, and no
 * caller may treat the result as a claim about the movement. It decorates a
 * name that is already on screen; it never replaces one.
 *
 * ── ORDER MATTERS, AND IT IS SPECIFIC-FIRST ──────────────────────────────────
 * "Cable Lateral Raise (Machine)" is a cable movement whichever suffix it also
 * carries, and a treadmill is a treadmill before it is anything else. So the
 * rules run most-specific first and the first match wins — an alphabetised or
 * equipment-first list would file half the deck under the wrong glyph.
 */

interface IconRule {
  /** Matched against the LOWERCASED name. */
  test: RegExp
  icon: LucideIcon
  /** What the glyph is claiming, for the `aria-label` and the tooltip. */
  label: string
}

const RULES: readonly IconRule[] = [
  // ── The movement itself, where the name says it outright ──
  { test: /\b(treadmill|walk|run|jog|incline\s*walk)\b/, icon: Footprints, label: 'Treadmill' },
  { test: /\b(plank|hollow\s*hold|dead\s*hang|wall\s*sit|l-?sit|hold)\b/, icon: Timer, label: 'Timed hold' },
  { test: /\b(carry|farmer)\b/, icon: Grip, label: 'Loaded carry' },
  { test: /\b(pull-?up|chin-?up|hang(ing)?)\b/, icon: Anchor, label: 'Hanging' },

  // ── Equipment, in the app's own naming convention ──
  { test: /\bcable\b|\(cable\)/, icon: Cable, label: 'Cable' },
  { test: /\bdumbbell\b|\(dumbbell\)|\bdb\b/, icon: Dumbbell, label: 'Dumbbell' },
  { test: /\bbarbell\b|\(barbell\)|\bsmith\b|\bbb\b/, icon: Weight, label: 'Barbell' },
  { test: /\bmachine\b|\(machine\)|\bpress\s*machine\b|\bsled\b/, icon: CircleDot, label: 'Machine' },

  // ── Bodyweight, last, because almost anything can be named without gear ──
  { test: /\b(bodyweight|push-?up|dip|sit-?up|crunch|raise)\b/, icon: PersonStanding, label: 'Bodyweight' },
]

/**
 * The fallback.
 *
 * `MoveVertical` and not a dumbbell: a movement this file cannot place is not
 * "probably a dumbbell exercise", it is a movement, and picking the most common
 * equipment as a default would put a confidently wrong claim on every unmatched
 * row. An arrow says "a lift" and says nothing else.
 */
const FALLBACK: IconRule = { test: /.^/, icon: MoveVertical, label: 'Exercise' }

/** The glyph for a movement, and what it is claiming. Never null. */
export function exerciseIconFor(name: string | null | undefined): IconRule {
  if (!name) return FALLBACK
  const lower = name.toLowerCase()
  return RULES.find((r) => r.test.test(lower)) ?? FALLBACK
}

/** Just the icon, for a caller that has its own label. */
export function exerciseIcon(name: string | null | undefined): LucideIcon {
  return exerciseIconFor(name).icon
}
