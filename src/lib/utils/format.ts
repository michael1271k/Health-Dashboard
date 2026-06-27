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
