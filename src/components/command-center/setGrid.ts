/**
 * ── ONE GRID TEMPLATE, DECLARED ONCE ────────────────────────────────────────
 *
 * The set rows and the column headers above them are different components in
 * different files, and the only thing that makes them a table is that they
 * agree about their columns. Spelling the template twice is how they stop
 * agreeing: a header that says PREVIOUS over a column of weights is worse than
 * no header at all, and nothing in the type system notices.
 *
 * ── TWO THINGS ARE OUTSIDE THE TEMPLATE, AND BOTH FOR THE SAME REASON ───────
 * The SET badge and the tick are `<button>`s, and a button cannot contain a
 * button — the row's body is itself the button that opens the tuner. So they
 * are flex siblings of the grid rather than tracks inside it, and the header
 * reproduces the same flex frame: `BADGE_W`, then the grid, then `TAIL_W`.
 */

/**
 * What a movement's value column holds.
 *
 *   · `loaded` — weight and reps. The normal case.
 *   · `reps`   — reps only (bodyweight: knee raises, reverse crunches).
 *   · `time`   — seconds only (holds: planks, dead hangs, carries).
 *
 * Resolved ONCE PER EXERCISE in `ExerciseCard`, never per row: rows of one card
 * that disagreed about their columns would not be a table.
 */
export type SetGridMode = 'loaded' | 'reps' | 'time'

/**
 * ── EVERY MODE SHARES ONE TEMPLATE ──────────────────────────────────────────
 *
 * It did not, and that was the bug. `reps` and `time` dropped the load track
 * entirely, so their two remaining `fr` columns split the whole row between
 * them: a Side Plank's seconds sat almost a hundred pixels right of where a
 * bench press's reps sit, with a canyon of dead space either side, and the two
 * exercises did not look like they belonged to the same table.
 *
 * Now the load track is always present and the unloaded modes render an EMPTY
 * cell in it. That is not a column charging rent — nothing is labelled above it
 * and nothing is drawn in it. It is alignment: every value in the deck shares
 * an edge with every other value, whatever the movement.
 *
 * Four tracks: PREVIOUS · KG · VALUE · RPE.
 */
const GRID = 'grid items-center gap-1.5 min-w-0 '
  + 'grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,0.55fr)_28px]'

export function setGridFor(mode: SetGridMode): string {
  // The parameter stays in the signature even though every mode currently
  // returns the same string: callers pass their mode, and the day one of them
  // needs its own track, this is the single place that decision belongs — not
  // spread across the header and the row, which is how they drifted apart the
  // first time. `void` rather than an underscore so the intent reads as
  // deliberate rather than as a leftover.
  void mode
  return GRID
}

/** Width of the leading SET badge, and of the header's "Set" label above it. */
export const SET_BADGE_W = 'w-7'

/**
 * Gap between the badge and the data grid.
 *
 * Wider than the grid's own `gap-2`, on purpose: the badge is the row's
 * identity and the grid is its data, and running them together at the same
 * spacing made the set number read as a fifth column of numbers.
 */
export const SET_FRAME_GAP = 'gap-3'

/** Width of the trailing tick column, and of the header's spacer above it. */
export const SET_TAIL_W = 'w-9'

/** The micro-caps treatment shared with the read-only ledger (ExerciseBreakdown). */
export const SET_HEADER_TEXT = 'text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60'

/**
 * What the value column is called, per mode.
 *
 * "Sec", not "Time": the header carries the unit so the rows do not have to,
 * exactly as the `kg` header lets the load column print a bare number. Repeating
 * a unit the reader has already been told, once per row, on the narrowest screen
 * in the app, is what pushed `102.25kg` past its box at 360px.
 */
export function setValueLabel(mode: SetGridMode): string {
  return mode === 'time' ? 'Sec' : 'Reps'
}
