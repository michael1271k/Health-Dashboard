import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  REFRESH_SCHEDULE, FAILURE_MINUTES, refreshMinutesForHour, refreshesPerDay,
} from '@/lib/widget/cadence'

/**
 * A REFRESH TABLE THAT ASKS FOR TOO MUCH GETS LESS.
 *
 * WidgetKit grants roughly 40–70 timeline refreshes a day per kind. Past the
 * grant it does not stretch the interval — it drops the requests, so the widget
 * parks on whatever it last got, at an hour nobody chose. That failure is
 * invisible: nothing throws, nothing logs, the widget merely goes quiet.
 *
 * The Part 1.5 plan asked for a flat 15-minute daytime interval, which is 96
 * requests a day and would have made the widget staler than the flat 30 it
 * replaced. This test is the reason that cannot be reintroduced by anyone who
 * reasonably assumes "more often" means "fresher".
 *
 * There is no Swift test runner here, so the Swift literal is read as text.
 */

const PROVIDER = readFileSync('ios/App/HelixWidgets/HelixProvider.swift', 'utf8')

/** The `(0, 150), (6, 20), …` tuples out of `HelixRefresh.schedule`. */
function swiftSchedule(): Array<[number, number]> {
  const block = /static let schedule: \[\(fromHour: Int, minutes: Int\)\] = \[([^\]]+)\]/.exec(PROVIDER)
  if (!block) return []
  return [...block[1].matchAll(/\((\d+),\s*(\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])])
}

describe('the refresh cadence stays inside the grant', () => {
  it('asks for between 30 and 60 refreshes a day', () => {
    const perDay = refreshesPerDay()
    // The floor matters as much as the ceiling: a table so sparse it never
    // refreshes is not a fix for one that refreshes too often.
    expect(perDay).toBeGreaterThan(30)
    expect(perDay).toBeLessThan(60)
  })

  it('asks for fewer refreshes than the flat 30 minutes it replaced', () => {
    // 24h / 30min = 48. The whole claim of the shaped table is that it is denser
    // where it matters AND cheaper overall; if that stops being true, the shape
    // is not buying anything.
    expect(refreshesPerDay()).toBeLessThan(48)
  })

  it('is denser in the morning and evening than in the middle of the day', () => {
    const morning = refreshMinutesForHour(8)
    const midday = refreshMinutesForHour(13)
    const evening = refreshMinutesForHour(19)
    const night = refreshMinutesForHour(3)
    expect(morning).toBeLessThan(midday)
    expect(evening).toBeLessThan(midday)
    expect(night).toBeGreaterThan(midday)
  })

  it('never proposes an interval WidgetKit would refuse outright', () => {
    // WidgetKit will not honour a request under 5 minutes, and a table entry
    // that small is a typo rather than an intention.
    for (const [, minutes] of REFRESH_SCHEDULE) expect(minutes).toBeGreaterThanOrEqual(15)
  })

  it('retries a FAILED fetch much faster than a successful one', () => {
    // Thirty minutes of "can't reach HELIX" when the phone regained signal forty
    // seconds later is a widget nobody trusts again.
    expect(FAILURE_MINUTES).toBeLessThan(Math.min(...REFRESH_SCHEDULE.map(([, m]) => m)))
  })
})

describe('the table is the same on both sides', () => {
  it('parses the Swift schedule at all — a silent regex miss passes everything', () => {
    expect(swiftSchedule().length).toBe(REFRESH_SCHEDULE.length)
    expect(swiftSchedule().length).toBeGreaterThan(1)
  })

  it('agrees with the Swift literal band for band', () => {
    expect(swiftSchedule()).toEqual(REFRESH_SCHEDULE.map(([h, m]) => [h, m]))
  })

  it('agrees on the failure interval', () => {
    const swift = /static let failureMinutes = (\d+)/.exec(PROVIDER)
    expect(Number(swift?.[1])).toBe(FAILURE_MINUTES)
  })

  it('starts at hour 0 and is ordered — `minutes(forHour:)` depends on both', () => {
    // The Swift lookup takes the LAST band whose start is at or before the hour,
    // which is only correct for an ordered table that covers hour 0.
    expect(REFRESH_SCHEDULE[0][0]).toBe(0)
    const hours = REFRESH_SCHEDULE.map(([h]) => h)
    expect([...hours].sort((a, b) => a - b)).toEqual(hours)
  })
})
