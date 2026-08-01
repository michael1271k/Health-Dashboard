import { describe, it, expect } from 'vitest'
import { buildIntensityCalendar } from '@/lib/charts/intensityCalendar'

const vols = (pairs: Array<[string, number]>) => new Map(pairs)

describe('buildIntensityCalendar', () => {
  it('marks days after today as NOT elapsed, so they render absent, not as rest', () => {
    // 2026-07-29 is a Wednesday; the grid still runs to Saturday.
    const m = buildIntensityCalendar(vols([['2026-07-27', 5000]]), 7, '2026-07-29')!
    const week = m.weeks[m.weeks.length - 1]
    expect(week.map((c) => c.date)).toEqual([
      '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29',
      '2026-07-30', '2026-07-31', '2026-08-01',
    ])
    expect(week.slice(0, 4).every((c) => c.elapsed)).toBe(true)
    expect(week.slice(4).every((c) => c.elapsed)).toBe(false)
  })

  it('averages over ELAPSED days, not over active days', () => {
    // 8 000 kg across a 7-day week with two sessions. The average LOAD of that
    // week is 8000/7 ≈ 1143 — the old code reported 8000/2 = 4000 and called it
    // "Avg load", which is the average of the days you trained.
    const m = buildIntensityCalendar(
      vols([['2026-07-26', 5000], ['2026-07-28', 3000]]), 7, '2026-08-01',
    )!
    expect(m.stats.avgLoad).toBeCloseTo(8000 / 7, 0)
    expect(m.stats.activeDays).toBe(2)
  })

  it('scales heat against the heaviest day in the window', () => {
    const m = buildIntensityCalendar(
      vols([['2026-07-26', 10000], ['2026-07-27', 5000]]), 7, '2026-08-01',
    )!
    const byDate = new Map(m.weeks.flat().map((c) => [c.date, c.t]))
    expect(byDate.get('2026-07-26')).toBe(1)
    expect(byDate.get('2026-07-27')).toBe(0.5)
    expect(byDate.get('2026-07-29')).toBe(0)
  })

  it('counts the longest run of CONSECUTIVE active days', () => {
    const m = buildIntensityCalendar(vols([
      ['2026-07-26', 1], ['2026-07-27', 1], ['2026-07-28', 1],  // 3 in a row
      ['2026-07-31', 1],                                         // gap, then 1
    ]), 7, '2026-08-01')!
    expect(m.stats.streak).toBe(3)
  })

  it('reports a streak of 1 for a single logged day, never 0', () => {
    const m = buildIntensityCalendar(vols([['2026-07-28', 1]]), 7, '2026-08-01')!
    expect(m.stats.streak).toBe(1)
  })

  it('names the heaviest day', () => {
    const m = buildIntensityCalendar(
      vols([['2026-07-26', 4000], ['2026-07-29', 9000], ['2026-07-31', 6000]]), 7, '2026-08-01',
    )!
    expect(m.stats.hardest).toEqual({ date: '2026-07-29', volume: 9000 })
  })

  it('ignores logged days that fall OUTSIDE the rendered window', () => {
    // 7-day window rendered from 2026-07-26; the June session is off-grid and
    // must not distort the average or claim "hardest".
    const m = buildIntensityCalendar(
      vols([['2026-06-01', 99_999], ['2026-07-28', 3000]]), 7, '2026-08-01',
    )!
    expect(m.stats.hardest).toEqual({ date: '2026-07-28', volume: 3000 })
    expect(m.stats.activeDays).toBe(1)
  })

  it('caps at 16 week columns however long the era is', () => {
    const m = buildIntensityCalendar(vols([['2026-07-28', 1]]), 365, '2026-08-01')!
    expect(m.weeks).toHaveLength(16)
  })

  it('renders at least one week for a sub-week range', () => {
    const m = buildIntensityCalendar(vols([['2026-07-28', 1]]), 3, '2026-08-01')!
    expect(m.weeks).toHaveLength(1)
  })

  it('is null with nothing logged rather than dividing by zero', () => {
    expect(buildIntensityCalendar(new Map(), 30, '2026-08-01')).toBeNull()
  })
})
