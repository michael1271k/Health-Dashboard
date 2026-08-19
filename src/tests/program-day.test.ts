import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { streakFrom, programDayCount, STREAK_WINDOW_DAYS } from '@/lib/training/streak'
import { streakFrom as streakFromDerive } from '@/lib/widget/derive'

/**
 * ONE STREAK.
 *
 * ── WHAT THE 22-VERSUS-32 DISAGREEMENT ACTUALLY WAS ──────────────────────────
 * The dashboard orb showed 32 and the widget showed 22, and it read as the
 * widget being out of sync. Neither was wrong:
 *
 *   · the orb ran `programDay()` — CALENDAR days since the cut began
 *     (2026-07-15). It only ever counts up, and rest days are days.
 *   · the widget runs `streakFrom()` — consecutive SCHEDULED training days
 *     actually trained. Rest days are skipped, a missed session resets it.
 *
 * Ten apart on the same morning, both correct. The first fix was the label, and
 * it was not enough: a flame with a number beside it is read as a streak
 * whatever the caption underneath says. So there is ONE quantity on the flame,
 * derived in one place in the training domain, read by the dashboard orb and by
 * the widget payload from that one place.
 *
 * WHICH quantity flipped on 2026-08-19 — by explicit decision it is the program
 * day, days elapsed since the cut opened. `streakFrom` survives (it is still the
 * honest consecutive-training-days answer, and its arithmetic is still asserted
 * below) but nothing renders it.
 *
 * This file guards the unification, not the choice: that there is exactly one
 * implementation of each, that the surfaces agree about which one is on the
 * flame, and that neither derivation drifted.
 */

const BRAND = readFileSync('src/components/dashboard/BrandHeader.tsx', 'utf8')
const ORB = readFileSync('src/components/dashboard/ReadinessOrb.tsx', 'utf8')
const STREAK = readFileSync('src/lib/training/streak.ts', 'utf8')
const DERIVE = readFileSync('src/lib/widget/derive.ts', 'utf8')

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

const perfectMonth = (missed?: string) =>
  daysBetween('2026-07-15', '2026-08-15').map((d) => {
    const scheduled = !REST_WEEKDAYS.has(new Date(`${d}T00:00:00Z`).getUTCDay())
    return { d, scheduled, logged: scheduled && d !== missed }
  })

describe('there is one streak', () => {
  it('nobody re-implements the counter at a call site', () => {
    // The header is where `programDay()` used to be defined. It may discuss the
    // history in comments — that is where the explanation lives — but the
    // arithmetic belongs in the training domain and nowhere else.
    expect(BRAND).not.toMatch(/export function programDay\(/)
    expect(BRAND).not.toMatch(/export function programStreak\(/)
    expect(ORB).not.toMatch(/export function programDay\(/)
  })

  it('the orb renders the program day, and says so', () => {
    // The assertion is on the JSX text node: the caption is the only thing that
    // tells a reader which of the two quantities the flame is carrying, and it
    // read "Day Streak" over a monotonic counter for exactly one afternoon.
    expect(ORB).toMatch(/>Program Day</)
    expect(ORB).not.toMatch(/>Day Streak</)
  })

  it('has exactly one implementation, in the training domain', () => {
    expect(STREAK).toMatch(/export function streakFrom\(/)
    // derive.ts re-exports it; it must not define a second copy.
    expect(DERIVE).not.toMatch(/export function streakFrom\(/)
    expect(DERIVE).toMatch(/export \{ streakFrom/)
    expect(streakFromDerive).toBe(streakFrom)
  })

  it('both surfaces read the same derivation for the flame', () => {
    const ROUTE = readFileSync('src/app/api/widget/snapshot/route.ts', 'utf8')
    const HOOK = readFileSync('src/lib/hooks/useStreak.ts', 'utf8')
    expect(ROUTE).toMatch(/programDayCount\(/)
    expect(HOOK).toMatch(/programDayCount\(/)
    // The calendar window is still the widget's, and still one constant — the
    // month grid and `streakFrom` are both built from it.
    expect(ROUTE).toMatch(/CALENDAR_DAYS = STREAK_WINDOW_DAYS/)
    expect(STREAK_WINDOW_DAYS).toBe(42)
  })
})

describe('programDayCount', () => {
  it('counts both ends — 15 July is day 1', () => {
    expect(programDayCount('2026-07-15')).toBe(1)
    expect(programDayCount('2026-07-16')).toBe(2)
  })

  it('reads 35 on 2026-08-18, which is what the block is', () => {
    expect(programDayCount('2026-08-18')).toBe(35)
  })

  it('is 0 before the block opened, never negative', () => {
    expect(programDayCount('2026-07-14')).toBe(0)
    expect(programDayCount('2026-01-01')).toBe(0)
  })

  it('only ever rises', () => {
    const a = programDayCount('2026-08-01')
    const b = programDayCount('2026-08-02')
    expect(b).toBe(a + 1)
  })
})

describe('the arithmetic survived the move', () => {
  it('counts every scheduled day on a perfect month', () => {
    const calendar = perfectMonth()
    const scheduledDays = calendar.filter((x) => x.scheduled).length
    expect(streakFrom(calendar, '2026-08-15').current).toBe(scheduledDays)
  })

  it('resets on a missed scheduled day', () => {
    const calendar = perfectMonth('2026-08-03')
    const sinceMiss = calendar.filter((x) => x.scheduled && x.d > '2026-08-03').length
    expect(streakFrom(calendar, '2026-08-15').current).toBe(sinceMiss)
  })

  it('a rest day never breaks it', () => {
    // Wednesday and Saturday are unscheduled, and the walk must step straight
    // over them. A counter that reset here could never exceed three.
    expect(streakFrom(perfectMonth(), '2026-08-15').current).toBeGreaterThan(3)
  })

  it('does not count today against you before you have trained it', () => {
    // 2026-08-14 is a Friday — scheduled, and not yet logged.
    const calendar = daysBetween('2026-07-15', '2026-08-14').map((d) => {
      const scheduled = !REST_WEEKDAYS.has(new Date(`${d}T00:00:00Z`).getUTCDay())
      return { d, scheduled, logged: scheduled && d !== '2026-08-14' }
    })
    const upToYesterday = calendar.filter((x) => x.scheduled && x.d < '2026-08-14').length
    expect(streakFrom(calendar, '2026-08-14').current).toBe(upToYesterday)
  })
})
