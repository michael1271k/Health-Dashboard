import { describe, it, expect, afterEach } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import { scheduleDayFor, isTrainingDay, isRestDayFor } from '@/lib/programs'
import { buildTemplateDraft } from '@/lib/sessions/templateDraft'
import { setScheduleOverrideLocal } from '@/lib/schedule/overrides'
import { protocolForDate } from '@/lib/supplements'

describe('multivitamin dosing', () => {
  const multi = (weekday: number) =>
    protocolForDate(true, weekday).flatMap((s) => s.items).find((i) => i.key === 'multivitamin')!.dose
  it('is 2 tabs on Monday & Friday, 1 tab otherwise', () => {
    expect(multi(1)).toBe('2 tabs') // Mon
    expect(multi(5)).toBe('2 tabs') // Fri
    expect(multi(0)).toBe('1 tab')  // Sun
    expect(multi(3)).toBe('1 tab')  // Wed
  })
})

const cbB = PROGRAMS.apex51.days.find((d) => d.key === 'cb_b')!
const legsB = PROGRAMS.apex51.days.find((d) => d.key === 'legs_b')!

describe('buildTemplateDraft — per-set seed + cardio + memory override', () => {
  it('seeds Upper B with the Treadmill warm-up and exact per-set numbers', () => {
    const d = buildTemplateDraft(cbB, '2026-07-16')
    // Universal 0.37 km Treadmill warm-up first, excluded from sets.
    expect(d.exercises[0]).toMatchObject({ name: 'Treadmill', kind: 'cardio', distanceKm: 0.37, durationSec: 300 })
    expect(d.exercises[0].note).toContain('Pace rising')
    expect(d.exercises[0].sets).toHaveLength(0)
    const chest = d.exercises.find((e) => e.name === 'Chest Press (Machine)')!
    expect(chest.sets).toEqual([{ weightKg: 35, reps: 12 }, { weightKg: 37.5, reps: 12 }, { weightKg: 37.5, reps: 12 }])
  })

  it('prepends the Treadmill warm-up to non-seed days too (e.g. Upper A)', () => {
    const cbA = PROGRAMS.apex51.days.find((day) => day.key === 'cb_a')!
    const d = buildTemplateDraft(cbA, '2026-07-16')
    expect(d.exercises[0]).toMatchObject({ name: 'Treadmill', kind: 'cardio', distanceKm: 0.37 })
  })

  it('seeds Legs & Core B bodyweight moves at 0 kg', () => {
    const d = buildTemplateDraft(legsB, '2026-07-16')
    const plank = d.exercises.find((e) => e.name === 'Side Plank')!
    expect(plank.sets).toEqual([{ weightKg: 0, reps: 55 }, { weightKg: 0, reps: 52 }])
  })

  it('memory overrides the fallback numbers but keeps the seed set count', () => {
    const exMap = new Map([['Chest Press (Machine)', 'id-chest']])
    const memory = new Map([['id-chest', { weightKg: 40, reps: 10 }]])
    const d = buildTemplateDraft(cbB, '2026-07-16', exMap, memory)
    const chest = d.exercises.find((e) => e.name === 'Chest Press (Machine)')!
    expect(chest.sets).toEqual([{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }])
  })

  it('stamps a stable, template-scoped clientSessionId for idempotent commits', () => {
    const d = buildTemplateDraft(cbB, '2026-07-16')
    expect(d.clientSessionId).toMatch(/^tpl-2026-07-16-cb_b-/)
  })
})

describe('swap-aware schedule engine', () => {
  const WED = '2026-07-22' // Wednesday (default rest in HELIX-5)
  const TUE = '2026-07-21' // Tuesday (default Delts & Arms)

  afterEach(() => {
    setScheduleOverrideLocal(WED, null)
    setScheduleOverrideLocal(TUE, null)
  })

  it('a swap makes a rest day a training day (and cascades to the helpers)', () => {
    expect(isRestDayFor(WED)).toBe(true)
    setScheduleOverrideLocal(WED, 'arms')
    const s = scheduleDayFor(WED)
    expect(s).not.toBe('rest')
    expect(s !== 'rest' && s.dayKey).toBe('arms')
    expect(isTrainingDay(WED)).toBe(true)
    expect(isRestDayFor(WED)).toBe(false)
  })

  it('vacating a training day marks it rest', () => {
    expect(isTrainingDay(TUE)).toBe(true)
    setScheduleOverrideLocal(TUE, 'rest')
    expect(scheduleDayFor(TUE)).toBe('rest')
    expect(isRestDayFor(TUE)).toBe(true)
  })
})
