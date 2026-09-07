import type { LucideIcon } from 'lucide-react'
import {
  Anchor, Cable, CircleDot, Dumbbell, Footprints, Grip, MoveVertical,
  PersonStanding, Timer, Weight,
} from 'lucide-react'
import { equipmentLabelFor, EQUIPMENT_FALLBACK } from '@/lib/exercises/equipment'

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
 * ── THE RULES ARE NOT HERE ANY MORE ──────────────────────────────────────────
 * `equipment.ts` holds them, because the same question — what is this done
 * with — is asked by `tags.ts`, by the export and by the phone, and none of
 * those can import lucide. This file is now the label → glyph map and nothing
 * else, so there is still exactly one ordered rule table.
 */

/** Label → glyph. Every label `equipment.ts` can return has one. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  Treadmill: Footprints,
  'Timed hold': Timer,
  'Loaded carry': Grip,
  Hanging: Anchor,
  Cable: Cable,
  Dumbbell: Dumbbell,
  Barbell: Weight,
  Machine: CircleDot,
  Bodyweight: PersonStanding,
  // `MoveVertical` and not a dumbbell: a movement the rules cannot place is not
  // "probably a dumbbell exercise", it is a movement. An arrow says "a lift"
  // and says nothing else.
  [EQUIPMENT_FALLBACK]: MoveVertical,
}

/** The glyph for a movement, and what it is claiming. Never null. */
export function exerciseIconFor(name: string | null | undefined): { icon: LucideIcon; label: string } {
  const label = equipmentLabelFor(name)
  return { icon: ICONS[label] ?? MoveVertical, label }
}

/** Just the icon, for a caller that has its own label. */
export function exerciseIcon(name: string | null | undefined): LucideIcon {
  return exerciseIconFor(name).icon
}
