import { parseFmtV2 } from '@/lib/reports/fmtV2'

/**
 * The one instruction to carry forward from the last pasted report.
 *
 * ── RETRIEVAL, NOT GENERATION ────────────────────────────────────────────────
 * This does not write advice and the app must never start doing so — Helix
 * calls no model. It reads a line YOU pasted back in, out of a report you asked
 * for elsewhere, and puts it where you will see it on a Tuesday. If nothing was
 * pasted, the dashboard says nothing.
 *
 * ── WHY IT SEARCHES BY MEANING ───────────────────────────────────────────────
 * Same rule as the rest of the FMT v2 reader: the format lives outside the app
 * and changes without a release, so nothing here requires a section to exist,
 * be named exactly, or sit in a particular part. It looks for a section whose
 * title is about what to DO next, and takes the first line in it that reads as
 * an instruction rather than a heading, a rule, or a table row.
 */

/** Sections that carry forward-looking instructions, in preference order. */
const DIRECTIVE_SECTION = /DIRECTIVE|ACTION|NEXT\s*WEEK|PROTOCOL|PRESCRIPTION|ADJUST|DO\s*THIS/i

/** Leading bullet glyphs the reports use, stripped before display. */
const BULLET = /^\s*(?:[-*•▸▪◆◇→⚑>]|\d+[.)])\s+/

/** Box-drawing, rules, and other pure decoration — never an instruction. */
const DECORATION = /^[\s─━═╔╚║╠▓▒░#|+=_.·—–-]*$/

const MIN_LEN = 12
const MAX_LEN = 140

/**
 * Extract the leading directive from a report's markdown.
 *
 * Returns null rather than a fallback: a made-up directive would be exactly the
 * generation this loop exists to avoid.
 */
export function firstDirective(md: string | null | undefined): string | null {
  const report = parseFmtV2(md)
  if (!report) return null

  const sections = report.parts.flatMap((p) => p.sections)
  const preferred = sections.filter((s) => DIRECTIVE_SECTION.test(s.title))
  for (const s of preferred) {
    for (const raw of s.lines) {
      const line = clean(raw)
      if (line) return line
    }
  }
  return null
}

function clean(raw: string): string | null {
  let line = raw.trim()
  if (!line || DECORATION.test(line)) return null
  // A table row is data, not an instruction.
  if (line.includes('|')) return null
  line = line.replace(BULLET, '')
  // A nested heading inside the section ("⚑ LOAD"), not the instruction itself.
  if (/^#{1,6}\s/.test(line)) return null
  line = line.replace(/\*\*/g, '').replace(/`/g, '').trim()
  if (line.length < MIN_LEN) return null
  // Shouted lines are headings the parser did not claim — a real directive is
  // written as a sentence.
  if (line === line.toUpperCase() && /[A-Z]{4}/.test(line)) return null
  return line.length > MAX_LEN ? `${line.slice(0, MAX_LEN - 1).trimEnd()}…` : line
}
