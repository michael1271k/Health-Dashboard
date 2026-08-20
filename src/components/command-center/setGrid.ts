/**
 * ── ONE GRID TEMPLATE, DECLARED ONCE ────────────────────────────────────────
 *
 * The set rows and the column headers above them are different components in
 * different files, and the only thing that makes them a table is that they
 * agree about their columns. Spelling the template twice is how they stop
 * agreeing: a header that says PREVIOUS over a column of weights is worse than
 * no header at all, and nothing in the type system notices.
 *
 * So the template is a constant, and both sides import it. Change a column here
 * and the header moves with the data by construction.
 *
 * The tick is NOT in this template. It sits outside the row's activate button
 * (a button cannot contain a button), so it is a flex sibling — `TAIL_W` is the
 * width the header leaves empty to line up with it.
 */
export const SET_GRID =
  'grid grid-cols-[28px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 min-w-0'

/** Width of the trailing tick column, and of the header's spacer above it. */
export const SET_TAIL_W = 'w-9'

/**
 * Indent that puts a row's second line under the PREVIOUS column rather than
 * under the set number — 28px badge + the grid's 8px gap.
 */
export const SET_SUBLINE_INDENT = 'pl-9'

/** The micro-caps treatment shared with the read-only ledger (ExerciseBreakdown). */
export const SET_HEADER_TEXT = 'text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60'
