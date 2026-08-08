/**
 * Movements whose record is a REP COUNT, because there is no load to progress.
 *
 * Sibling of `isTimedExercise`, and matched the same way — by name, because the
 * exercise catalog is a name table with no equipment column and the program
 * definitions carry `wk1Kg: null` for two different reasons (Hack Squat is
 * `null` because its start load was unknown, not because it is bodyweight).
 *
 * WHAT THIS IS FOR. `formatSet` already renders any zero-load set as "15 reps"
 * rather than "0kg × 15" — that test is the weight itself and needs no catalog.
 * This flag answers the other half: whether to show a load CONTROL at all. The
 * deck was offering a Hanging Knee Raise a weight field, a 0–60 kg slider and
 * four ±kg chips, none of which have a meaning for that movement, and the
 * summary line dutifully read "0kg × 15 reps" because a control existed to feed
 * it.
 *
 * WEIGHTED VARIANTS STILL WORK. The flag suppresses the load controls only
 * while the set is actually at 0 kg; the deck keeps an "Add load" affordance, so
 * a weighted pull-up or a dip with a belt is one tap away and renders as a
 * normal loaded set the moment it carries weight.
 *
 * Timed holds are NOT listed here. They are unloaded too, but `reps` carries
 * seconds for them and `isTimedExercise` already owns that distinction —
 * `isUnloadedExercise` is the union when a caller needs both.
 */
import { isTimedExercise } from './timed'

/**
 * Reps-only movements. Anchored where a loaded machine variant shares the word:
 * `Reverse Crunch` and `Crunch` are bodyweight, `Crunch Machine` carries a
 * stack, so the pattern requires the name to END at the movement.
 */
const BODYWEIGHT_PATTERNS: RegExp[] = [
  /\b(hanging\s+)?(knee|leg)\s+raises?$/i,
  /\breverse\s+crunch(es)?$/i,
  /^crunch(es)?$/i,
  // `[-\s]?` because the catalog spells these three ways — "Push-Up",
  // "Push Up", "Pushups" — and a name typed in the logger uses whichever.
  /\bsit[-\s]?ups?$/i,
  /\bpush[-\s]?ups?$/i,
  /\b(pull|chin)[-\s]?ups?$/i,
  /\bdips?$/i,
  /\bback\s+extensions?$/i,
  /\bglute\s+bridges?$/i,
  /\bmountain\s+climbers?$/i,
  /\bbicycle\s+crunch(es)?$/i,
  /\bflutter\s+kicks?$/i,
  /\bair\s+squats?$/i,
]

/** True when the movement carries no external load by default — reps are the record. */
export function isBodyweightExercise(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim()
  // A machine/cable/smith qualifier means a stack is attached whatever the root
  // movement is called ("Assisted Pull-Up (Machine)", "Crunch Machine").
  //
  // `assisted` is in the list on its own: on an assisted dip or pull-up the
  // assistance stack IS the load, and it is the number that progresses (down).
  // Free-typed as "Assisted Dip", with no machine qualifier, it would otherwise
  // land here and lose its weight field.
  if (/\b(machine|cable|smith|barbell|dumbbell|db|plate|assisted)\b/i.test(n)) return false
  return BODYWEIGHT_PATTERNS.some((re) => re.test(n))
}

/**
 * True when the movement has no load to show, for EITHER reason — a rep-only
 * bodyweight movement or a timed hold. What the deck actually asks before it
 * renders a weight column.
 */
export function isUnloadedExercise(name: string | null | undefined): boolean {
  return isTimedExercise(name) || isBodyweightExercise(name)
}
