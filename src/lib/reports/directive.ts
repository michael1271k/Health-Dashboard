import { parseFmtV2, cleanInstruction } from '@/lib/reports/fmtV2'

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
      // `cleanInstruction` lives in the parser because the targets reader makes
      // the identical judgement about what a sentence is; two copies of that
      // rule would drift the first time either was tuned.
      const line = cleanInstruction(raw, MAX_LEN)
      if (line) return line
    }
  }
  return null
}
