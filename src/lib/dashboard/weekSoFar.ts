import { formatSleep } from '@/lib/utils/format'

/**
 * The Week So Far card's arithmetic, lifted out of the component so it can be
 * golden-vectored and ported (`native/.../Dashboard/WeekSoFar.swift`).
 */
export type ChangeDirection = 'up' | 'down'

export interface WeekChange {
  label: string
  text: string
  direction: ChangeDirection
  /** Whether the direction is good — sleep down is bad, tonnage down is bad. */
  good: boolean
}

export interface WeekTotals {
  volumeKg: number
  sessions: number
  sleepMin: number | null
  score: number | null
}

/** Percent change, guarding the divide — a week from zero has no percentage. */
const pct = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null

/**
 * The ONE change worth naming, chosen by relative size.
 *
 * Ranked by |%| rather than by a fixed priority so the card says what actually
 * moved. A 14% tonnage jump and a 3-minute sleep difference are not equally
 * interesting, and a card that always leads with the same metric stops being
 * read after the second week.
 *
 * Sessions compare as counts, not percentages: one session out of four is a 25%
 * swing that reads as enormous next to a real 25% tonnage change.
 */
export function biggestChange(cur: WeekTotals, prev: WeekTotals): WeekChange | null {
  const candidates: Array<WeekChange & { rank: number }> = []

  const vol = pct(cur.volumeKg, prev.volumeKg)
  if (vol != null && vol !== 0) {
    candidates.push({
      label: 'Tonnage', text: `${vol > 0 ? '+' : ''}${vol}%`,
      direction: vol > 0 ? 'up' : 'down', good: vol > 0, rank: Math.abs(vol),
    })
  }

  if (cur.sleepMin != null && prev.sleepMin != null) {
    const d = Math.round(cur.sleepMin - prev.sleepMin)
    if (Math.abs(d) >= 10) {
      candidates.push({
        label: 'Sleep', text: `${d > 0 ? '+' : '−'}${formatSleep(Math.abs(d))}`,
        direction: d > 0 ? 'up' : 'down', good: d > 0,
        rank: Math.abs(pct(cur.sleepMin, prev.sleepMin) ?? 0),
      })
    }
  }

  if (cur.score != null && prev.score != null) {
    const d = Math.round(cur.score - prev.score)
    if (d !== 0) {
      candidates.push({
        label: 'Daily score', text: `${d > 0 ? '+' : '−'}${Math.abs(d)}`,
        direction: d > 0 ? 'up' : 'down', good: d > 0,
        rank: Math.abs(pct(cur.score, prev.score) ?? 0),
      })
    }
  }

  const s = cur.sessions - prev.sessions
  if (s !== 0) {
    candidates.push({
      label: 'Sessions', text: `${s > 0 ? '+' : '−'}${Math.abs(s)}`,
      direction: s > 0 ? 'up' : 'down', good: s > 0,
      // Deliberately flat: a count change ranks below any real percentage move
      // so it only wins a week in which nothing else changed.
      rank: 1,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.rank - a.rank)
  const { label, text, direction, good } = candidates[0]
  return { label, text, direction, good }
}

/** Totals for one week — the same shape for this week and the last. */
export function totalsFrom(
  sessions: Array<{ started_at: string; total_volume_kg: number | null }>,
  sleep: Array<{ start_time: string; duration_min: number | null }>,
  scores: Array<{ date: string; score: number | null }>,
  from: string,
  to: string,
): WeekTotals {
  const inRange = (iso: string) => iso >= from && iso <= to
  const wk = sessions.filter((s) => inRange(s.started_at.slice(0, 10)))
  const sl = sleep.filter((s) => inRange(s.start_time.slice(0, 10)))
    .map((s) => s.duration_min).filter((v): v is number => v != null && v > 0)
  const sc = scores.filter((s) => inRange(s.date))
    .map((s) => s.score).filter((v): v is number => v != null)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    volumeKg: wk.reduce((n, s) => n + (s.total_volume_kg ?? 0), 0),
    sessions: wk.length,
    sleepMin: mean(sl),
    score: mean(sc),
  }
}
