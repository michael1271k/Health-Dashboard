/**
 * Display formatters for the dashboard.
 */

/**
 * Format a raw sleep duration in minutes as a compact "Hh Mm" string.
 *   457 → "7h 37m" · 420 → "7h" · 45 → "45m" · null/0/NaN → "—"
 */
export function formatSleep(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return '—'
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Long-form sleep, e.g. 457 → "7 hours 37 minutes". */
export function formatSleepLong(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return '—'
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`)
  return parts.join(' ')
}

/** Millilitres → litres as a fixed-precision string. 2500 → "2.5". */
export function mlToL(ml: number | null | undefined, digits = 1): string {
  if (ml == null || !Number.isFinite(ml)) return '—'
  return (ml / 1000).toFixed(digits)
}

/**
 * Human "time ago" for sync timestamps. "just now" · "12m ago" · "3h ago" ·
 * "2d ago" · then an absolute date. Null/invalid → "—".
 */
export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return '—'
  const sec = Math.round((Date.now() - d.getTime()) / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })
}
