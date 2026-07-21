/**
 * "Logical day" = the calendar day in the DEVICE's local timezone. The day
 * boundary is hardcoded to MIDNIGHT (00:00 local) everywhere — Apple Health
 * resets at 00:00 and the old configurable "end of day" cutoff caused
 * native-vs-web drift (native leaked the previous day), so it was removed.
 * Times are always computed device-local, never a hardcoded zone.
 */

/** Device-local wall-clock parts for "now". */
function localParts(): { y: number; mo: number; d: number } {
  const now = new Date()
  return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() }
}

/**
 * Server-safe logical date for an EXPLICIT IANA timezone. API routes run in
 * UTC — without this, a morning push from UTC+3 lands on the wrong calendar
 * row and renders invisible to the device. Returns the calendar date in
 * `timeZone`; falls back to the raw UTC date when the timezone string is
 * invalid. (Boundary is midnight — no cutoff.)
 */
export function logicalTodayInTZ(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** ISO date (YYYY-MM-DD) of the current logical day, in the device timezone. */
export function logicalTodayISO(): string {
  const { y, mo, d } = localParts()
  return new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10)
}

/** Compact "12 Jul" label for a YYYY-MM-DD date (mobile chart axes / lists). */
export function shortDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** ISO date N logical-days ago. */
export function logicalDaysAgoISO(n: number): string {
  const base = new Date(logicalTodayISO() + 'T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - n)
  return base.toISOString().slice(0, 10)
}

/** Hours the user has been awake today (assumes a 07:00 wake). */
export function hoursAwakeToday(wakeHour = 7): number {
  const h = new Date().getHours()
  return Math.max(0, Math.min(18, h - wakeHour))
}
