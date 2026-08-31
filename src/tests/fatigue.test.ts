import { describe, it, expect } from 'vitest'
import {
  FATIGUE_LEVELS, FATIGUE_SLOTS, REST_SLOTS, TRAINING_SLOTS, SLOT_LABEL,
  fatigueLevel, fatigueDelta, latestFatigue, normalizeSlot, slotsForDay,
  type FatigueDay,
} from '@/lib/hooks/useFatigue'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

describe('the fatigue scale', () => {
  it('is five named levels, ordered, matching the DB CHECK of 1..5', () => {
    expect(FATIGUE_LEVELS).toHaveLength(5)
    expect(FATIGUE_LEVELS.map((l) => l.value)).toEqual([1, 2, 3, 4, 5])
    for (const l of FATIGUE_LEVELS) expect(l.label).toBeTruthy()
  })

  it('gives every level a BEHAVIOURAL sentence, not only a word', () => {
    // The word is the control; the sentence is the definition. Without it
    // "Worn" means whatever the last week taught it to mean, which is how a
    // five-point scale quietly becomes a three-point one.
    for (const l of FATIGUE_LEVELS) {
      expect(l.detail).toBeTruthy()
      expect(l.detail.length).toBeGreaterThan(l.label.length)
      expect(l.hint).toBeTruthy()
    }
  })

  it('names five slots, and the vocabulary is ordered as a day happens', () => {
    expect([...FATIGUE_SLOTS]).toEqual(['waking', 'midday', 'pre', 'post', 'night'])
    for (const s of FATIGUE_SLOTS) expect(SLOT_LABEL[s]).toBeTruthy()
  })

  it('asks three slots a day, and the middle two depend on the day', () => {
    expect([...TRAINING_SLOTS]).toEqual(['waking', 'pre', 'post'])
    expect([...REST_SLOTS]).toEqual(['waking', 'midday', 'night'])
    expect(slotsForDay(true)).toEqual(TRAINING_SLOTS)
    expect(slotsForDay(false)).toEqual(REST_SLOTS)
  })

  it('orders the vocabulary so BOTH day types read forwards through it', () => {
    // This is the whole reason `pre`/`post` sit between `midday` and `night`.
    // Any other order runs one of the two day types backwards, and
    // `latestFatigue` then reports the wrong slot as the day's summary.
    const idx = (s: string) => (FATIGUE_SLOTS as readonly string[]).indexOf(s)
    for (const slots of [TRAINING_SLOTS, REST_SLOTS]) {
      const positions = slots.map((s) => idx(s))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('resolves an unlogged slot to nothing rather than to a level', () => {
    expect(fatigueLevel(null)).toBeNull()
    expect(fatigueLevel(undefined)).toBeNull()
    expect(fatigueLevel(9)).toBeNull()
    expect(fatigueLevel(1)?.label).toBe('Fresh')
  })
})

describe('legacy slot keys', () => {
  it('files a stored clock key onto the slot that day actually asked', () => {
    // The same 13:00 reading is "before training" on a leg day and "midday" on
    // a rest day. A row written under the old vocabulary carries no way to tell
    // them apart, so the DAY decides.
    expect(normalizeSlot('noon', true)).toBe('pre')
    expect(normalizeSlot('noon', false)).toBe('midday')
    expect(normalizeSlot('evening', true)).toBe('post')
    expect(normalizeSlot('evening', false)).toBe('night')
    expect(normalizeSlot('morning', true)).toBe('waking')
  })

  it('folds `eod` onto the same slot as `evening`', () => {
    expect(normalizeSlot('eod', false)).toBe(normalizeSlot('evening', false))
    expect(normalizeSlot('eod', true)).toBe(normalizeSlot('evening', true))
  })

  it('passes a modern key through untouched, and rejects an invented one', () => {
    for (const s of FATIGUE_SLOTS) expect(normalizeSlot(s, true)).toBe(s)
    expect(normalizeSlot('afternoon', true)).toBeNull()
  })
})

describe('the session’s cost', () => {
  it('is post minus pre, and positive means the session took something', () => {
    expect(fatigueDelta({ pre: 2, post: 4 })).toBe(2)
    expect(fatigueDelta({ pre: 4, post: 2 })).toBe(-2)
    expect(fatigueDelta({ pre: 3, post: 3 })).toBe(0)
  })

  it('is null whenever either end is missing — never computed against a gap', () => {
    expect(fatigueDelta({ pre: 2 })).toBeNull()
    expect(fatigueDelta({ post: 4 })).toBeNull()
    expect(fatigueDelta({ waking: 1, midday: 2, night: 3 })).toBeNull()
    expect(fatigueDelta({})).toBeNull()
  })
})

describe('the day’s single reading', () => {
  it('is the LATEST slot, never the mean', () => {
    // The mean of Fresh(1) and Empty(5) is Worn(3) — a reading that describes
    // neither moment and was true at no point in the day.
    const day: FatigueDay = { waking: 1, night: 5 }
    expect(latestFatigue(day)).toEqual({ slot: 'night', level: 5 })
  })

  it('walks backwards through the slots, not through insertion order', () => {
    const day: FatigueDay = { night: 2, waking: 5 }
    expect(latestFatigue(day)?.slot).toBe('night')
    expect(latestFatigue({ waking: 5, midday: 4 })?.slot).toBe('midday')
    expect(latestFatigue({ waking: 5 })?.slot).toBe('waking')
  })

  it('reports the END of a training day, not its middle', () => {
    expect(latestFatigue({ waking: 1, pre: 2, post: 5 })?.slot).toBe('post')
    expect(latestFatigue({ waking: 1, pre: 2 })?.slot).toBe('pre')
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
