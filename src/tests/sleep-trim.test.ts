import { describe, it, expect } from 'vitest'
import { trimStages, trimNight, spanMinutes, isDurationOnly, type NightStages } from '@/lib/sleep/trim'
import { manualSleepSentinel, isManualSleepHkUuid } from '@/lib/sleep/manualSleep'

// Strategy B — the no-samples rule. The golden vector pins the Swift twin to
// these numbers; this file pins the TypeScript to the rule it states.

const night: NightStages = { asleepMin: 431, deepMin: 74, remMin: 96, coreMin: 261, awakeMin: 18 }

describe('sleep trim — strategy B', () => {
  it('a shift changes nothing', () => {
    const t = trimStages(night, 480, 480)
    expect(t).toMatchObject({ ...night, cutMin: 0, addedMin: 0 })
  })

  it('a trim removes awake minutes first', () => {
    const t = trimStages(night, 480, 470)
    expect(t.awakeMin).toBe(8)
    expect(t.asleepMin).toBe(431)
    expect(t.deepMin + t.remMin + t.coreMin).toBe(431)
    expect(t.cutMin).toBe(10)
  })

  it('past the awake minutes, the stages shrink in proportion and still sum to the total', () => {
    const t = trimStages(night, 480, 420)   // 60 cut: 18 awake, 42 asleep
    expect(t.awakeMin).toBe(0)
    expect(t.asleepMin).toBe(389)
    expect(t.deepMin + t.remMin + t.coreMin).toBe(389)
    expect(t.deepMin).toBe(Math.round(74 * 389 / 431))
    expect(t.remMin).toBe(Math.round(96 * 389 / 431))
  })

  it('an extension adds core only — no samples means no stage claim', () => {
    const t = trimStages(night, 480, 510)
    expect(t).toMatchObject({ asleepMin: 461, deepMin: 74, remMin: 96, coreMin: 291, awakeMin: 18, addedMin: 30, cutMin: 0 })
  })

  it('a degenerate window is read as exactly as long as its own minutes', () => {
    // A legacy row: end_time = start_time, seven hours of sleep.
    const t = trimStages(night, 0, 449)           // 431 + 18 = 449 → a shift
    expect(t.cutMin).toBe(0)
    expect(t.addedMin).toBe(0)
    const shorter = trimStages(night, 0, 419)     // 30 off: 18 awake, 12 asleep
    expect(shorter.asleepMin).toBe(419)
    expect(shorter.awakeMin).toBe(0)
  })

  it('a trim can never leave a negative stage or a negative total', () => {
    const t = trimStages(night, 480, 0)
    expect(t.asleepMin).toBe(0)
    expect(t.awakeMin).toBe(0)
    expect(t.deepMin).toBe(0)
    expect(t.remMin).toBe(0)
    expect(t.coreMin).toBe(0)
  })

  it('a duration-only row stays duration-only and shrinks in core', () => {
    const legacy: NightStages = { asleepMin: 420, deepMin: 0, remMin: 0, coreMin: 420, awakeMin: 0 }
    expect(isDurationOnly(legacy)).toBe(true)
    const t = trimStages(legacy, 420, 390)
    expect(t).toMatchObject({ asleepMin: 390, coreMin: 390, deepMin: 0, remMin: 0, awakeMin: 0, durationOnly: true })
  })

  it('reads the spans off the row and the edit', () => {
    expect(spanMinutes('2026-09-05T22:46:00+00:00', '2026-09-06T06:46:00+00:00')).toBe(480)
    expect(spanMinutes('2026-09-05T22:46:00Z', 'garbage')).toBe(0)
    const t = trimNight(
      { start: '2026-09-05T22:46:00Z', end: '2026-09-06T06:46:00Z', ...night },
      { start: '2026-09-05T23:16:00Z', end: '2026-09-06T06:46:00Z' },
    )
    expect(t.cutMin).toBe(30)
    expect(t.awakeMin).toBe(0)
    expect(t.asleepMin).toBe(419)
  })

  it('an edit that does not parse, or is inverted, leaves the night unchanged', () => {
    const row = { start: '2026-09-05T22:46:00Z', end: '2026-09-06T06:46:00Z', ...night }
    expect(trimNight(row, { start: 'yesterday', end: 'today' })).toMatchObject({ ...night, cutMin: 0, addedMin: 0 })
    expect(trimNight(row, { start: row.end, end: row.start })).toMatchObject({ ...night, cutMin: 0, addedMin: 0 })
  })
})

describe('the sleep sentinel', () => {
  it('is per night and recognised by prefix', () => {
    expect(manualSleepSentinel('2026-09-06')).toBe('manual-sleep-2026-09-06')
    expect(isManualSleepHkUuid('manual-sleep-2026-09-06')).toBe(true)
    expect(isManualSleepHkUuid('manual-water-2026-09-06')).toBe(false)
    expect(isManualSleepHkUuid(null)).toBe(false)
  })
})
