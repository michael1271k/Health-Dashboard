import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { streakFrom } from '@/lib/widget/derive'

/**
 * "Program day" and "streak" are two different numbers, and one of them spent a
 * while wearing the other's name.
 *
 * ── WHAT THE 22-VERSUS-32 DISAGREEMENT ACTUALLY WAS ──────────────────────────
 * The dashboard orb showed 32 and the widget showed 22, and it read as the
 * widget being out of sync. Neither was wrong:
 *
 *   · the orb ran `programStreak()` — CALENDAR days since the cut began
 *     (2026-07-15). It only ever counts up, and rest days are days.
 *   · the widget runs `streakFrom()` — consecutive SCHEDULED training days
 *     actually trained. Rest days are skipped, a missed session resets it.
 *
 * Ten apart on the same morning, both correct, both called a streak. The fix was
 * the label, not the arithmetic. This file holds both halves of that: that the
 * misleading name is gone from the source, and that the two quantities really do
 * diverge — so nobody "reconciles" them back together later.
 */

const BRAND = readFileSync('src/components/dashboard/BrandHeader.tsx', 'utf8')
const ORB = readFileSync('src/components/dashboard/ReadinessOrb.tsx', 'utf8')

/** Sunday = 0. Helix-5 rests Wednesday and Saturday. */
const REST_WEEKDAYS = new Set([3, 6])

/** Every date from `from` to `to` inclusive, as `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

describe('program day is not a streak', () => {
  it('no longer calls itself one', () => {
    expect(BRAND).toMatch(/export function programDay\(/)
    expect(BRAND).not.toMatch(/export function programStreak\(/)
    // The orb is where the word was actually RENDERED, so the assertion is on
    // the JSX text node — the file still discusses the old label in a comment,
    // and it should, because that is where the explanation lives.
    expect(ORB).not.toMatch(/>Day Streak</)
    expect(ORB).toMatch(/>Program Day</)
    expect(ORB).not.toMatch(/programStreak/)
  })

  it('counts a different thing from the widget, on a perfect month', () => {
    // A month in which EVERY scheduled day was trained — the most favourable
    // case there is, and the two numbers still differ, because one counts rest
    // days and the other does not.
    const dates = daysBetween('2026-07-15', '2026-08-15')
    const calendar = dates.map((d) => {
      const scheduled = !REST_WEEKDAYS.has(new Date(`${d}T00:00:00Z`).getUTCDay())
      return { d, scheduled, logged: scheduled }
    })

    const programDay = dates.length                       // inclusive calendar days
    const { current } = streakFrom(calendar, '2026-08-15')
    const scheduledDays = calendar.filter((x) => x.scheduled).length

    expect(programDay).toBe(32)
    expect(current).toBe(scheduledDays)
    // The gap is the rest days. It is structural, not a sync failure.
    expect(current).toBeLessThan(programDay)
    expect(programDay - current).toBe(dates.length - scheduledDays)
  })

  it('the streak resets on a missed scheduled day; the program day does not', () => {
    const dates = daysBetween('2026-07-15', '2026-08-15')
    const calendar = dates.map((d) => {
      const scheduled = !REST_WEEKDAYS.has(new Date(`${d}T00:00:00Z`).getUTCDay())
      // One session skipped, a fortnight back.
      return { d, scheduled, logged: scheduled && d !== '2026-08-03' }
    })

    const { current } = streakFrom(calendar, '2026-08-15')
    const sinceMiss = calendar.filter((x) => x.scheduled && x.d > '2026-08-03').length

    expect(current).toBe(sinceMiss)
    expect(current).toBeLessThan(dates.length)
  })

  it('a rest day never breaks it — the whole reason the two numbers differ', () => {
    // Wednesday and Saturday are unscheduled, and the walk must step straight
    // over them. A counter that reset here could never exceed three.
    const calendar = daysBetween('2026-07-15', '2026-08-15').map((d) => {
      const scheduled = !REST_WEEKDAYS.has(new Date(`${d}T00:00:00Z`).getUTCDay())
      return { d, scheduled, logged: scheduled }
    })
    expect(streakFrom(calendar, '2026-08-15').current).toBeGreaterThan(3)
  })
})
