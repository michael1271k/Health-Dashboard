import { pearson, linregSlope, computeInsights, mean, type DayPoint, type SessionPoint } from '@/lib/coach/insights'
import { formatRelativeTime } from '@/lib/utils/format'

const day = (date: string, p: Partial<DayPoint>): DayPoint => ({
  date, sleepMin: null, restHr: null, respiratory: null, weightKg: null,
  calories: null, calorieGoal: null, ...p,
})

describe('pearson', () => {
  it('returns null with fewer than 4 pairs', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull()
  })
  it('detects a perfect positive correlation', () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!).toBeCloseTo(1, 5)
  })
  it('detects a perfect negative correlation', () => {
    expect(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])!).toBeCloseTo(-1, 5)
  })
  it('returns null on zero variance', () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
  })
})

describe('linregSlope', () => {
  it('returns null under 3 points', () => expect(linregSlope([1, 2])).toBeNull())
  it('computes a constant positive slope', () => expect(linregSlope([0, 2, 4, 6])!).toBeCloseTo(2, 5))
  it('mean helper', () => expect(mean([2, 4, 6])).toBe(4))
})

describe('computeInsights', () => {
  it('returns [] when there is no data', () => {
    expect(computeInsights({ days: [], sessions: [] })).toEqual([])
  })

  it('flags a short-sleep training-volume drop', () => {
    const days: DayPoint[] = [
      day('2026-06-01', { sleepMin: 360 }),
      day('2026-06-02', { sleepMin: 370 }),
      day('2026-06-03', { sleepMin: 460 }),
      day('2026-06-04', { sleepMin: 470 }),
    ]
    const sessions: SessionPoint[] = [
      { date: '2026-06-01', volumeKg: 3000 },
      { date: '2026-06-02', volumeKg: 3100 },
      { date: '2026-06-03', volumeKg: 4000 },
      { date: '2026-06-04', volumeKg: 4200 },
    ]
    const out = computeInsights({ days, sessions })
    const sv = out.find((i) => i.id === 'sleep-volume')
    expect(sv).toBeTruthy()
    expect(sv!.tone).toBe('caution')
  })

  it('surfaces a rising resting-HR fatigue signal', () => {
    const days: DayPoint[] = [
      day('2026-06-01', { restHr: 54 }),
      day('2026-06-02', { restHr: 55 }),
      day('2026-06-03', { restHr: 54 }),
      day('2026-06-04', { restHr: 60 }),
      day('2026-06-05', { restHr: 61 }),
      day('2026-06-06', { restHr: 62 }),
    ]
    const out = computeInsights({ days, sessions: [] })
    expect(out.find((i) => i.id === 'recovery-drift')?.tone).toBe('caution')
  })
})

describe('formatRelativeTime', () => {
  it('just now', () => expect(formatRelativeTime(new Date())).toBe('just now'))
  it('minutes ago', () => expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe('5m ago'))
  it('hours ago', () => expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000))).toBe('3h ago'))
  it('em-dash on null/invalid', () => {
    expect(formatRelativeTime(null)).toBe('—')
    expect(formatRelativeTime('not-a-date')).toBe('—')
  })
})
