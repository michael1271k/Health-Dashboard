import { describe, it, expect } from 'vitest'
import { derivePhase } from '@/lib/nutrition/phase'
import { APEX51, PROGRAMS, DEFAULT_PROGRAM_ID, eraForDate, isReentryWeek, isRestDayFor, programDayFor } from '@/lib/programs'
import { getWeekPhase, PHASES } from '@/lib/phases'
import { computeBattery, BATTERY } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'

// ── [2] Day classification bands ──────────────────────────────────────────────
describe('v5.1 day classification (derivePhase)', () => {
  it('CUT DAY ≤ 2,050 kcal', () => {
    expect(derivePhase(1950)).toBe('cut')
    expect(derivePhase(2050)).toBe('cut')
  })
  it('MAINTENANCE 2,051–2,449 kcal', () => {
    expect(derivePhase(2051)).toBe('maintenance')
    expect(derivePhase(2449)).toBe('maintenance')
  })
  it('BULK ≥ 2,450 kcal', () => {
    expect(derivePhase(2450)).toBe('bulk')
    expect(derivePhase(2700)).toBe('bulk')
  })
})

// ── [5] APEX-5.1 split ────────────────────────────────────────────────────────
describe('APEX-5.1 split', () => {
  it('is the default program and trains Sun/Mon/Wed/Thu/Sat', () => {
    expect(DEFAULT_PROGRAM_ID).toBe('apex51')
    expect(APEX51.days.map((d) => d.weekday).sort()).toEqual([0, 1, 3, 4, 6])
  })
  it('Tue/Fri are Zone-2 rest days in the AXIS era', () => {
    expect(programDayFor('apex51', 2)).toBe('rest')
    expect(programDayFor('apex51', 5)).toBe('rest')
    expect(isRestDayFor('2026-07-21')).toBe(true)  // Tue
    expect(isRestDayFor('2026-07-24')).toBe(true)  // Fri
    expect(isRestDayFor('2026-07-19')).toBe(false) // Sun = D1
  })
  it('PPL-legacy era keeps Fri/Sat rest', () => {
    expect(isRestDayFor('2026-06-05')).toBe(true)  // Fri, PPL era
    expect(isRestDayFor('2026-06-04')).toBe(false) // Thu, PPL era
  })
  it('carries the cut-mode set deltas from the plan tables', () => {
    const deltas = Object.fromEntries(APEX51.days.map((d) => [d.key, d.cutSetDelta]))
    expect(deltas).toEqual({ cb_a: -3, legs_a: -4, arms: -4, cb_b: -3, legs_b: -3 })
  })
  it('removed movements are gone from every template', () => {
    const banned = ['Bulgarian Split Squat', 'Pallof Press', 'Cable Crunch', 'Russian Twist', 'Standing DB Curl', 'Lying Leg Raise']
    for (const p of Object.values(PROGRAMS)) {
      for (const d of p.days) {
        for (const e of d.exercises) {
          for (const b of banned) expect(e.name).not.toContain(b)
        }
      }
    }
  })
})

// ── [6] Re-entry weeks ────────────────────────────────────────────────────────
describe('v5.1 re-entry weeks', () => {
  it('flags 2026-07-19 through 08-01 as re-entry', () => {
    expect(isReentryWeek('2026-07-19')).toBe(true)
    expect(isReentryWeek('2026-08-01')).toBe(true)
    expect(isReentryWeek('2026-08-02')).toBe(false)
    expect(isReentryWeek('2026-07-18')).toBe(false)
  })
})

// ── [1] Phase engine timeline ─────────────────────────────────────────────────
describe('v5.1 phase engine', () => {
  it('era boundary is 2026-07-19', () => {
    expect(eraForDate('2026-07-18')).toBe('ppl')
    expect(eraForDate('2026-07-19')).toBe('axis')
  })
  it('maintenance week 2026-08-30 is MAINTENANCE, not a cut failure', () => {
    expect(getWeekPhase('2026-08-30')?.kind).toBe('maintenance')
  })
  it('cut resumes at Week 7 after the maintenance week (era-tagged label)', () => {
    expect(getWeekPhase('2026-09-06')?.label).toBe('HELIX Cut · Phase 1 · Week 7')
  })
  it('the two Cut eras carry distinct tags (never mixed)', () => {
    expect(getWeekPhase('2026-05-10')?.eraTag).toBe('PPL Cut')
    expect(getWeekPhase('2026-05-10')?.era).toBe('ppl')
    expect(getWeekPhase('2026-07-19')?.eraTag).toBe('HELIX Cut · Phase 1')
    expect(getWeekPhase('2026-07-19')?.era).toBe('helix')
  })
  it('lean bulk starts 2026-11-01', () => {
    expect(getWeekPhase('2026-11-01')?.kind).toBe('bulk')
  })
  it('timeline includes the v5.1 blocks', () => {
    expect(PHASES.some((p) => p.start === '2026-10-18')).toBe(true) // Transition
  })
})

// ── [7] Battery calibration ──────────────────────────────────────────────────
describe('v5.1 battery lift drain', () => {
  const base: ScoringInputs = {
    sleepHours: 8, deepMinutes: 90, remMinutes: 90, sleepGoalHours: 8,
    calories: 1950, proteinG: 0, carbsG: 195, fatG: 55,
    calorieGoal: 1950, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
    workoutLogged: true, isRestDay: false, newPRsToday: 0,
    sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    waterMl: 0, waterGoalMl: 3000, supplementsTaken: 0, supplementsGoal: 3,
    contextMode: 'normal',
  }
  it('a ~4,000 kg session drains ≈10–13%', () => {
    const rest = computeBattery({ ...base, sessionVolumeKg: 0 }, 10).currentPct
    const lift = computeBattery({ ...base, sessionVolumeKg: 4000 }, 10).currentPct
    const drain = rest - lift
    expect(drain).toBeGreaterThanOrEqual(10)
    expect(drain).toBeLessThanOrEqual(13)
  })
  it('constants reflect the v5.1 calibration', () => {
    expect(BATTERY.workoutFlat).toBe(6)
    expect(BATTERY.workoutPerKg).toBe(0.0015)
  })
})

// ── Axis-5 Week 0 injection + chart split resolver ───────────────────────────
import { resolveChartSplit } from '@/components/charts/VolumeChart'

describe('Axis-5 Week 0', () => {
  it('maps the two transitional days (16–17 Jul) to the HELIX era', () => {
    expect(eraForDate('2026-07-16')).toBe('axis')  // Thu
    expect(eraForDate('2026-07-17')).toBe('axis')  // Fri
  })
  it('does not shift neighbouring days', () => {
    expect(eraForDate('2026-07-15')).toBe('ppl')   // Wed before
    expect(eraForDate('2026-07-18')).toBe('ppl')   // Sat between W0 and W1 anchor
    expect(eraForDate('2026-07-19')).toBe('axis')  // Week-1 anchor unchanged
  })
})

describe('resolveChartSplit', () => {
  it('folds legacy lower into legs', () => {
    expect(resolveChartSplit('2026-05-11', 'lower', 'ppl')).toBe('legs')
  })
  it('splits HELIX Wednesday upper sessions into Delts & Arms', () => {
    expect(resolveChartSplit('2026-07-22', 'upper', 'axis')).toBe('arms')  // Wed
    expect(resolveChartSplit('2026-07-19', 'upper', 'axis')).toBe('upper') // Sun
  })
  it('leaves PPL upper untouched (no arms bucket outside HELIX)', () => {
    expect(resolveChartSplit('2026-06-24', 'upper', 'ppl')).toBe('upper')  // Wed but PPL
  })
})
