/**
 * What a movement IS, as a short row of chips.
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT FIVE CALLS AT THE CALL SITE ─────────────
 * The five facts already exist — `is_compound` on the catalogue row,
 * `equipmentLabelFor`, `isUnilateralExercise`, `isBodyweightExercise`,
 * `isTimedExercise` — and every surface that wanted them assembled its own
 * list, in its own order, with its own idea of which ones cancel each other
 * out. Two of them do cancel: the equipment rules can answer "Bodyweight" and
 * "Timed hold", which are the same claims the last two tags make, so a naive
 * concatenation prints `Bodyweight · Bodyweight` on a push-up and
 * `Timed hold · Timed` on a plank. That collision is the reason this is a
 * function.
 *
 * ── THE ORDER IS GENERAL → SPECIFIC, AND IT IS FIXED ─────────────────────────
 * Load class, then equipment, then the three qualifiers. A chip row that
 * reorders itself per exercise is a chip row nobody can scan down a deck.
 *
 * ── COMPOUND IS AN INPUT, NOT A GUESS ───────────────────────────────────────
 * `exercises.is_compound` is a real column and `ProgramExercise.compound` is a
 * real field; nothing about "Chest Press (Machine)" says which it is. So a
 * caller that knows passes it, and a caller that does not gets no load-class
 * chip at all. Inventing one from the name is how "Face Pull" ends up labelled
 * a compound for having two words in it.
 *
 * Pure and framework-free, and with no caller yet: the chip row on the exercise
 * header is wave U2's, and the export line is E5's. The rule and its Swift twin
 * (`ExerciseTags` in `OnyxCore/Exercises/Tags.swift`) land first so both clients
 * agree on it before either draws it. Vector `exercise-tags.json`.
 */
import { equipmentLabelFor, EQUIPMENT_FALLBACK } from '@/lib/exercises/equipment'
import { isUnilateralExercise } from '@/lib/exercises/unilateral'
import { isBodyweightExercise } from '@/lib/exercises/bodyweight'
import { isTimedExercise } from '@/lib/exercises/timed'

export type TagKind = 'load' | 'equipment' | 'laterality' | 'unloaded' | 'timed'

export interface ExerciseTag {
  /** Stable identity for a chip. Lowercase, never localised. */
  key: string
  /** What the chip says. */
  label: string
  kind: TagKind
}

/** The equipment labels that are the same claim as a qualifier below. */
const EQUIPMENT_ALIASES: Readonly<Record<string, TagKind>> = {
  Bodyweight: 'unloaded',
  'Timed hold': 'timed',
}

/** Label → chip key. Keys are stable across a rename of the label. */
const EQUIPMENT_KEYS: Readonly<Record<string, string>> = {
  Treadmill: 'treadmill',
  'Timed hold': 'timed',
  'Loaded carry': 'carry',
  Hanging: 'hanging',
  Cable: 'cable',
  Dumbbell: 'dumbbell',
  Barbell: 'barbell',
  Machine: 'machine',
  Bodyweight: 'bodyweight',
}

export interface TagOptions {
  /**
   * `exercises.is_compound` / `ProgramExercise.compound`. Undefined or null
   * means the caller does not know, and no load-class chip is produced —
   * never a guess from the name.
   */
  compound?: boolean | null
}

export function exerciseTags(
  name: string | null | undefined,
  opts: TagOptions = {},
): ExerciseTag[] {
  const out: ExerciseTag[] = []

  if (opts.compound === true) out.push({ key: 'compound', label: 'Compound', kind: 'load' })
  else if (opts.compound === false) out.push({ key: 'isolation', label: 'Isolation', kind: 'load' })

  const bodyweight = isBodyweightExercise(name)
  const timed = isTimedExercise(name)

  const equipment = equipmentLabelFor(name)
  // The fallback is not a claim, so it is not a chip: "Exercise" beside a lift
  // is a row of one word saying nothing.
  if (equipment !== EQUIPMENT_FALLBACK) {
    const aliased = EQUIPMENT_ALIASES[equipment]
    // ...and an equipment label that IS one of the qualifiers below is dropped
    // here rather than deduped after, so the qualifier keeps its own place in
    // the fixed order instead of being pulled forward into the equipment slot.
    const collides = (aliased === 'unloaded' && bodyweight) || (aliased === 'timed' && timed)
    if (!collides) {
      out.push({ key: EQUIPMENT_KEYS[equipment] ?? equipment.toLowerCase(), label: equipment, kind: 'equipment' })
    }
  }

  if (isUnilateralExercise(name)) out.push({ key: 'unilateral', label: 'Per side', kind: 'laterality' })
  if (bodyweight) out.push({ key: 'bodyweight', label: 'Bodyweight', kind: 'unloaded' })
  if (timed) out.push({ key: 'timed', label: 'Timed', kind: 'timed' })

  return out
}

/** Just the labels, in order — the export's form. */
export function exerciseTagLabels(name: string | null | undefined, opts: TagOptions = {}): string[] {
  return exerciseTags(name, opts).map((t) => t.label)
}
