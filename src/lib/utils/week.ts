/**
 * Pure Sunday-anchored week date helpers. No React and no `'use client'`, so
 * both client hooks and server routes (e.g. the weekly-report API) can share
 * one implementation instead of copy-pasting the date math.
 */

/** Sunday of the week containing dateISO (YYYY-MM-DD). */
export function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/** Add n days to an ISO date (YYYY-MM-DD). */
export function isoAddDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
