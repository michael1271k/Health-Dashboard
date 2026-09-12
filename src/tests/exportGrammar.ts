/**
 * ── READING EXPORT v4 IN A TEST ──────────────────────────────────────────────
 *
 * v3 was columnar: every record was one ` · `-separated line under a heading
 * that named its columns once, and this file zipped rows against legends by
 * index. v4 is DAY-MAJOR and labelled — `**Vitals** HRV 61.5 ms · RHR 52` —
 * so there are no legends left to zip against and nothing to be off by one.
 *
 * What survives is the reason the zipping existed: a test that greps the whole
 * document for a substring passes for the wrong reason. `2026-09-03` appears in
 * a day heading, in the excluded-days list, in a soreness attribution and in
 * the body-composition table; `52` matches wherever it happens to fall. So
 * everything here is SCOPED — to one day, to one row of one day, to one
 * exercise of one session — and asks for a field by NAME rather than by index.
 *
 * Every accessor throws rather than returning undefined when what it was asked
 * for is absent. A test that reads a missing field and asserts on `undefined`
 * passes vacuously, which is the failure mode this whole file exists to stop.
 */

/** Fields within one labelled row are joined by this. */
export const SEP = ' · '

/** What the document says instead of a blank. Never `0`, never an empty cell. */
export const NO_DATA = 'no data'
/** What it says for an empty LIST, which is a different fact from no reading. */
export const NONE = 'none'

/** A markdown hard break. Every row inside a day block ends with one. */
export const BR = '  '

const lines = (out: string): string[] => out.split('\n')

/** `## X` opens a section; `### X` opens a subsection of the one above it. */
const isH2 = (l: string): boolean => /^## \S/.test(l)
const isH3 = (l: string): boolean => /^### \S/.test(l)

/** Every `##` and `###` heading in the document, in order, trimmed of `#`. */
export const headings = (out: string): string[] =>
  lines(out).filter((l) => isH2(l) || isH3(l)).map((l) => l.replace(/^#+\s+/, ''))

/** The document's first line: `# ONYX · WEEK 7`. */
export const title = (out: string): string => lines(out)[0]

/** The second line — range, programme, phase, session count, day count. */
export const metaCells = (out: string): string[] => lines(out)[1].split(SEP)

/**
 * The lines of one `##` section, heading excluded, up to the next `##`.
 *
 * `###` subsections are INCLUDED: `### Sets by muscle` belongs to `## THE WEEK`,
 * and a session belongs to the day it was trained on.
 */
export function sectionLines(out: string, headingStartsWith: string): string[] {
  const ls = lines(out)
  const start = ls.findIndex((l) => isH2(l) && l.replace(/^##\s+/, '').startsWith(headingStartsWith))
  if (start < 0) throw new Error(`no section beginning "## ${headingStartsWith}"`)
  const rest = ls.slice(start + 1)
  const end = rest.findIndex(isH2)
  return end < 0 ? rest : rest.slice(0, end)
}

/** True when the document has such a section at all. */
export function hasSection(out: string, headingStartsWith: string): boolean {
  return lines(out).some((l) => isH2(l) && l.replace(/^##\s+/, '').startsWith(headingStartsWith))
}

/** The lines of one `###` subsection, heading excluded, up to the next heading. */
export function subsectionLines(out: string, heading: string): string[] {
  const ls = lines(out)
  const start = ls.findIndex((l) => l === `### ${heading}` || l.startsWith(`### ${heading} `))
  if (start < 0) throw new Error(`no subsection "### ${heading}"`)
  const rest = ls.slice(start + 1)
  const end = rest.findIndex((l) => isH2(l) || isH3(l))
  return end < 0 ? rest : rest.slice(0, end)
}

export const hasSubsection = (out: string, heading: string): boolean =>
  lines(out).some((l) => l === `### ${heading}` || l.startsWith(`### ${heading} `))

/**
 * The body of a `**Label** …` row, with the trailing hard break stripped.
 *
 * Anchored on the label so `**Body**` cannot match the `**Body composition**`
 * of a neighbouring line, and scoped to the lines it is handed so a day's
 * `**Cardio**` cannot be answered by the week summary's.
 */
export function fieldIn(ls: readonly string[], label: string): string | null {
  const hit = ls.find((l) => l.startsWith(`**${label}** `))
  return hit == null ? null : hit.slice(`**${label}** `.length).replace(/\s+$/, '')
}

/** The same, but a missing row is an error rather than a silent `null`. */
export function requireFieldIn(ls: readonly string[], label: string): string {
  const v = fieldIn(ls, label)
  if (v == null) throw new Error(`no **${label}** row in:\n${ls.join('\n')}`)
  return v
}

/* ── DAYS ─────────────────────────────────────────────────────────────────── */

/** Every day heading, in order: `DAY 1 · Sun · 2026-08-30 · REST`. */
export const dayHeadings = (out: string): string[] =>
  headings(out).filter((h) => h.startsWith('DAY '))

/** One day's lines — its heading excluded, up to the next `##`. */
export function dayLines(out: string, date: string): string[] {
  const ls = lines(out)
  const start = ls.findIndex((l) => isH2(l) && /^## DAY /.test(l) && l.includes(` ${date} `))
  if (start < 0) throw new Error(`no day block for ${date}`)
  const rest = ls.slice(start + 1)
  const end = rest.findIndex(isH2)
  return end < 0 ? rest : rest.slice(0, end)
}

/** One day's heading line, past the `## `. */
export function dayHeading(out: string, date: string): string {
  const hit = lines(out).find((l) => isH2(l) && /^## DAY /.test(l) && l.includes(` ${date} `))
  if (!hit) throw new Error(`no day block for ${date}`)
  return hit.replace(/^##\s+/, '')
}

/** A labelled row of one day: `dayField(out, '2026-08-30', 'Vitals')`. */
export const dayField = (out: string, date: string, label: string): string =>
  requireFieldIn(dayLines(out, date), label)

/** The same, `null` where the day dropped the row entirely. */
export const dayFieldOrNull = (out: string, date: string, label: string): string | null =>
  fieldIn(dayLines(out, date), label)

/** One row of a day, split on the field separator. */
export const dayCells = (out: string, date: string, label: string): string[] =>
  dayField(out, date, label).split(SEP)

/**
 * The names a day's closing `*Not recorded: …*` line lists, or `[]` when the
 * day carried everything.
 */
export function notRecorded(out: string, date: string): string[] {
  const hit = dayLines(out, date).find((l) => l.startsWith('*Not recorded: '))
  if (!hit) return []
  return hit.replace(/^\*Not recorded:\s*/, '').replace(/\.\*$/, '').split(', ')
}

/**
 * The names a row lists after `— not measured:`, or `[]` when it measured all
 * of them. The row must exist: a row that is absent entirely is a different
 * fact, and `notRecorded` is where it is stated.
 */
export function notMeasured(out: string, date: string, label: string): string[] {
  const body = dayField(out, date, label)
  const i = body.indexOf('— not measured: ')
  if (i < 0) return []
  return body.slice(i + '— not measured: '.length).split(', ')
}

/**
 * The three clauses of a day's `**Readiness**` row.
 *
 * They are one row rather than three because they answer one question — how the
 * body arrived at the day — and a reader scans them together. They are split
 * here because a test asserting on soreness must not pass because the fatigue
 * clause happened to contain the word it was looking for.
 */
export function readiness(out: string, date: string): {
  fatigue: string; doms: string; joints: string
} {
  const body = dayField(out, date, 'Readiness')
  const parts = body.split(' — ')
  const pick = (prefix: string): string => {
    const hit = parts.find((p) => p.startsWith(`${prefix} `))
    if (hit == null) throw new Error(`no "${prefix}" clause in the readiness row: ${body}`)
    return hit.slice(prefix.length + 1)
  }
  return { fatigue: pick('fatigue'), doms: pick('DOMS'), joints: pick('joints') }
}

/** The `**Head**` row's readings, split — one per slot answered. */
export const stress = (out: string, date: string): string[] =>
  dayField(out, date, 'Stress').split(SEP)

/** The v4 spelling of `stress`, kept so an older test names the same row. */
export const head = stress

/**
 * The three lines of a `**Stack**` block: the count, what was ticked, and what
 * was skipped.
 *
 * v4 joined all three onto the `**Stack**` row with ` — `. v4.1 gives each its
 * own line, the two lists indented two spaces under the count, so this reads
 * the day's lines rather than splitting one field.
 */
export function stack(out: string, date: string): {
  count: string | null; taken: string[]; skipped: string[]
} {
  const ls = dayLines(out, date)
  const after = (label: string): string[] => {
    const hit = ls.find((l) => l.trim().startsWith(`**${label}** `))
    if (hit == null) return []
    return hit.trim().slice(`**${label}** `.length).trim().split(SEP)
  }
  const count = ls.some((l) => l.startsWith('**Stack** ')) ? dayField(out, date, 'Stack') : null
  return { count, taken: after('taken'), skipped: after('skipped') }
}

/* ── SESSIONS ─────────────────────────────────────────────────────────────── */

export interface ExerciseBlock {
  name: string
  /** The `**Name** · target … · rest … · top …` line, past the name. */
  header: string
  /** One entry per set line: `` `S1` 75 kg × 12 @ 8.5 Hard ``. */
  sets: string[]
}

export interface SessionBlock {
  /** The `### Session #41 · Legs & Core A` heading, past the `### `. */
  heading: string
  /** The clock / duration / HR / kcal / sRPE line. */
  meta: string
  /** The set-count and tonnage line. */
  counts: string
  exercises: ExerciseBlock[]
  /** Each `- ` PR line, past the dash. */
  prs: string[]
  /** Every raw line of the session, for an assertion about a literal. */
  lines: string[]
}

/** Dates under `## OUTSIDE THE LOGGED DAYS`, which hold no day block. */
export function strandedDates(out: string): string[] {
  if (!hasSection(out, 'OUTSIDE THE LOGGED DAYS')) return []
  const seen = sectionLines(out, 'OUTSIDE THE LOGGED DAYS')
    .map((l) => /^\*\*(\d{4}-\d{2}-\d{2})\*\*/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m != null)
    .map((m) => m[1])
  return [...new Set(seen)]
}

/**
 * The lines a date owns — its day block, or its slice of the stranded section.
 */
function blockFor(out: string, date: string): string[] {
  const ls = lines(out)
  const dayAt = ls.findIndex((l) => isH2(l) && /^## DAY /.test(l) && l.includes(` ${date} `))
  if (dayAt >= 0) return dayLines(out, date)
  const at = ls.findIndex((l) => l.trim() === `**${date}**`)
  if (at < 0) throw new Error(`no block for ${date}`)
  const rest = ls.slice(at + 1)
  const end = rest.findIndex((l) => isH2(l) || /^\*\*\d{4}-\d{2}-\d{2}\*\*/.test(l.trim()))
  return end < 0 ? rest : rest.slice(0, end)
}

/** Every session block inside one day, in order. */
export function sessionBlocks(out: string, date: string): SessionBlock[] {
  const ls = blockFor(out, date)
  const blocks: SessionBlock[] = []
  let cur: SessionBlock | null = null
  let ex: ExerciseBlock | null = null
  let inPrs = false
  for (const l of ls) {
    if (/^### Session\b/.test(l)) {
      cur = {
        heading: l.replace(/^###\s+/, ''), meta: '', counts: '',
        exercises: [], prs: [], lines: [],
      }
      blocks.push(cur)
      ex = null
      inPrs = false
      continue
    }
    if (!cur) continue
    // A `**Cardio**` block or a `**Derived**` row closes the session above it.
    if (/^\*\*(Cardio|Derived)\*\*/.test(l)) { cur = null; ex = null; inPrs = false; continue }
    cur.lines.push(l)
    if (!cur.meta && l.trim() && !l.startsWith('**')) { cur.meta = l.replace(/\s+$/, ''); continue }
    if (!cur.counts && l.trim() && !l.startsWith('**')) { cur.counts = l.replace(/\s+$/, ''); continue }
    if (l === '**PRs**') { inPrs = true; ex = null; continue }
    if (inPrs && l.startsWith('- ')) { cur.prs.push(l.slice(2)); continue }
    const m = /^\*\*(.+?)\*\* · (.*)$/.exec(l.replace(/\s+$/, ''))
    if (m) { ex = { name: m[1], header: m[2], sets: [] }; cur.exercises.push(ex); continue }
    if (ex && l.startsWith('`')) ex.sets.push(l.replace(/\s+$/, ''))
  }
  return blocks
}

/** The one session on `date` (or the nth, when a day holds two). */
export function sessionBlock(out: string, date: string, nth = 0): SessionBlock {
  const hits = sessionBlocks(out, date)
  if (!hits[nth]) throw new Error(`no session ${nth} on ${date}`)
  return hits[nth]
}

/** One exercise of a session, by name. */
export function exercise(out: string, date: string, name: string, nth = 0): ExerciseBlock {
  const hit = sessionBlock(out, date, nth).exercises.find((e) => e.name === name)
  if (!hit) throw new Error(`${date}: no exercise "${name}"`)
  return hit
}

/** One exercise's set lines, in order. */
export const setsOf = (out: string, date: string, name: string, nth = 0): string[] =>
  exercise(out, date, name, nth).sets

/** A day's cardio bouts — each `- ` line, past the dash. */
export function cardioLines(out: string, date: string): string[] {
  const ls = dayLines(out, date)
  const start = ls.findIndex((l) => l === '**Cardio**')
  if (start < 0) return []
  const out2: string[] = []
  for (const l of ls.slice(start + 1)) {
    if (l.startsWith('- ')) out2.push(l.slice(2))
    else if (l.trim()) break
  }
  return out2
}

/* ── TABLES ───────────────────────────────────────────────────────────────── */

export interface ParsedTable { columns: string[]; rows: string[][] }

/** The padded markdown table inside a `###` subsection, cells trimmed. */
export function table(out: string, subsection: string): ParsedTable {
  const ls = subsectionLines(out, subsection).filter((l) => l.startsWith('|'))
  if (ls.length < 2) throw new Error(`no table under "### ${subsection}"`)
  const cells = (l: string): string[] =>
    l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  return { columns: cells(ls[0]), rows: ls.slice(2).map(cells) }
}

/** One table row, keyed by its column names, found by its first cell. */
export function tableRow(out: string, subsection: string, key: string): Record<string, string> {
  const t = table(out, subsection)
  const row = t.rows.find((r) => r[0] === key || r[0] === `**${key}**`)
  if (!row) throw new Error(`"### ${subsection}": no row for ${key}`)
  return Object.fromEntries(t.columns.map((c, i) => [c, row[i] ?? '']))
}

/* ── THE WEEK, THE LEGEND, THE NOTES ──────────────────────────────────────── */

/** A labelled row of the `## THE WEEK` block. */
export const weekField = (out: string, label: string): string =>
  requireFieldIn(sectionLines(out, 'THE WEEK'), label)

export const weekFieldOrNull = (out: string, label: string): string | null =>
  fieldIn(sectionLines(out, 'THE WEEK'), label)

/** The whole legend as one string — for an assertion about a literal. */
export const legendText = (out: string): string => sectionLines(out, 'LEGEND').join('\n')

/** The four closing notes, each past its `- `. */
export const notes = (out: string): string[] =>
  sectionLines(out, 'NOTES').filter((l) => l.startsWith('- ')).map((l) => l.slice(2))

/* ── THE ONE STRUCTURAL ASSERTION ─────────────────────────────────────────── */

/**
 * The shape every other assertion in these files depends on.
 *
 * v3's equivalent checked that each row zipped against its legend, because an
 * off-by-one zip made every field test pass on the wrong number. v4 has no
 * zipping, and its equivalent failure is a row that does not RENDER as a row:
 * a `**Label**` line missing its hard break runs into the line below it, and
 * every `fieldIn` after that silently reads two rows glued together.
 */
export function assertAligned(out: string): void {
  const ls = lines(out)
  for (const [i, l] of ls.entries()) {
    if (!/^\*\*[A-Z]/.test(l)) continue
    // The last row of a block needs no break — the line after it is blank, a
    // heading, a rule, or the end of the document.
    const next = ls[i + 1] ?? ''
    const needsBreak = next !== '' && !isH2(next) && !isH3(next) && next !== '---'
      && !next.startsWith('- ') && !next.startsWith('|') && !next.startsWith('*')
      && !next.startsWith('`')
    if (needsBreak && !l.endsWith(BR)) {
      throw new Error(`line ${i + 1} is a row with no hard break, so it runs into the next:\n${l}\n${next}`)
    }
    // `**PRs**` and `**Cardio**` are block labels: the list follows on the next
    // lines. Anything else alone on a line is a label whose body went missing.
    if (/^\*\*[^*]+\*\*\s*$/.test(l) && !['**PRs**', '**Cardio**'].includes(l.trim())) {
      throw new Error(`line ${i + 1} is a label with no body:\n${l}`)
    }
  }
  for (const h of dayHeadings(out)) {
    if (!/^DAY \d+ · \w+ · \d{4}-\d{2}-\d{2} · (TRAIN|REST)/.test(h)) {
      throw new Error(`day heading is not "DAY n · Wkd · ISO · TRAIN|REST":\n${h}`)
    }
  }
}

/* ── NAMED READERS FOR THE FACTS THE SUITES PIN ───────────────────────────── */

/**
 * These exist instead of a `dayRow(out, date).kcal`-shaped shim.
 *
 * v3 was columnar, so a test could name a COLUMN and read it. Reconstructing
 * those columns out of v4's prose would be a parser nothing else uses, and it
 * would let a test pass while asserting on a shape the document no longer has.
 * What a test actually wants is a FACT — the week's tonnage, the day a TDEE
 * estimate dropped — so each one gets a reader that names the fact and reads it
 * where the document puts it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-08-30` → `30 Aug`, the label the tables key their rows on. */
export function dayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : date
}

/** A number out of the document, thousands separators and minus sign removed. */
export const numberIn = (text: string, pattern: RegExp): number | null => {
  const m = pattern.exec(text)
  return m == null ? null : Number(m[1].replace(/,/g, '').replace(/−/g, '-'))
}

/** The energy estimate, from the two rows that state it. */
export function energy(out: string): {
  balanceKcal: number | null; perDayKcal: number | null
  tdeeAvg: number | null; bmrAvg: number | null; activeAvg: number | null; tefAvg: number | null
  daysCounted: number | null; excluded: string[]; bmrCarried: boolean; stated: boolean
} {
  const head = weekField(out, 'Energy balance')
  const terms = sectionLines(out, 'THE WEEK').find((l) => l.startsWith('TDEE ')) ?? ''
  const excluded = /excluded ([^·]+)/.exec(terms)
  return {
    balanceKcal: numberIn(head, /(−?[\d,]+) kcal over the week/),
    perDayKcal: numberIn(head, /(−?[\d,]+) kcal\/day/),
    tdeeAvg: numberIn(terms, /TDEE ([\d,]+)\/day/),
    bmrAvg: numberIn(terms, /BMR ([\d,]+)/),
    activeAvg: numberIn(terms, /Apple Watch active ([\d,]+)/),
    tefAvg: numberIn(terms, /TEF ([\d,]+)/),
    daysCounted: numberIn(terms, /(\d+) days? counted/),
    excluded: excluded ? excluded[1].trim().split(', ') : [],
    bmrCarried: terms.includes('BMR carried across'),
    stated: !head.startsWith(NO_DATA),
  }
}

/** The week's headline totals, from the rows that carry them. */
export function weekTotals(out: string): {
  tonnageKg: number | null; workingSets: number | null; ratedSets: number | null
  sessions: number | null; kcalAvg: number | null; stepsAvg: number | null
  sRpeAvg: number | null; cardioMin: number | null
} {
  const training = weekField(out, 'Training')
  const intake = weekField(out, 'Intake')
  const cardio = weekField(out, 'Cardio')
  return {
    tonnageKg: numberIn(training, /^([\d,.]+) kg/),
    workingSets: numberIn(training, /([\d,]+) working sets/),
    ratedSets: numberIn(training, /([\d,]+) rated/),
    sessions: numberIn(training, /([\d,]+) sessions?/),
    kcalAvg: numberIn(intake, /^([\d,]+) kcal\/day/),
    stepsAvg: numberIn(weekField(out, 'Activity'), /^([\d,]+) steps\/day/),
    sRpeAvg: numberIn(training, /sRPE ([\d.]+) avg/),
    cardioMin: numberIn(cardio, /^([\d,.]+) min/),
  }
}

/** One day's computed row, keyed by the name the document prints. */
export function derivedOf(out: string, date: string): Record<string, string> {
  const row = dayFieldOrNull(out, date, 'Derived')
  if (row == null) return {}
  const body = row.replace('*(computed by Onyx, not measured)* ', '')
  const pairs: Record<string, string> = {}
  for (const part of body.split(SEP)) {
    // The label is the leading run of words; everything after it is the value,
    // unit included. Splitting on the LAST space instead put `kcal` in the
    // value and `TDEE 2,310` in the key.
    // The value starts with a number, a sign, or the words the document uses
    // for a gap — anything else is still part of the label (`strain z`).
    const m = /^(.*?) ((?:[\u2212+]?[\d.,]+|no data).*)$/.exec(part)
    if (m) pairs[m[1]] = m[2]
  }
  return pairs
}

/** The `### The stack` bullets, parsed back into the fields they were built from. */
export function stackProtocol(out: string): Array<{
  time: string; name: string; dose: string; trainingOnly: boolean; notes: string | null
}> {
  if (!hasSubsection(out, 'The stack')) return []
  return subsectionLines(out, 'The stack')
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const body = l.slice(2)
      const [head, ...rest] = body.split(' — ')
      const [time, name] = head.split(SEP)
      let tail = rest.join(' — ')
      const trainingOnly = tail.includes('(training days only)')
      tail = tail.replace(' (training days only)', '')
      const noteAt = tail.indexOf(' · ')
      return {
        time,
        name,
        dose: noteAt < 0 ? tail : tail.slice(0, noteAt),
        trainingOnly,
        notes: noteAt < 0 ? null : tail.slice(noteAt + 3),
      }
    })
}

/** One row of the body-composition table, keyed by its ISO date. */
export const bodyRow = (out: string, date: string): Record<string, string> =>
  tableRow(out, 'Body composition', dayLabel(date))

/** One row of the sets-by-muscle table. */
export const muscleRow = (out: string, muscle: string): Record<string, string> =>
  tableRow(out, 'Sets by muscle', muscle)

/** The `**Shape**` row's clauses, or `[]` where the day dropped it. */
export const shape = (out: string, date: string): string[] => {
  const row = dayFieldOrNull(out, date, 'Shape')
  return row == null ? [] : row.split(SEP)
}

/** Every day the document carries, in order, as ISO dates. */
export const dayDates = (out: string): string[] =>
  dayHeadings(out).map((h) => /(\d{4}-\d{2}-\d{2})/.exec(h)![1])

/** True when the day's heading says it trained. */
export const trained = (out: string, date: string): boolean =>
  dayHeading(out, date).includes('· TRAIN')

/** One reading out of a day's row, by the word that labels it inside the row. */
export function reading(out: string, date: string, label: string, key: string): string | null {
  const row = dayFieldOrNull(out, date, label)
  if (row == null) return null
  const hit = row.split(SEP).find((p) => p.startsWith(`${key} `) || p.endsWith(` ${key}`))
  return hit ?? null
}

/** Every session in the week, flattened out of the days that hold them. */
export interface WeekSession {
  date: string
  heading: string
  /** The label past `Session #n · `. */
  label: string
  meta: string
  counts: string
  exercises: ExerciseBlock[]
  prs: string[]
}

export function weekSessions(out: string): WeekSession[] {
  const all: WeekSession[] = []
  // The stranded section too: a session on a date the week has no day record
  // for is still the week's work, and a reader counting sessions must find it.
  const dates = [...dayDates(out), ...strandedDates(out)]
  for (const date of dates) {
    for (const b of sessionBlocks(out, date)) {
      all.push({
        date,
        heading: b.heading,
        label: b.heading.replace(/^Session(?: #\d+)? · /, ''),
        meta: b.meta,
        counts: b.counts,
        exercises: b.exercises,
        prs: b.prs,
      })
    }
  }
  return all
}

/** A session's stated sRPE, or null where it was not rated. */
export const sessionRpe = (s: WeekSession): string | null => {
  const m = /sRPE ([\d.]+)/.exec(s.meta)
  return m ? m[1] : null
}
