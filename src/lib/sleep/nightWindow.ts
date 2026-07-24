/**
 * The ONE definition of "the night belonging to date D".
 *
 * `sleep_sessions.start_time` is BEDTIME — the PREVIOUS evening (a night that
 * ends on the 23rd starts at 2026-07-22T20:45). Every reader and writer must
 * therefore agree on the same half-open window, or rows are written into a
 * window nobody queries.
 *
 * Window: [prevDay(D) 12:00Z, D 12:00Z). Half-open and exactly 24h wide, so
 * consecutive nights TILE the timeline without overlapping. That property is
 * load-bearing: the ingest route DELETEs this window before inserting, and the
 * rolling sync writes two adjacent days. When the windows overlapped (the old
 * upper bound was `D 23:59Z`), yesterday's delete covered tonight's bedtime and
 * could destroy the row today's request had just inserted — which is what made
 * the dashboard flip back to "Awaiting Sleep Data" after a pull-to-refresh.
 */

/** Previous calendar day (UTC-safe, date-only). */
export function prevDayISO(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface NightWindow {
  /** Inclusive lower bound — previous day 12:00Z. */
  from: string
  /** EXCLUSIVE upper bound — this day 12:00Z. */
  to: string
}

/** The night that ENDS on the morning of `dateISO`. */
export function nightWindow(dateISO: string): NightWindow {
  return { from: `${prevDayISO(dateISO)}T12:00:00Z`, to: `${dateISO}T12:00:00Z` }
}

/**
 * Where to stamp a sleep session that has no reported bed time (legacy Shortcut
 * pushes and manual web entries carry only a duration). It MUST sit inside
 * `nightWindow(dateISO)` or the row is written but invisible to every reader —
 * the old fallback of `${date}T23:00:00Z` was an hour past the window's end.
 */
export function fallbackBedTime(dateISO: string): string {
  return `${prevDayISO(dateISO)}T23:00:00Z`
}
