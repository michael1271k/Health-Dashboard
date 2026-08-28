import { describe, it, expect } from 'vitest'
import {
  FATIGUE_LEVELS, FATIGUE_SLOTS, SLOT_LABEL, fatigueLevel, latestFatigue, type FatigueDay,
} from '@/lib/hooks/useFatigue'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

describe('the fatigue scale', () => {
  it('is five named levels, ordered, matching the DB CHECK of 1..5', () => {
    expect(FATIGUE_LEVELS).toHaveLength(5)
    expect(FATIGUE_LEVELS.map((l) => l.value)).toEqual([1, 2, 3, 4, 5])
    for (const l of FATIGUE_LEVELS) expect(l.label).toBeTruthy()
  })

  it('names four slots, matching the DB CHECK', () => {
    expect([...FATIGUE_SLOTS]).toEqual(['morning', 'noon', 'evening', 'eod'])
    for (const s of FATIGUE_SLOTS) expect(SLOT_LABEL[s]).toBeTruthy()
  })

  it('resolves an unlogged slot to nothing rather than to a level', () => {
    expect(fatigueLevel(null)).toBeNull()
    expect(fatigueLevel(undefined)).toBeNull()
    expect(fatigueLevel(9)).toBeNull()
    expect(fatigueLevel(1)?.label).toBe('Fresh')
  })
})

describe('the day’s single reading', () => {
  it('is the LATEST slot, never the mean', () => {
    // The mean of Fresh(1) and Empty(5) is Worn(3) — a reading that describes
    // neither moment and was true at no point in the day.
    const day: FatigueDay = { morning: 1, eod: 5 }
    expect(latestFatigue(day)).toEqual({ slot: 'eod', level: 5 })
  })

  it('walks backwards through the slots, not through insertion order', () => {
    const day: FatigueDay = { eod: 2, morning: 5 }
    expect(latestFatigue(day)?.slot).toBe('eod')
    expect(latestFatigue({ morning: 5, noon: 4 })?.slot).toBe('noon')
    expect(latestFatigue({ morning: 5 })?.slot).toBe('morning')
  })

  it('is null on a day with nothing logged', () => {
    expect(latestFatigue({})).toBeNull()
  })
})

describe('rest targets in the export', () => {
  const s = (): ExportSet => ({ weightKg: 40, reps: 10, rpe: 8, side: null, failure: false, pairId: null })

  it('is a per-exercise fact, so it never touches the set lines', () => {
    // Rest is a PRESCRIPTION on the exercise, not a measurement on a set —
    // `workout_sets.rest_sec` is dead and was never written. The set line must
    // stay exactly as it was.
    expect(setDetail([s()])).toEqual(['Set 1: 40 kg × 10 (RPE 8 — Challenging)'])
  })
})
