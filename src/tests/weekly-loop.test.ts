import { describe, it, expect } from 'vitest'
import { buildWeeklyExport, type WeeklyExportInput } from '@/lib/reports/weeklyExport'
import { stallProtocol, rollingAverage, type DayPoint, type SessionPoint } from '@/lib/coach/insights'

const day = (date: string, p: Partial<DayPoint>): DayPoint => ({
  date, sleepMin: null, restHr: null, respiratory: null, weightKg: null,
  calories: null, calorieGoal: null, ...p,
})

/** n days of a perfectly flat weight — a genuine stall. */
function flatWeeks(days: number, kg: number, extra: Partial<DayPoint> = {}): DayPoint[] {
  return Array.from({ length: days }, (_, i) =>
    day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: kg, ...extra }))
}

describe('rollingAverage', () => {
  it('produces a 7-day window series', () => {
    expect(rollingAverage([1, 2, 3, 4, 5, 6, 7], 7)).toEqual([4])
    expect(rollingAverage([1, 2, 3], 7)).toEqual([])
  })
})

describe('stallProtocol — one lever, never a list', () => {
  const noSessions: SessionPoint[] = []

  it('stays silent without enough history', () => {
    expect(stallProtocol(flatWeeks(10, 65), noSessions)).toBeNull()
  })

  it('fires on a genuine 14-day flat rolling average', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out).not.toBeNull()
    expect(out!.id).toBe('stall-protocol')
    expect(out!.headline).toMatch(/stall/i)
  })

  it('picks the STEPS lever when steps are the weakest input', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out!.detail).toMatch(/1,500 steps/)
    expect(out!.detail).not.toMatch(/carb/i)
  })

  it('picks the CARB lever when steps are already high but carbs are not', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 220 }), noSessions)
    expect(out!.detail).toMatch(/100 kcal of carbs/)
  })

  it('falls back to the VOLUME lever when steps and carbs are both tight', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 90 }), noSessions)
    expect(out!.detail).toMatch(/one set per muscle/)
  })

  it('does NOT fire when a heavy session lands in the final 72h (that is water)', () => {
    const days = flatWeeks(25, 65, { steps: 6000 })
    const recent = days.slice(-2)[0].date
    expect(stallProtocol(days, [{ date: recent, volumeKg: 9000 }])).toBeNull()
  })

  it('does NOT fire when the rolling average is genuinely falling', () => {
    const days = Array.from({ length: 25 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: 68 - i * 0.08, steps: 6000 }))
    expect(stallProtocol(days, [])).toBeNull()
  })
})

describe('buildWeeklyExport', () => {
  const input: WeeklyExportInput = {
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955,
    days: [
      { date: '2026-07-19', weekdayLabel: 'Sun', weightKg: 65.3, calories: 1940, proteinG: 172, carbsG: 190, fatG: 54, steps: 9200, sleepMin: 551, waterMl: 3000, score: 88 },
      { date: '2026-07-20', weekdayLabel: 'Mon', weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, sleepMin: null, waterMl: null, score: null },
    ],
    sessions: [
      { date: '2026-07-19', label: 'Upper A', volumeKg: 8240, setCount: 24, durationMin: 68, prCount: 2,
        exercises: [{ name: 'Chest Press', sets: 4, topKg: 60, bestE1rm: 72.5 }] },
    ],
    volumeByMuscle: [
      { muscle: 'Chest', sets: 11, target: 11 },
      { muscle: 'Biceps', sets: 4, target: 8 },
    ],
  }

  it('is deterministic (same input → identical string)', () => {
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('marks missing data as "—" instead of dropping the row or implying zero', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/Mon\s+\| 2026-07-20/)   // the empty day is still present
    expect(out).toMatch(/—/)
    expect(out).not.toMatch(/Mon.*\| *0 \|/)   // never fabricates a 0
  })

  it('includes the AI instruction header, aggregates, sessions and volume targets', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/WEEKLY SUMMARY/)
    expect(out).toMatch(/never invent data/)
    expect(out).toMatch(/Helix Cut/)
    expect(out).toMatch(/Upper A/)
    expect(out).toMatch(/Chest Press/)
    expect(out).toMatch(/Biceps: 4\/8 UNDER/)  // under-target flagged for the model
  })
})
