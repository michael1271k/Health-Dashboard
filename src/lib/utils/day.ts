/**
 * "Logical day" — the app's day rolls over at a cutoff hour (default 04:00),
 * not midnight, so late-night sessions (01:00–03:59) still belong to the
 * previous calendar day. All "today" reads should use this, not `new Date()`.
 * Times are computed in the DEVICE's local timezone (wherever the user is —
 * Tel Aviv, Koh Samui, anywhere), never a hardcoded zone.
 */
const DEFAULT_CUTOFF = 4
const STORAGE_KEY = 'helix_day_cutoff'
const LEGACY_KEY = 'apex_day_cutoff'

export function getDayCutoffHour(): number {
  if (typeof window === 'undefined') return DEFAULT_CUTOFF
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY)
  const v = Number(raw)
  return Number.isFinite(v) && v >= 0 && v <= 8 ? v : DEFAULT_CUTOFF
}

export function setDayCutoffHour(hour: number): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(hour))
}

/** Device-local wall-clock parts for "now" (no hardcoded timezone). */
function localParts(): { y: number; mo: number; d: number; h: number } {
  const now = new Date()
  return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(), h: now.getHours() }
}

/** ISO date (YYYY-MM-DD) of the current logical day, in the device timezone. */
export function logicalTodayISO(cutoff = getDayCutoffHour()): string {
  const { y, mo, d, h } = localParts()
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
export function hoursAwakeToday(wakeHour = 7): number {
  const { h } = localParts()
  // After midnight but before the cutoff, count as late in the previous day.
  const hourOfDay = h < getDayCutoffHour() ? h + 24 : h
  return Math.max(0, Math.min(18, hourOfDay - wakeHour))
}

/** @deprecated legacy name — device-local now, kept for the server import surface. */
export const israelHoursAwake = hoursAwakeToday
