/**
 * Pure week date helpers. No React and no `'use client'`, so both client hooks
 * and server routes (e.g. the weekly-report API) can share one implementation
 * instead of copy-pasting the date math.
 *
 * Week start is configurable (Settings → "Week starts on"): Sunday (default) or
 * Monday. The choice is mirrored into `localStorage` by the prefs hydrator so it
 * reads synchronously. On the server there is no window, so it always resolves to
 * Sunday — API report windows stay Sunday-anchored regardless of device choice.
 */

/** Device week-start day: 0 = Sunday (default), 1 = Monday. Server → 0. */
export function deviceWeekStartDay(): number {
  if (typeof window === 'undefined') return 0
  try { return window.localStorage.getItem('helix_week_start') === '1' ? 1 : 0 } catch { return 0 }
}

/** First day (per `startDay`) of the week containing dateISO (YYYY-MM-DD). */
export function weekStartOf(dateISO: string, startDay: number = deviceWeekStartDay()): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  const offset = (d.getUTCDay() - startDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

/** Add n days to an ISO date (YYYY-MM-DD). */
export function isoAddDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
