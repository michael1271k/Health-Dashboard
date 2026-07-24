import { describe, it, expect } from 'vitest'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay } from '@/lib/reports/weeklyExport'
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
  const emptyDay = (date: string, weekdayLabel: string): ExportDay => ({
    date, weekdayLabel, isTrainingDay: false,
    weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
    steps: null, distanceM: null, activeKcal: null, trainingMin: null,
    sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
    waterMl: null, supplementsTaken: null, score: null, batteryPct: null,
  })

  const input: WeeklyExportInput = {
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [
      {
        ...emptyDay('2026-07-19', 'Sun'), isTrainingDay: true,
        weightKg: 65.3, calories: 1940, proteinG: 172, carbsG: 190, fatG: 54,
        steps: 9200, distanceM: 7100, activeKcal: 520, trainingMin: 68,
        sleepMin: 551, restingHr: 48, hrvMs: 62, waterMl: 3000,
        supplementsTaken: 3, score: 88, batteryPct: 72,
      },
      emptyDay('2026-07-20', 'Mon'),
    ],
    sessions: [
      {
        date: '2026-07-19', label: 'Upper A', volumeKg: 8240, setCount: 24,
        durationMin: 68, avgBpm: 118,
        exercises: [{
          name: 'Chest Press', repWindow: '10–12', topKg: 60, bestE1rm: 72.5,
          sets: [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 11 }, { weightKg: 57.5, reps: 10 }],
        }],
        prs: [{ name: 'Chest Press', e1rmKg: 72.5, weightKg: 60, reps: 12 }],
      },
    ],
    volumeByMuscle: [
      { muscle: 'Chest', sets: 11, target: 11 },
      { muscle: 'Biceps', sets: 4, target: 8 },
    ],
    doms: [{ date: '2026-07-20', muscle: 'Quads', severity: 2 }],
    previous: {
      avgKcal: 2010, avgProtein: 160, avgSteps: 8000, avgSleepMin: 500,
      sessions: 4, volumeKg: 30000, sets: 90, weightStart: 66.0, weightEnd: 65.6,
    },
  }

  it('is deterministic (same input → identical string)', () => {
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('marks missing data as "—" instead of dropping the row or implying zero', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/\| Mon \| 2026-07-20 \|/)   // the empty day is still present
    expect(out).toMatch(/—/)
    expect(out).not.toMatch(/\| Mon \|.*\| 0 \|/)    // never fabricates a 0
  })

  it('includes the instruction header, aggregates, and volume targets', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/elite physique coach/)
    expect(out).toMatch(/Never invent data/)
    expect(out).toMatch(/Helix Cut/)
    expect(out).toMatch(/Upper A/)
    expect(out).toMatch(/\| Biceps \| 4 \| 8 \| UNDER \|/)  // under-target flagged
  })

  it('lists EVERY working set, grouped by load — not just the top set', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/60kg × 12,11/)
    expect(out).toMatch(/57\.5kg × 10/)
    expect(out).toMatch(/target 10–12/)
  })

  it('names the PRs rather than counting them', () => {
    expect(buildWeeklyExport(input)).toMatch(/PRs: Chest Press 60kg × 12/)
  })

  it('carries energy expenditure and recovery signals per day', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/\| 9200 \| 7\.10 \| 520 \|/)  // steps, km, active kcal
    expect(out).toMatch(/\| 48 \| 62 \|/)               // RHR, HRV
  })

  it('includes a week-over-week block and soreness', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/vs previous week/)
    expect(out).toMatch(/kcal\/day: 1940 \(-70 vs prev\)/)
    expect(out).toMatch(/Quads: 2 \(moderate\)/)
  })

  it('omits the comparison block entirely when there is no previous week', () => {
    const out = buildWeeklyExport({ ...input, previous: null })
    expect(out).not.toMatch(/vs previous week/)
  })
})
