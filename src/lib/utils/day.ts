/**
 * "Logical day" — days roll over at a configurable cutoff hour. The global
 * standard is MIDNIGHT (0): the calendar day is the logical day. Users may
 * raise the cutoff in Settings if they want late-night entries to count
 * toward the previous day. Times are computed in the DEVICE's local timezone
 * (wherever the user is), never a hardcoded zone.
 */
const DEFAULT_CUTOFF = 0
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

/**
 * Server-safe logical date for an EXPLICIT IANA timezone. API routes run in
 * UTC — without this, a morning push from UTC+3 lands on YESTERDAY's row
 * (02:25 UTC − 4h cutoff = the previous date) and renders invisible to the
 * device, whose "today" is already the next day. Falls back to the raw UTC
 * date when the timezone string is invalid.
 */
export function logicalTodayInTZ(timeZone: string, cutoff = DEFAULT_CUTOFF): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const hour = Number(get('hour')) % 24
    const base = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`)
    if (hour < cutoff) base.setUTCDate(base.getUTCDate() - 1)
    return base.toISOString().slice(0, 10)
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** ISO date (YYYY-MM-DD) of the current logical day, in the device timezone. */
export function logicalTodayISO(cutoff = getDayCutoffHour()): string {
  const { y, mo, d, h } = localParts()
  const base = new Date(Date.UTC(y, mo - 1, d))
  if (h < cutoff) base.setUTCDate(base.getUTCDate() - 1)
  return base.toISOString().slice(0, 10)
}

/** Compact "12 Jul" label for a YYYY-MM-DD date (mobile chart axes / lists). */
export function shortDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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

