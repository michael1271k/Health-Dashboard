/**
 * ── READING EXPORT v3 IN A TEST ──────────────────────────────────────────────
 *
 * v3 states every record as one ` · `-separated line under a heading that names
 * the columns once. A test that greps the whole document for a substring can
 * pass for the wrong reason twice over: `2026-09-03` opens a row in `## DAYS`,
 * `## SESSIONS`, `## CARDIO`, `## BODY` and `## NUTRIENTS`, and a bare number
 * matches wherever it happens to fall. So everything here is SECTION-SCOPED and
 * zipped against that section's own legend, by index.
 *
 * `head.slice(1)` drops the literal `## DAYS` cell so the legend and the row
 * line up index-for-index — asserted by `assertAligned` below, because a zip
 * that is off by one makes every field assertion pass vacuously.
 */

/** Every data line is fields joined by this. No value may contain `·`. */
export const SEP = ' · '

/** A missing value. Never blank, never 0. */
export const DASH = '—'

/**
 * A `## ` heading opens a section; `##` + three spaces is a CONTINUATION of the
 * one above it (`##   exercise`, `##   PR`, `##   implausible`, `##   how`).
 */
const isHeading = (l: string): boolean => /^## [A-Z]/.test(l)

/** One `## `-headed section: its heading line, then every line up to the next. */
export function sectionLines(out: string, heading: string): string[] {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l === `## ${heading}` || l.startsWith(`## ${heading}${SEP}`))
  if (start < 0) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(isHeading)
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))]
}

/** The whole section as one string — for the rare assertion about a literal. */
export const sectionText = (out: string, heading: string): string =>
  sectionLines(out, heading).join('\n')

/**
 * A section's data lines: no heading, no continuation, no blank, no INDENTED
 * line (an indented line under `## SESSIONS` belongs to the session above it and
 * has its own legend).
 */
export const dataLines = (out: string, heading: string): string[] =>
  sectionLines(out, heading).slice(1)
    .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith(' '))

/** The column names on a section's heading, in row order. */
export const legendOf = (out: string, heading: string): string[] => {
  const head = sectionLines(out, heading)[0]
  if (!head) throw new Error(`missing section: ## ${heading}`)
  return head.split(SEP).slice(1)
}

/** One data line zipped against its section's legend. */
export function zip(out: string, heading: string, line: string): Record<string, string> {
  const legend = legendOf(out, heading)
  const cells = line.split(SEP)
  if (cells.length !== legend.length) {
    throw new Error(`## ${heading}: ${legend.length} columns on the heading,`
      + ` ${cells.length} on the row — the zip would be off by`
      + ` ${cells.length - legend.length}:\n${line}`)
  }
  return Object.fromEntries(legend.map((k, i) => [k, cells[i]]))
}

/** Every row of a section, zipped. */
export const rowsOf = (out: string, heading: string): Array<Record<string, string>> =>
  dataLines(out, heading).map((l) => zip(out, heading, l))

/** The one row of a section whose FIRST cell is `key`. Throws if absent. */
export function rowFor(out: string, heading: string, key: string): Record<string, string> {
  const line = dataLines(out, heading).find((l) => l.split(SEP)[0] === key)
  if (line == null) throw new Error(`## ${heading}: no row for ${key}`)
  return zip(out, heading, line)
}

/** The `## DAYS` row for one date. */
export const dayRow = (out: string, date: string): Record<string, string> =>
  rowFor(out, 'DAYS', date)

/**
 * The `##   how` line — the one continuation line stating how each derived key
 * was arrived at.
 *
 * Found document-wide rather than through a section, because it closes the
 * document BELOW `## DERIVED.WEEK` and so belongs to neither derived section
 * cleanly. It is unique, which is the point of it: a caveat stated twice is a
 * caveat nobody reads.
 */
export function howLine(out: string): string {
  const hits = out.split('\n').filter((l) => l.startsWith('##   how'))
  if (hits.length !== 1) throw new Error(`expected one ##   how line, found ${hits.length}`)
  return hits[0]
}

/** The single `## WEEK` row. */
export const weekRow = (out: string): Record<string, string> => rowsOf(out, 'WEEK')[0]

/** The single `## DERIVED.WEEK` row — the energy balance, below the fence. */
export const derivedWeekRow = (out: string): Record<string, string> =>
  rowsOf(out, 'DERIVED.WEEK')[0]

/** The `## WEEK.MUSCLE` row for one muscle. */
export const muscleRow = (out: string, muscle: string): Record<string, string> =>
  rowFor(out, 'WEEK.MUSCLE', muscle)

/** The `## BODY` row for one date. */
export const bodyRow = (out: string, date: string): Record<string, string> =>
  rowFor(out, 'BODY', date)

/**
 * `## SESSIONS` session rows, and the indented lines under each.
 *
 * The two-space indent is the only structure left in the document, so it is
 * what says which session an exercise belongs to.
 */
export interface SessionBlock {
  row: Record<string, string>
  /** Indented exercise lines, split — `[name, rep_window, rest, top_kg, ...sets]`. */
  exercises: string[][]
  /** Indented PR lines, split past the literal `PR` — `[name, load×reps, axes, vol, e1rm]`. */
  prs: string[][]
  /** The raw indented lines, for an assertion about a literal token. */
  lines: string[]
}

export function sessionBlocks(out: string): SessionBlock[] {
  const lines = sectionLines(out, 'SESSIONS').slice(1)
  const blocks: SessionBlock[] = []
  for (const line of lines) {
    if (line === '' || line.startsWith('#')) continue
    if (!line.startsWith('  ')) {
      blocks.push({ row: zip(out, 'SESSIONS', line), exercises: [], prs: [], lines: [] })
      continue
    }
    const b = blocks[blocks.length - 1]
    if (!b) continue
    b.lines.push(line)
    const cells = line.trim().split(SEP)
    if (cells[0] === 'PR') b.prs.push(cells.slice(1))
    else b.exercises.push(cells)
  }
  return blocks
}

/** The one session on `date` (or the nth, when a day holds two). */
export function sessionBlock(out: string, date: string, nth = 0): SessionBlock {
  const hits = sessionBlocks(out).filter((b) => b.row.date === date)
  if (!hits[nth]) throw new Error(`## SESSIONS: no session ${nth} on ${date}`)
  return hits[nth]
}

/** One exercise's line under a session, by name. */
export function exercise(out: string, date: string, name: string): string[] {
  const hit = sessionBlock(out, date).exercises.find((e) => e[0] === name)
  if (!hit) throw new Error(`## SESSIONS ${date}: no exercise ${name}`)
  return hit
}

/** The set tokens of one exercise — everything past the four fixed columns. */
export const setsOf = (out: string, date: string, name: string): string[] =>
  exercise(out, date, name).slice(4)

/** The `## CARDIO` rows for one date, in order. */
export const cardioRows = (out: string, date: string): Array<Record<string, string>> =>
  rowsOf(out, 'CARDIO').filter((r) => r.date === date)

/**
 * The `## DERIVED` row for one key — one value per day, in `## DAYS` order.
 * The heading there is prose, not a legend, so this returns a positional list.
 */
export function derivedRow(out: string, key: string): string[] {
  const line = dataLines(out, 'DERIVED').find((l) => l.split(SEP)[0] === key)
  if (line == null) throw new Error(`## DERIVED: no row for ${key}`)
  return line.split(SEP).slice(1)
}

/** The `## NUTRIENTS` line for one date, as `{ key: 'food+stack' }`. */
export function nutrientsRow(out: string, date: string): Record<string, string> {
  const line = dataLines(out, 'NUTRIENTS').find((l) => l.split(SEP)[0] === date)
  if (line == null) throw new Error(`## NUTRIENTS: no row for ${date}`)
  return Object.fromEntries(line.split(SEP).slice(1).map((t) => {
    const i = t.indexOf('=')
    return [t.slice(0, i), t.slice(i + 1)]
  }))
}

/** The header line's cells: `['# ONYX Week 7', dates, program, phase, lever, goals]`. */
export const headerCells = (out: string): string[] => out.split('\n')[0].split(SEP)

/** Every `## ` heading in the document, in order. */
export const headings = (out: string): string[] =>
  out.split('\n').filter(isHeading).map((l) => l.split(SEP)[0])

/**
 * Every row of every columnar section zips cleanly against its own legend.
 *
 * The one assertion that has to hold before any other assertion in these files
 * means anything: a zip that is off by one silently reads the neighbouring
 * column, and every field test then passes on the wrong number.
 */
export function assertAligned(out: string): void {
  for (const h of ['LEVERS', 'DAYS', 'SESSIONS', 'CARDIO', 'BODY', 'SUPPS',
    'WEEK', 'WEEK.MUSCLE', 'DERIVED.WEEK']) {
    if (!sectionLines(out, h).length) continue
    rowsOf(out, h)   // throws on a width mismatch
  }
}
