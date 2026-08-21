/**
 * ── ONE GRID TEMPLATE, DECLARED ONCE ────────────────────────────────────────
 *
 * The set rows and the column headers above them are different components in
 * different files, and the only thing that makes them a table is that they
 * agree about their columns. Spelling the template twice is how they stop
 * agreeing: a header that says PREVIOUS over a column of weights is worse than
 * no header at all, and nothing in the type system notices.
 *
 * So the template is a function, and both sides call it. Change a column here
 * and the header moves with the data by construction.
 *
 * ── TWO THINGS ARE OUTSIDE THE TEMPLATE, AND BOTH FOR THE SAME REASON ───────
 * The SET badge and the tick are `<button>`s, and a button cannot contain a
 * button — the row's body is itself the button that opens the tuner. So they
 * are flex siblings of the grid rather than tracks inside it, and the header
 * reproduces the same flex frame: `BADGE_W`, then the grid, then `TAIL_W`. The
 * shared `gap-2` is what keeps all three edges lined up.
 */

/**
 * How many value columns a movement actually has.
 *
 * ── WHY THIS IS NOT ONE TEMPLATE ANY MORE ───────────────────────────────────
 * A Hanging Knee Raise rendered a KG column containing an em dash on every row,
 * and a Side Plank rendered a KG column of dashes AND a REPS column whose reps
 * were seconds. A column that can never carry a value is charging rent: it took
 * a third of the row's width away from the two numbers that do exist, on the
 * exercises with the least to show.
 *
 *   · `loaded` — weight and reps. The normal case.
 *   · `reps`   — reps only (bodyweight: knee raises, reverse crunches).
 *   · `time`   — seconds only (holds: planks, dead hangs, carries).
 *
 * The mode is resolved ONCE PER EXERCISE in `ExerciseCard`, never per row: rows
 * of one card that disagreed about their columns would not be a table.
 */
export type SetGridMode = 'loaded' | 'reps' | 'time'

const GRID_BASE = 'grid items-center gap-2 min-w-0'

/**
 * The template for the DATA columns — PREVIOUS, then the one or two values.
 *
 * Dropping the load column gives its width to PREVIOUS rather than splitting it
 * evenly: the reference is the widest thing in the row ("17.5kg × 12"), and it
 * is the column that was being truncated first.
 */
export function setGridFor(mode: SetGridMode): string {
  return mode === 'loaded'
    ? `${GRID_BASE} grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]`
    : `${GRID_BASE} grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]`
}

/** Width of the leading SET badge, and of the header's "Set" label above it. */
export const SET_BADGE_W = 'w-7'

/** Width of the trailing tick column, and of the header's spacer above it. */
export const SET_TAIL_W = 'w-9'

/**
 * Indent that puts a row's second line under the PREVIOUS column rather than
 * under the set number — 28px badge + the flex frame's 8px gap.
 */
export const SET_SUBLINE_INDENT = 'pl-9'

/** The micro-caps treatment shared with the read-only ledger (ExerciseBreakdown). */
export const SET_HEADER_TEXT = 'text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60'

/** What the value column is called, per mode. */
export function setValueLabel(mode: SetGridMode): string {
  return mode === 'time' ? 'Time' : 'Reps'
}
