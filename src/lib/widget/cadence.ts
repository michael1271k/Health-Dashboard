/**
 * The widget's refresh cadence, mirrored from Swift so it can be tested.
 *
 * ── THIS IS A GUARD, NOT AN IMPLEMENTATION ───────────────────────────────────
 * Nothing on the web side reads it. `HelixRefresh.schedule` in
 * `ios/App/HelixWidgets/HelixProvider.swift` is the real table; this exists
 * because there is no Swift test runner in this project, and the one property
 * that matters about a refresh table is arithmetic — how many refreshes a day it
 * asks for. A table that quietly drifts past the grant does not fail loudly, it
 * just makes the widget stale at an hour nobody chose.
 *
 * `widget-cadence.test.ts` asserts the two literals agree AND that the daily
 * total stays inside the band.
 *
 * ── WHY THE SHAPE ────────────────────────────────────────────────────────────
 * WidgetKit grants roughly 40–70 timeline refreshes a day, per kind. A flat
 * 15-minute interval asks for 96: past the grant the system drops requests
 * rather than stretching the interval, so asking for more yields LESS. The old
 * flat 30 asked for 48 — already at the top of the band — and spent three of
 * them between midnight and six on a sleeping athlete.
 *
 * Spending the same budget where the day actually is means the widget is
 * meaningfully fresher during the two windows anything changes, for fewer
 * refreshes overall.
 */

/** `[startHour, minutesBetweenRefreshes]`, ordered, starting at hour 0. */
export const REFRESH_SCHEDULE: ReadonlyArray<readonly [number, number]> = [
  [0, 150],   // asleep — the battery decays predictably, nothing is logged
  [6, 20],    // the morning look: last night's sleep has landed
  [10, 45],   // at work
  [17, 20],   // training and the evening meal
  [22, 60],   // winding down
]

/** A failed fetch retries fast and separately from the success cadence. */
export const FAILURE_MINUTES = 5

/** The interval for a given local hour, matching `HelixRefresh.minutes(forHour:)`. */
export function refreshMinutesForHour(hour: number): number {
  let minutes = REFRESH_SCHEDULE[0][1]
  for (const [from, m] of REFRESH_SCHEDULE) if (hour >= from) minutes = m
  return minutes
}

/**
 * Refreshes this table asks for over 24 hours.
 *
 * Fractional on purpose — a band of 4 hours at 45-minute intervals is 5.33
 * requests, and rounding each band before summing would hide exactly the drift
 * this number exists to catch.
 */
export function refreshesPerDay(): number {
  let total = 0
  for (let i = 0; i < REFRESH_SCHEDULE.length; i++) {
    const [from, minutes] = REFRESH_SCHEDULE[i]
    const to = REFRESH_SCHEDULE[i + 1]?.[0] ?? 24
    total += ((to - from) * 60) / minutes
  }
  return total
}
