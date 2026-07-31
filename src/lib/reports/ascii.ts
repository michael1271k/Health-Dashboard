/**
 * Monospace primitives for the telemetry report.
 *
 * These render inside fenced code blocks, so every row must be the SAME width in
 * characters — a proportional-font assumption here would make the charts ragged
 * in the one place they're meant to line up. Everything is pure and clock-free.
 */

const FULL = '█'
const EMPTY = '░'

/** `████████░░` — a bar of `width` cells, filled proportionally to `max`. */
export function bar(value: number | null | undefined, max: number, width = 20): string {
  if (max <= 0 || value == null || !Number.isFinite(value) || value <= 0) return EMPTY.repeat(width)
  // Round, not floor: a value at 97% of max should read as a full bar, and a
  // tiny non-zero value should still show one cell rather than vanishing.
  const filled = Math.min(width, Math.max(1, Math.round((value / max) * width)))
  return FULL.repeat(filled) + EMPTY.repeat(width - filled)
}

/**
 * A bar with a TARGET marker. `│` sits where the target falls, so over- and
 * under-shoot are visible without reading the numbers.
 */
export function targetBar(value: number | null | undefined, target: number, max: number, width = 20): string {
  const base = bar(value, max, width).split('')
  if (target > 0 && max > 0) {
    const at = Math.min(width - 1, Math.max(0, Math.round((target / max) * width) - 1))
    base[at] = '│'
  }
  return base.join('')
}

/** Right-pad to `n` characters (truncating with `…` when too long). */
export function pad(s: string, n: number): string {
  const t = s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s
  return t + ' '.repeat(Math.max(0, n - t.length))
}

/** Left-pad — for numeric columns, so decimal points line up. */
export function padStart(s: string, n: number): string {
  const t = s.length > n ? s.slice(0, n) : s
  return ' '.repeat(Math.max(0, n - t.length)) + t
}

/**
 * A GitHub-flavoured markdown table.
 *
 * Cells are NOT padded to equal width: GFM doesn't need it, and padding a table
 * that may contain long exercise names just makes the source unreadable without
 * changing the render. (Fixed-width alignment is for the ASCII charts, which
 * live in code fences.)
 */
export function mdTable(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const head = `| ${headers.join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${headers.map((_, i) => r[i] ?? '—').join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

/** An ASCII box, used for the report header. Width adapts to the longest line. */
export function asciiBox(lines: readonly string[], minWidth = 58): string {
  const inner = Math.max(minWidth, ...lines.map((l) => l.length)) + 2
  const top = `╔${'═'.repeat(inner)}╗`
  const bottom = `╚${'═'.repeat(inner)}╝`
  const body = lines.map((l) => `║ ${pad(l, inner - 2)} ║`)
  return [top, ...body, bottom].join('\n')
}

/** `—` for anything unusable, so a gap never renders as a confident 0. */
export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return digits > 0 ? v.toFixed(digits) : String(Math.round(v))
}

/** Signed, for deltas: `+0.4`, `-1.2`, `—`. */
export function signed(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`
}

/** `7h30` — minutes as hours+minutes. */
export function hhmm(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return '—'
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`
}
