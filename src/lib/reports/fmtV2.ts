/**
 * FMT v2 — a reader for the pasted weekly audit, not a contract for it.
 *
 * WHAT THIS IS NOT. Helix defines no report format; the whole point of the paste
 * loop is that the format lives outside the app and can change without a
 * release. So nothing here validates, rejects, or requires. `parseFmtV2` returns
 * what it recognised and says nothing about the rest, and every consumer is
 * expected to render unrecognised text verbatim. A parser that can fail is a
 * parser that can stop you saving your own notes.
 *
 * WHAT IT IS FOR. FMT v2 carries three things that are genuinely data and read
 * badly as text on a phone: a TDEE anchor ladder (five candidate numbers, one of
 * them adopted), a body-composition table (ten columns across five days), and a
 * left/right asymmetry block. Those get charts. Everything else stays prose.
 *
 * The layout it reads, from a real report:
 *
 *   ⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT
 *   ╔══════════════════════════════════════════════╗
 *   ║ W01 · 2026-07-19 → 07-25 · CUT / RE-ENTRY · SENTINEL-7 · FMT v2 ║
 *   ▓ PART 1 — WEIGHT & METABOLIC VERIFICATION
 *   🧮 THE MATH & TDEE CHECK
 *   ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED
 *   📉 WEIGHT & BODY COMP TRAJECTORY
 *   Date | Wt | BF% | Fat kg | Musc% | Musc kg | FFM kg | H₂O% | Visc | BMR
 *
 * Note the pipe tables carry NO markdown separator row, which is why remark-gfm
 * renders them as one long paragraph and why they are parsed here instead.
 *
 * Pure: no React, no network, no clock. Every branch is exercised by
 * `src/tests/fmt-v2.test.ts` against the real header.
 */

export interface FmtV2Header {
  /** "W01", when the banner carries one. */
  weekLabel: string | null
  /** "2026-07-19 → 07-25" as written. */
  rangeLabel: string | null
  /** "CUT / RE-ENTRY". */
  phase: string | null
  /** The literal version token, e.g. "v2". */
  version: string
  /** The banner line above the box, if present. */
  title: string | null
}

/** One candidate daily-energy figure from the TDEE ladder. */
export interface TdeeAnchor {
  /** "A", "B", … or whatever labels the line. */
  key: string
  label: string
  value: number
  /** The one marked `← ADOPTED`. */
  adopted: boolean
}

export interface ParsedTable {
  columns: string[]
  rows: string[][]
}

export interface AsymmetryRow {
  exercise: string
  left: number | null
  right: number | null
  /** (right − left) / left, as a percentage. Null when either side is missing. */
  gapPct: number | null
}

/** Sections the renderer draws instead of printing. Everything else is `null`. */
export type FmtV2SectionKind = 'tdee' | 'bodyComp' | 'asymmetry'

export interface FmtV2Section {
  /** Leading emoji, when the heading had one. */
  emoji: string | null
  title: string
  /** Body lines with the heading removed, trailing blanks trimmed. */
  lines: string[]
  /** First pipe table in the section, if any. */
  table: ParsedTable | null
  /**
   * Set only when the section's DATA was successfully extracted — a section
   * titled "ASYMMETRY WATCH" whose rows didn't parse stays `null` and renders as
   * text, rather than showing an empty chart where the numbers used to be.
   */
  kind: FmtV2SectionKind | null
}

export interface FmtV2Part {
  title: string
  sections: FmtV2Section[]
}

export interface FmtV2Report {
  header: FmtV2Header
  parts: FmtV2Part[]
  /** Lines before the first `▓ PART` heading (the banner box and preamble). */
  preamble: string[]
  tdee: TdeeAnchor[]
  bodyComp: ParsedTable | null
  asymmetry: AsymmetryRow[]
}

/** Box-drawing and rule characters that carry no content of their own. */
const BOX = /^[\s╔╗╚╝║═╠╣╦╩╬┌┐└┘│─├┤┬┴┼▁▔_=~-]+$/

const PART = /^\s*▓+\s*(.+?)\s*$/
const EMOJI_HEAD = /^\s*(\p{Extended_Pictographic}(?:️)?)\s+(\S.*)$/u

/** A heading is SHOUTED — that is what separates it from a sentence. */
function isShouted(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length < 3) return false
  const upper = text.replace(/[^A-Z]/g, '').length
  return upper / letters.length >= 0.7
}

/**
 * A number, or null.
 *
 * The explicit digit test is load-bearing: `Number('')` is 0, not NaN, so a
 * stripped-out prose cell ("felt heavy" → "") would otherwise arrive as a
 * perfectly plausible zero and get plotted.
 */
const numOf = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (!/\d/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Does this text look like an FMT v2 audit? Cheap enough to call during render. */
export function isFmtV2(md: string | null | undefined): boolean {
  return !!md && /\bFMT\s*v?2\b/i.test(md)
}

/** `a | b | c` → `['a','b','c']`, or null when the line is not a pipe row. */
function pipeCells(line: string): string[] | null {
  if ((line.match(/\|/g)?.length ?? 0) < 2) return null
  const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
  return cells.length >= 3 ? cells : null
}

/** The first pipe table in a run of lines. Separator rows are dropped. */
export function parseTable(lines: string[]): ParsedTable | null {
  let columns: string[] | null = null
  const rows: string[][] = []
  for (const line of lines) {
    const cells = pipeCells(line)
    if (!cells) {
      // A blank line ends the table; prose between rows does not.
      if (columns && !line.trim()) break
      continue
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue   // markdown separator
    if (!columns) { columns = cells; continue }
    rows.push(cells)
  }
  return columns && rows.length ? { columns, rows } : null
}

/**
 * The TDEE ladder.
 *
 * `ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED`
 *
 * The label and the number are separated by run-on whitespace in the original
 * (it is column-aligned ASCII), so the number is taken as the LAST numeric token
 * on the line and everything before it is the label. That survives a label
 * containing its own digits ("ANCHOR C · TDEE ×1.15").
 */
export function parseTdeeAnchors(lines: string[]): TdeeAnchor[] {
  const out: TdeeAnchor[] = []
  for (const line of lines) {
    const m = /^\s*ANCHOR\s+(\S+)\s*(?:·|-|—)?\s*(.*)$/i.exec(line)
    if (!m) continue
    const rest = m[2]
    const adopted = /←\s*ADOPTED|\bADOPTED\b/i.test(rest)
    const body = rest.replace(/←\s*ADOPTED/i, '').replace(/\bADOPTED\b/i, '')
    const nums = [...body.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)]
    if (!nums.length) continue
    const last = nums[nums.length - 1]
    const value = numOf(last[1])
    if (value == null) continue
    out.push({
      key: m[1].replace(/[·:.]$/, ''),
      label: body.slice(0, last.index).replace(/[\s·—-]+$/, '').trim(),
      value,
      adopted,
    })
  }
  return out
}

/**
 * The asymmetry block, from either shape it plausibly takes.
 *
 * A pipe table with left/right columns is preferred; failing that, inline
 * `L 20 … R 18` on one line per movement. The exact layout was not available
 * when this was written, so both are attempted and neither is required — an
 * unrecognised block simply renders as text.
 */
export function parseAsymmetry(lines: string[]): AsymmetryRow[] {
  const gap = (l: number | null, r: number | null) =>
    l != null && r != null && l !== 0 ? Math.round(((r - l) / l) * 1000) / 10 : null

  const table = parseTable(lines)
  if (table) {
    const li = table.columns.findIndex((c) => /^(l|left)\b/i.test(c))
    const ri = table.columns.findIndex((c) => /^(r|right)\b/i.test(c))
    if (li >= 0 && ri >= 0) {
      return table.rows.map((cells) => {
        const l = numOf(cells[li] ?? '')
        const r = numOf(cells[ri] ?? '')
        return { exercise: cells[0] ?? '', left: l, right: r, gapPct: gap(l, r) }
      }).filter((row) => row.exercise && (row.left != null || row.right != null))
    }
  }

  const out: AsymmetryRow[] = []
  for (const line of lines) {
    const m = /^(.*?)\bL\s*[:=]?\s*(\d[\d.]*)\b.*?\bR\s*[:=]?\s*(\d[\d.]*)\b/i.exec(line)
    if (!m) continue
    const name = m[1].replace(/[\s·|—-]+$/, '').trim()
    if (!name) continue
    const l = numOf(m[2])
    const r = numOf(m[3])
    out.push({ exercise: name, left: l, right: r, gapPct: gap(l, r) })
  }
  return out
}

function parseHeader(preamble: string[], md: string): FmtV2Header {
  const version = (/\bFMT\s*(v?\d+)\b/i.exec(md)?.[1] ?? 'v2').toLowerCase()

  // The banner line is inside the box: strip the frame, then split on the
  // middle dot the format uses as a field separator.
  const banner = preamble
    .map((l) => l.replace(/[║╔╗╚╝═]/g, '').trim())
    .find((l) => /·/.test(l) && /FMT\s*v?\d/i.test(l))
  const fields = banner ? banner.split('·').map((f) => f.trim()).filter(Boolean) : []

  const weekLabel = fields.find((f) => /^W\d+$/i.test(f)) ?? null
  const rangeLabel = fields.find((f) => /\d{4}-\d{2}-\d{2}/.test(f)) ?? null
  const phase = fields.find((f) => /^[A-Z][A-Z\s/&-]+$/.test(f) && !/FMT|SENTINEL/i.test(f)) ?? null

  const title = preamble.find((l) => /HELIX/i.test(l) && !BOX.test(l))?.trim() ?? null

  return { weekLabel, rangeLabel, phase, version, title }
}

/**
 * Split a pasted report into parts and sections.
 *
 * Returns null only when the text is empty — an unrecognised layout still comes
 * back with everything in `preamble`, which renders as the original text.
 */
export function parseFmtV2(md: string | null | undefined): FmtV2Report | null {
  if (!md || !md.trim()) return null
  const lines = md.replace(/\r\n?/g, '\n').split('\n')

  const preamble: string[] = []
  const parts: FmtV2Part[] = []

  let part: FmtV2Part | null = null
  let section: FmtV2Section | null = null

  const pushSection = () => {
    if (!part || !section) return
    while (section.lines.length && !section.lines[section.lines.length - 1].trim()) section.lines.pop()
    // The blank line between a part heading and its first section is not a
    // section. Anonymous ones only survive if they actually carry text.
    if (section.title || section.lines.length) {
      section.table = parseTable(section.lines)
      part.sections.push(section)
    }
    section = null
  }

  for (const line of lines) {
    const pm = PART.exec(line)
    if (pm && isShouted(pm[1])) {
      pushSection()
      part = { title: pm[1].replace(/^PART\s*/i, '').replace(/^\d+\s*[—–-]\s*/, '').trim() || pm[1], sections: [] }
      parts.push(part)
      continue
    }

    const em = EMOJI_HEAD.exec(line)
    if (em && part && isShouted(em[2])) {
      pushSection()
      section = { emoji: em[1], title: em[2].trim(), lines: [], table: null, kind: null }
      continue
    }

    if (!part) { preamble.push(line); continue }
    if (!section) { section = { emoji: null, title: '', lines: [], table: null, kind: null } }
    section.lines.push(line)
  }
  pushSection()

  // Cross-part lookups. Deliberately searched by MEANING, not position: a report
  // that moves the TDEE block to Part 3 must not lose its chart.
  const allSections = parts.flatMap((p) => p.sections)
  const find = (re: RegExp) => allSections.find((s) => re.test(s.title))

  const tdeeSection = find(/TDEE|MATH|METABOLIC|ENERGY/i)
  const tdee = tdeeSection ? parseTdeeAnchors(tdeeSection.lines) : []
  if (tdeeSection && tdee.length) tdeeSection.kind = 'tdee'

  const bodySection = find(/BODY\s*COMP|COMPOSITION|TRAJECTORY/i)
  const bodyComp = bodySection?.table && /date/i.test(bodySection.table.columns[0] ?? '')
    ? bodySection.table
    : null
  if (bodySection && bodyComp) bodySection.kind = 'bodyComp'

  const asymSection = find(/ASYMMETR|IMBALANCE|L\/R|LEFT.*RIGHT/i)
  const asymmetry = asymSection ? parseAsymmetry(asymSection.lines) : []
  if (asymSection && asymmetry.length) asymSection.kind = 'asymmetry'

  return {
    header: parseHeader(preamble, md),
    parts,
    preamble: preamble.filter((l) => l.trim()),
    tdee,
    bodyComp,
    asymmetry,
  }
}

/**
 * Numeric columns of a body-comp table, ready to plot.
 *
 * Column 0 is the date; every other column is kept only if MOST of its cells
 * parse as numbers, so a stray "—" or a trailing note column doesn't produce a
 * chart of nothing.
 */
export function bodyCompSeries(table: ParsedTable): Array<{ label: string; points: Array<{ date: string; value: number | null }> }> {
  const out: Array<{ label: string; points: Array<{ date: string; value: number | null }> }> = []
  for (let c = 1; c < table.columns.length; c++) {
    const points = table.rows.map((r) => ({
      date: r[0] ?? '',
      value: numOf((r[c] ?? '').replace(/[^\d.,-]/g, '')),
    }))
    const real = points.filter((p) => p.value != null).length
    if (real >= Math.max(2, Math.ceil(points.length / 2))) {
      out.push({ label: table.columns[c], points })
    }
  }
  return out
}
