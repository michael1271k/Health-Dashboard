import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { WIDGET_KINDS, DAY_KINDS } from '@/lib/native/widgetKinds'

/**
 * THE APP AND THE EXTENSION MUST AGREE ON WHAT THE WIDGETS ARE CALLED.
 *
 * `HelixWidgetBridge.swift` used to reload every timeline unconditionally, and
 * argued for it: *"enumerating that list here would be a second place to forget
 * a widget"*. The hazard is real. The conclusion was wrong — WidgetKit budgets
 * reloads PER KIND, so a blanket reload spends the Training widget's whole daily
 * allowance on water logs and then has nothing left when a session commits.
 *
 * This test is what makes targeting safe: the list is kept honest by a machine
 * rather than by memory. A `kind:` string that exists in Swift but not in
 * `WIDGET_KINDS` would never be reloaded by a targeted call — a widget that
 * quietly stops updating, with nothing to see and nothing to log. A kind in
 * `WIDGET_KINDS` with no Swift widget would be a silently ignored reload.
 * Both directions fail here.
 */

const WIDGETS = readFileSync('ios/App/HelixWidgets/HelixWidgets.swift', 'utf8')
const DAILY = readFileSync('ios/App/HelixWidgets/HelixDaily.swift', 'utf8')
const BRIDGE = readFileSync('ios/App/App/HelixWidgetBridge.swift', 'utf8')

/** Every `kind: "…"` passed to an `AppIntentConfiguration` in the extension. */
function swiftKinds(): string[] {
  const found = new Set<string>()
  for (const src of [WIDGETS, DAILY]) {
    for (const m of src.matchAll(/kind:\s*"([^"]+)"/g)) found.add(m[1])
  }
  return [...found]
}

describe('widget kinds', () => {
  it('finds kinds at all — a silent regex miss would pass everything', () => {
    expect(swiftKinds().length).toBeGreaterThanOrEqual(4)
  })

  it('the Swift kinds and WIDGET_KINDS are the same set', () => {
    expect([...swiftKinds()].sort()).toEqual([...WIDGET_KINDS].sort())
  })

  it('has no duplicates — two widgets sharing a kind is a WidgetKit collision', () => {
    expect(new Set(WIDGET_KINDS).size).toBe(WIDGET_KINDS.length)
  })
})

describe('the day-to-day subset', () => {
  it('is a real subset of the full list', () => {
    for (const kind of DAY_KINDS) expect(WIDGET_KINDS as readonly string[]).toContain(kind)
  })

  it('deliberately EXCLUDES Training — that is the entire point', () => {
    // Water, macros and a nutrition context move the score and the battery.
    // None of them moves the calendar, the streak or today's logged session.
    // If Training ever creeps into this list, the budget saving is gone and a
    // session commit is competing with a glass of water for the same allowance.
    expect(DAY_KINDS).not.toContain('HelixTrainingFamily')
  })

  it('still covers every family that renders a score or a battery', () => {
    // Fuel draws the battery, Body draws the score breakdown, Lock draws both,
    // Daily draws all of it. Dropping any of them means a stale number on a
    // surface the user is looking at.
    for (const kind of ['HelixFuelFamily', 'HelixBodyFamily', 'HelixLockFamily', 'HelixDailyFamily']) {
      expect(DAY_KINDS as readonly string[]).toContain(kind)
    }
  })
})

describe('the bridge honours the contract', () => {
  it('still reloads everything when handed no kinds', () => {
    // `reloadWidgets()` with no argument is the safe default, and every caller
    // that has not thought about which kinds it touches relies on it.
    expect(BRIDGE).toMatch(/kinds\.isEmpty/)
    expect(BRIDGE).toMatch(/reloadAllTimelines\(\)/)
  })

  it('reloads by kind when it is given some', () => {
    expect(BRIDGE).toMatch(/reloadTimelines\(ofKind:/)
  })
})
