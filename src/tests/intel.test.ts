import { describe, it, expect } from 'vitest'
import { IngestPayloadSchema } from '@/lib/ingest/schema'
import { computeSleepDebt } from '@/lib/hooks/useSleepDebt'
import { computeInsights, daysSinceLastSession, fuelVsForce, trainingGap, type DayPoint, type SessionPoint } from '@/lib/coach/insights'
import { dayCompleteness, type DayVaultData } from '@/lib/hooks/useDayVault'
import { logicalTodayISO, logicalDaysAgoISO } from '@/lib/utils/day'

// ── Advanced-metric schema mapping ─────────────────────────────────────────
describe('advanced ingest fields', () => {
  it('accepts wrist_temp / time_in_daylight / heart_rate_recovery (native canonical keys)', () => {
    const r = IngestPayloadSchema.safeParse({
      wrist_temp: 0.4, time_in_daylight: '95', heart_rate_recovery: 31,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.wrist_temp).toBe(0.4)
      expect(r.data.time_in_daylight).toBe(95)
      expect(r.data.heart_rate_recovery).toBe(31)
    }
  })

  it('treats junk values for the new fields as absent (never throws)', () => {
    const r = IngestPayloadSchema.safeParse({ wrist_temp: 'null', time_in_daylight: false, heart_rate_recovery: '' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.wrist_temp).toBeUndefined()
      expect(r.data.time_in_daylight).toBeUndefined()
      expect(r.data.heart_rate_recovery).toBeUndefined()
    }
  })
})

// ── Sleep Debt Bank ──────────────────────────────────────────────────────────
describe('computeSleepDebt', () => {
  const today = logicalTodayISO()
  const d = (n: number) => logicalDaysAgoISO(n)

  it('accumulates shortfall vs the goal', () => {
    // Three recent nights of 7h vs an 8h goal → 3h debt.
    const debt = computeSleepDebt(
      [{ date: d(3), sleepMinutes: 420 }, { date: d(2), sleepMinutes: 420 }, { date: d(1), sleepMinutes: 420 }],
      8,
    )
    expect(debt.debtHours).toBe(3)
    expect(debt.nights).toBe(3)
    expect(debt.worstNightMin).toBe(420)
  })

  it('surplus nights repay debt but never bank credit below zero', () => {
    const debt = computeSleepDebt(
      [
        { date: d(3), sleepMinutes: 420 },  // −1h
        { date: d(2), sleepMinutes: 600 },  // +2h surplus repays…
        { date: d(1), sleepMinutes: 480 },  // on goal
      ],
      8,
    )
    expect(debt.debtHours).toBe(0)          // …but never goes negative
  })

  it('decays week-old shortfall by 0.75', () => {
    // One 2h-short night ~10 days ago → 1.5h effective debt.
    const debt = computeSleepDebt([{ date: d(10), sleepMinutes: 360 }], 8)
    expect(debt.debtHours).toBe(1.5)
  })

  it('ignores null / zero nights entirely', () => {
    const debt = computeSleepDebt(
      [{ date: d(2), sleepMinutes: null }, { date: d(1), sleepMinutes: 0 }, { date: today, sleepMinutes: 480 }],
      8,
    )
    expect(debt.nights).toBe(1)
    expect(debt.debtHours).toBe(0)
  })
})

// ── Fuel → Force correlator ──────────────────────────────────────────────────
describe('fuelVsForce', () => {
  const day = (date: string, carbsG: number | null): DayPoint => ({
    date, sleepMin: null, restHr: null, respiratory: null, weightKg: null,
    calories: null, calorieGoal: null, carbsG,
  })

  it('stays silent with fewer than 8 paired sessions', () => {
    const days = [day('2026-07-01', 200)]
    const sessions: SessionPoint[] = [{ date: '2026-07-02', volumeKg: 10000 }]
    expect(fuelVsForce(days, sessions)).toBeNull()
  })

  it('detects a positive carbs→volume separation', () => {
    const days: DayPoint[] = []
    const sessions: SessionPoint[] = []
    // 5 low-carb (100g) days → 10t sessions; 5 high-carb (250g) days → 12t sessions.
    for (let i = 0; i < 10; i++) {
      const dd = `2026-06-${String(i + 1).padStart(2, '0')}`
      const sd = `2026-06-${String(i + 2).padStart(2, '0')}`
      const high = i % 2 === 1
      days.push(day(dd, high ? 250 : 100))
      sessions.push({ date: sd, volumeKg: high ? 12000 : 10000 })
    }
    const insight = fuelVsForce(days, sessions)
    expect(insight).not.toBeNull()
    expect(insight!.tone).toBe('positive')
    expect(insight!.headline).toContain('+20%')
  })

  it('stays silent when the separation is under 5%', () => {
    const days: DayPoint[] = []
    const sessions: SessionPoint[] = []
    for (let i = 0; i < 10; i++) {
      const dd = `2026-06-${String(i + 1).padStart(2, '0')}`
      const sd = `2026-06-${String(i + 2).padStart(2, '0')}`
      const high = i % 2 === 1
      days.push(day(dd, high ? 250 : 100))
      sessions.push({ date: sd, volumeKg: high ? 10200 : 10000 })  // +2% only
    }
    expect(fuelVsForce(days, sessions)).toBeNull()
  })
})

// ── Gap-aware coach ────────────────────────────────────────────────
describe('training gap awareness', () => {
  const day = (date: string): DayPoint => ({
    date, sleepMin: 420, restHr: 55, respiratory: null, weightKg: null,
    calories: 1900, calorieGoal: 1955, carbsG: 195,
  })

  it('daysSinceLastSession: null with no sessions, exact day count otherwise', () => {
    expect(daysSinceLastSession([], '2026-07-11')).toBeNull()
    expect(daysSinceLastSession([{ date: '2026-06-28', volumeKg: 10000 }], '2026-07-11')).toBe(13)
  })

  it('a 7d+ gap emits the gap insight and SUPPRESSES volume comparisons', () => {
    const days = ['2026-07-05', '2026-07-06', '2026-07-07'].map(day)
    const sessions: SessionPoint[] = [{ date: '2026-06-28', volumeKg: 10000 }]
    const insights = computeInsights({ days, sessions, todayISO: '2026-07-11' }, 5)
    expect(insights.some((i) => i.id === 'training-gap')).toBe(true)
    expect(insights.some((i) => i.id === 'fuel-force')).toBe(false)
    const gap = insights.find((i) => i.id === 'training-gap')!
    expect(gap.headline).toContain('13 days')
  })

  it('zero sessions ever → explicit "no history" insight, nothing invented', () => {
    const g = trainingGap([], '2026-07-11')!
    expect(g.headline).toMatch(/no training history/i)
    expect(g.detail).toMatch(/paused/i)
  })

  it('recent training (< 7d gap) keeps normal builders and no gap insight', () => {
    const days = ['2026-07-08', '2026-07-09', '2026-07-10'].map(day)
    const sessions: SessionPoint[] = [{ date: '2026-07-09', volumeKg: 10000 }]
    const insights = computeInsights({ days, sessions, todayISO: '2026-07-11' }, 5)
    expect(insights.some((i) => i.id === 'training-gap')).toBe(false)
  })
})

// ── Day Vault completeness ───────────────────────────────────────────────────
describe('dayCompleteness', () => {
  const base: DayVaultData = { log: null, score: null, nutrition: null, sessions: [] }

  it('empty day → 0/3, never invalid', () => {
    expect(dayCompleteness(base).done).toBe(0)
  })

  it('counts the core trio independently', () => {
    const d: DayVaultData = {
      ...base,
      log: { sleep_minutes: 460, water_ml: 2500 } as DayVaultData['log'],
      nutrition: { calories: 1900, protein_g: 180, carbs_g: 170, fat_g: 55, phase: 'cut' },
    }
    const { done, parts } = dayCompleteness(d)
    expect(done).toBe(3)
    expect(parts).toEqual([true, true, true])
  })

  it('optional data (weight/workout) never affects completeness', () => {
    const d: DayVaultData = { ...base, sessions: [{ id: 'x' } as DayVaultData['sessions'][number]] }
    expect(dayCompleteness(d).done).toBe(0)
  })
})
