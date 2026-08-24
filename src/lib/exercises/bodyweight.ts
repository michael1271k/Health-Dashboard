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
 * WEIGHTED VARIANTS STILL WORK, BUT ONLY WHERE THEY EXIST. The flag suppresses
 * the load controls while the set is at 0 kg; the deck keeps an "Add load"
 * affordance for the movements you can actually hang a belt on, so a weighted
 * pull-up or a dip is one tap away and renders as a normal loaded set the
 * moment it carries weight. See `isLoadableBodyweightExercise` — a Reverse
 * Crunch has no such variant, and offering it one is offering a control that
 * does nothing.
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

/**
 * The subset of bodyweight movements that take EXTERNAL LOAD.
 *
 * ── WHY THE SET IS NOT "ALL OF THEM" ─────────────────────────────────────────
 * The deck offered a full-width "+ Add load" button on every bodyweight set,
 * which put it on Reverse Crunch, Hanging Knee Raise and the rest of the floor
 * work — movements with no loaded variant to reach. It was the largest control
 * in the tuner, on the exercises with the least to configure, and every tap of
 * it led to a weight field nobody was going to fill.
 *
 * These four are the ones with a real weighted form: a dip belt, a plate on the
 * back, a vest, a plate held at the chest. Everything else in
 * `BODYWEIGHT_PATTERNS` is reps and nothing else — and if a loaded variant does
 * exist it is a DIFFERENT catalog entry carrying its own qualifier ("Barbell
 * Glute Bridge", "Crunch Machine"), which `isBodyweightExercise` already
 * excludes before this is ever asked.
 *
 * A timed hold is never loadable here whatever its name: `reps` carries SECONDS
 * on those, and `sessionVolumeKg` has no timed concept, so one tap plus a 60 s
 * plank would inject phantom tonnage into the week. `SetEditorRow` gates on
 * `!timed` for exactly that reason and this list does not restate it.
 */
const LOADABLE_PATTERNS: RegExp[] = [
  /\b(pull|chin)[-\s]?ups?$/i,
  /\bdips?$/i,
  /\bpush[-\s]?ups?$/i,
  /\bback\s+extensions?$/i,
]

/** True when the movement is bodyweight AND has a genuine weighted variant. */
export function isLoadableBodyweightExercise(name: string | null | undefined): boolean {
  if (!isBodyweightExercise(name)) return false
  const n = (name as string).trim()
  return LOADABLE_PATTERNS.some((re) => re.test(n))
}
