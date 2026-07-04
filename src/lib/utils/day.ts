/**
 * "Logical day" — the app's day rolls over at a cutoff hour (default 04:00),
 * not midnight, so late-night sessions (01:00–03:59) still belong to the
 * previous calendar day. All "today" reads should use this, not `new Date()`.
 * Everything is computed in Israel time (the user's home tz).
 */
const DEFAULT_CUTOFF = 4
const STORAGE_KEY = 'apex_day_cutoff'

export function getDayCutoffHour(): number {
  if (typeof window === 'undefined') return DEFAULT_CUTOFF
  const v = Number(window.localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(v) && v >= 0 && v <= 8 ? v : DEFAULT_CUTOFF
}

export function setDayCutoffHour(hour: number): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(hour))
}

/** Israel-local wall-clock parts for "now". */
function israelParts(): { y: number; mo: number; d: number; h: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24 }
}

/** ISO date (YYYY-MM-DD) of the current logical day. */
export function logicalTodayISO(cutoff = getDayCutoffHour()): string {
  const { y, mo, d, h } = israelParts()
  const base = new Date(Date.UTC(y, mo - 1, d))
  if (h < cutoff) base.setUTCDate(base.getUTCDate() - 1)
  return base.toISOString().slice(0, 10)
}

/** ISO date N logical-days ago. */
export function logicalDaysAgoISO(n: number, cutoff = getDayCutoffHour()): string {
  const base = new Date(logicalTodayISO(cutoff) + 'T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - n)
  return base.toISOString().slice(0, 10)
}

/** Hours the user has been awake today (assumes a 07:00 wake), logical-day aware. */
export function israelHoursAwake(wakeHour = 7): number {
  const { h } = israelParts()
  // After midnight but before the cutoff, count as late in the previous day.
  const hourOfDay = h < getDayCutoffHour() ? h + 24 : h
  return Math.max(0, Math.min(18, hourOfDay - wakeHour))
}
