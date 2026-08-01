/**
 * The Intensity Calendar model — PURE.
 *
 * Was a `useMemo` inside `HelixViz`, mixing local-timezone `Date` arithmetic
 * with ISO date keys and computing four summary statistics that nothing ever
 * verified. Two things it got wrong are fixed here and pinned by tests:
 *
 *  · The grid ran to the END of the current week, so up to six FUTURE days
 *    rendered as dark "rest" squares. A day that hasn't happened is not a rest
 *    day, and the trailing blanks made every mid-week view look like a lapse.
 *  · `avgLoad` divided by the number of ACTIVE days, so it reported the average
 *    of the days you trained and labelled it the average load. That is a
 *    different (higher) number than the average over the window, and it moved
 *    the wrong way when you added an easy session.
 */
export interface CalendarCell {
  date: string
  /** Volume as a fraction of the window's heaviest day, 0 when untrained. */
  t: number
  /** False for dates after `today` — rendered as absent, not as rest. */
  elapsed: boolean
}

export interface CalendarStats {
  activeDays: number
  /** Heaviest day in the window, or null when nothing was logged. */
  hardest: { date: string; volume: number } | null
  /** Mean volume per ELAPSED day in the window (rest days included). */
  avgLoad: number
  /** Longest run of consecutive active days. */
  streak: number
}

export interface CalendarModel {
  weeks: CalendarCell[][]
  stats: CalendarStats
}

const DAY_MS = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Sunday-anchored week start, UTC — no local-timezone drift. */
function sundayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

export function buildIntensityCalendar(
  volumeByDate: ReadonlyMap<string, number>,
  days: number,
  todayISO: string,
): CalendarModel | null {
  if (!volumeByDate.size) return null

  const max = Math.max(...volumeByDate.values(), 1)
  const nWeeks = Math.min(16, Math.max(1, Math.ceil(days / 7)))
  const thisSunday = Date.parse(`${sundayOf(todayISO)}T00:00:00Z`)
  const todayMs = Date.parse(`${todayISO}T00:00:00Z`)

  const weeks: CalendarCell[][] = []
  for (let w = nWeeks - 1; w >= 0; w--) {
    const col: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const ms = thisSunday - w * 7 * DAY_MS + d * DAY_MS
      const date = iso(ms)
      col.push({ date, t: (volumeByDate.get(date) ?? 0) / max, elapsed: ms <= todayMs })
    }
    weeks.push(col)
  }

  // Statistics span the RENDERED, ELAPSED window — not every row the query
  // happened to return, and not the future.
  const first = weeks[0][0].date
  const inWindow = [...volumeByDate.entries()]
    .filter(([d, v]) => v > 0 && d >= first && d <= todayISO)
    .sort(([a], [b]) => a.localeCompare(b))

  const elapsedDays = Math.max(1, Math.round((todayMs - Date.parse(`${first}T00:00:00Z`)) / DAY_MS) + 1)
  const total = inWindow.reduce((n, [, v]) => n + v, 0)

  let streak = 0, best = 0, prevMs = NaN
  for (const [d] of inWindow) {
    const ms = Date.parse(`${d}T00:00:00Z`)
    streak = ms - prevMs === DAY_MS ? streak + 1 : 1
    if (streak > best) best = streak
    prevMs = ms
  }

  const heaviest = inWindow.length ? inWindow.reduce((b, c) => (c[1] > b[1] ? c : b)) : null

  return {
    weeks,
    stats: {
      activeDays: inWindow.length,
      hardest: heaviest ? { date: heaviest[0], volume: heaviest[1] } : null,
      avgLoad: total / elapsedDays,
      streak: best,
    },
  }
}
