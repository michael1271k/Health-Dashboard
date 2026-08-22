/**
 * Muscle colour, three levels deep.
 *
 *   1. FAMILY  — six hues (`GROUP` in palette.ts), spread across the wheel.
 *   2. LANDMARK — each of the 16 tracked muscles is a step inside its family's
 *      ramp, light → dark (`MUSCLE` in palette.ts).
 *   3. EXERCISE — one nudge within its landmark, so Barbell Curl and Hammer Curl
 *      are both visibly Biceps and visibly not each other.
 *
 * Levels 1 and 2 are literal hexes in the palette: recharts needs a real string
 * for the `${EMBER}1a` alpha idiom, and a lookup table is testable in a way a
 * colour-space conversion is not. Only level 3 computes, because the set of
 * exercises is open-ended and cannot be enumerated in a constant.
 *
 * Framework-free — the same rules have to hold in a chart, a band accent and a
 * server-rendered page.
 */
import { GROUP, MUSCLE, STEEL } from '@/lib/theme/palette'
import { LANDMARK_MUSCLES, toLandmarkMuscle, type LandmarkMuscle } from '@/lib/training/landmarks'
import { resolveMovers } from '@/lib/exercises/muscleMap'

export type MuscleFamily = keyof typeof GROUP

/**
 * Which family each landmark belongs to.
 *
 * This is the join that did not exist before. The landmarks and the 6 display
 * groups were two independent taxonomies with two independent colour maps, which
 * is how Quads ended up orange inside a violet Legs group.
 */
const FAMILY_OF: Record<LandmarkMuscle, MuscleFamily> = {
  Chest: 'Chest',
  Lats: 'Back',
  'Upper back': 'Back',
  'Lower back': 'Back',
  'Front delts': 'Shoulders',
  'Side delts': 'Shoulders',
  'Rear delts': 'Shoulders',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Forearms: 'Arms',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  Adductors: 'Legs',
  Calves: 'Legs',
  'Abs/core': 'Core',
}

export function familyOf(muscle: LandmarkMuscle): MuscleFamily {
  return FAMILY_OF[muscle]
}

/** The family's base hue. Unknown groups fall back to the neutral rather than
 *  borrowing a hue that means something else. */
export function groupColor(group: string | null | undefined): string {
  if (!group) return STEEL
  return (GROUP as Record<string, string>)[group] ?? STEEL
}

export function landmarkColor(muscle: LandmarkMuscle): string {
  return MUSCLE[muscle]
}

/**
 * A family's ramp, light → dark. Ordered by luminance rather than by declaration
 * so the sequence is a property of the colours, not of the file.
 */
export function familyRamp(family: MuscleFamily): string[] {
  return LANDMARK_MUSCLES
    .filter((m) => FAMILY_OF[m] === family)
    .map(landmarkColor)
    .sort((a, b) => luminance(b) - luminance(a))
}

/* ── level 3: the per-exercise nudge ────────────────────────────────────────*/

/** Perceived luminance (Rec. 709), 0–255. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')

/**
 * Move a colour toward white (`t > 0`) or black (`t < 0`) by a fraction of the
 * remaining distance. Scaling toward the endpoints rather than adding a constant
 * keeps the hue: every channel moves proportionally, so the ratio between them —
 * which is what the eye reads as hue — is preserved.
 */
function shade(hexStr: string, t: number): string {
  const [r, g, b] = rgb(hexStr)
  const mix = (c: number) => (t >= 0 ? c + (255 - c) * t : c * (1 + t))
  return `#${hex2(mix(r))}${hex2(mix(g))}${hex2(mix(b))}`
}

/**
 * FNV-1a. Any stable hash would do; what matters is that it depends only on the
 * name, so the same lift is the same colour on every screen, every device and
 * every render — never on list position or insertion order.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** ±11% toward white or black, or the landmark colour untouched. Enough to tell
 *  two curls apart at a glance, not enough to read as a different muscle. */
const NUDGE = [-0.11, 0, 0.11] as const

/**
 * An exercise's colour: its primary mover's landmark, nudged one step.
 *
 * Resolution goes through `resolveMovers`, the single place that answers "what
 * does this movement train", so the colour cannot drift from the set-credit
 * arithmetic that uses the same answer.
 *
 * A lift whose primary mover is not a tracked landmark — or that the dictionary
 * has never seen — gets the neutral. Inventing a hue for an unknown movement
 * would put it in a family it may not belong to.
 */
export function exerciseColor(name: string, stored?: readonly string[] | null): string {
  const primary = resolveMovers(name, stored).primary[0]
  const landmark = primary ? toLandmarkMuscle(primary) : null
  if (!landmark) return STEEL
  return shade(landmarkColor(landmark), NUDGE[hash(name) % NUDGE.length])
}
