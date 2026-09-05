import { describe, it, expect } from 'vitest'
import { REFRESH_SCHEDULE, FAILURE_MINUTES, refreshMinutesForHour, refreshesPerDay } from '@/lib/widget/cadence'

/**
 * A REFRESH TABLE THAT ASKS FOR TOO MUCH GETS LESS.
 *
 * WidgetKit grants roughly 40–70 timeline refreshes a day per kind. Past the
 * grant it drops requests rather than stretching the interval, so the widget
 * parks on whatever it last got. The Swift table (`WidgetCadence` in HelixCore)
 * replays this module's golden vectors; this pins the arithmetic itself.
 */
describe('the refresh cadence stays inside the grant', () => {
  it('asks for between 30 and 60 refreshes a day, and fewer than the flat 30 min it replaced', () => {
    const perDay = refreshesPerDay()
    expect(perDay).toBeGreaterThan(30)
    expect(perDay).toBeLessThan(48)
  })

  it('is denser in the morning and evening than in the middle of the day', () => {
    expect(refreshMinutesForHour(8)).toBeLessThan(refreshMinutesForHour(13))
    expect(refreshMinutesForHour(19)).toBeLessThan(refreshMinutesForHour(13))
    expect(refreshMinutesForHour(3)).toBeGreaterThan(refreshMinutesForHour(13))
  })

  it('never proposes an interval WidgetKit would refuse, and retries a failure faster', () => {
    for (const [, minutes] of REFRESH_SCHEDULE) expect(minutes).toBeGreaterThanOrEqual(15)
    expect(FAILURE_MINUTES).toBeLessThan(Math.min(...REFRESH_SCHEDULE.map(([, m]) => m)))
  })

  it('starts at hour 0 and is ordered — the lookup takes the last band at or before the hour', () => {
    expect(REFRESH_SCHEDULE[0][0]).toBe(0)
    const hours = REFRESH_SCHEDULE.map(([h]) => h)
    expect([...hours].sort((a, b) => a - b)).toEqual(hours)
  })
})
