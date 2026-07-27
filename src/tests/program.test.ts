import { describe, it, expect } from 'vitest'
import { derivePhase } from '@/lib/nutrition/phase'
import { APEX51, PROGRAMS, DEFAULT_PROGRAM_ID, eraForDate, isReentryWeek, isRestDayFor, programDayFor, activeProgram } from '@/lib/programs'
import { phaseGoalsFor } from '@/lib/types/workout'
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

// ── [5] HELIX-5 split ────────────────────────────────────────────────────────
describe('HELIX-5 split', () => {
  it('is the default program and trains Sun/Mon/Tue/Thu/Fri', () => {
    expect(DEFAULT_PROGRAM_ID).toBe('apex51')
    expect(APEX51.days.map((d) => d.weekday).sort()).toEqual([0, 1, 2, 4, 5])
  })
  it('Wed/Sat are Zone-2 rest days in the AXIS era', () => {
    expect(programDayFor('apex51', 3)).toBe('rest')
    expect(programDayFor('apex51', 6)).toBe('rest')
    expect(isRestDayFor('2026-07-22')).toBe(true)  // Wed
    expect(isRestDayFor('2026-07-25')).toBe(true)  // Sat
    expect(isRestDayFor('2026-07-21')).toBe(false) // Tue = training
    expect(isRestDayFor('2026-07-24')).toBe(false) // Fri = training
    expect(isRestDayFor('2026-07-19')).toBe(false) // Sun = D1
  })
  it('PPL-legacy era keeps Fri/Sat rest', () => {
    expect(isRestDayFor('2026-06-05')).toBe(true)  // Fri, PPL era
    expect(isRestDayFor('2026-06-04')).toBe(false) // Thu, PPL era
  })
  it('derives per-phase set counts from the (bulk/cut) plan data', () => {
    const totals = (phase: 'bulk' | 'cut') =>
      Object.fromEntries(activeProgram('apex51', phase).days.map((d) => [d.key, d.exercises.reduce((n, e) => n + e.sets, 0)]))
    expect(totals('bulk')).toEqual({ cb_a: 19, legs_a: 23, arms: 23, cb_b: 20, legs_b: 22 })
    expect(totals('cut')).toEqual({ cb_a: 16, legs_a: 19, arms: 18, cb_b: 17, legs_b: 18 })
    // The two bulk-only lifts (cutSets:0 — Wrist Curl, Hip Adduction) drop out on a cut.
    const exCount = (phase: 'bulk' | 'cut', key: string) =>
      activeProgram('apex51', phase).days.find((d) => d.key === key)!.exercises.length
    expect(exCount('bulk', 'arms')).toBe(8)
    expect(exCount('cut', 'arms')).toBe(7)
    expect(exCount('bulk', 'legs_b')).toBe(8)
    expect(exCount('cut', 'legs_b')).toBe(7)
  })

  it('phaseGoalsFor: Helix cut = 1950 kcal, PPL cut is leaner (1935, higher protein)', () => {
    expect(phaseGoalsFor('apex51', 'cut').calorieGoal).toBe(1950)
    expect(phaseGoalsFor('axis4', 'cut').calorieGoal).toBe(1950)   // Helix-4 shares the Helix cut
    const ppl = phaseGoalsFor('ppl', 'cut')
    expect(ppl.calorieGoal).toBe(1935)
    expect(ppl.proteinGoalG).toBe(180)
    expect(ppl.carbsGoalG).toBe(180)
    expect(phaseGoalsFor('apex51', 'bulk').calorieGoal).toBe(2600) // Lean Bulk (fat hard cap 70)
  })
  it('removed movements are gone from every LIVE template', () => {
    // These were dropped when the Helix templates were refined; the PPL Legacy
    // plan predates those removals and legitimately still carries them.
    const banned = ['Bulgarian Split Squat', 'Pallof Press', 'Cable Crunch', 'Russian Twist', 'Standing DB Curl', 'Lying Leg Raise']
    for (const p of Object.values(PROGRAMS).filter((p) => !p.legacy)) {
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
  it('era boundary is HELIX_CUT_START (2026-07-15)', () => {
    expect(eraForDate('2026-07-14')).toBe('ppl')
    expect(eraForDate('2026-07-15')).toBe('axis')
    expect(eraForDate('2026-07-19')).toBe('axis')
  })
  it('maintenance week 2026-08-30 is MAINTENANCE, not a cut failure', () => {
    expect(getWeekPhase('2026-08-30')?.kind).toBe('maintenance')
  })
  it('cut resumes at Week 7 after the maintenance week (era-tagged label)', () => {
    expect(getWeekPhase('2026-09-06')?.label).toBe('Helix Cut · Week 7')
  })
  it('the two Cut eras carry distinct tags (never mixed)', () => {
    expect(getWeekPhase('2026-05-10')?.eraTag).toBe('PPL Cut')
    expect(getWeekPhase('2026-05-10')?.era).toBe('ppl')
    expect(getWeekPhase('2026-07-19')?.eraTag).toBe('Helix Cut')
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
describe('v6 battery lift drain (drain-only)', () => {
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
  it('a ~4,000 kg session drains ≈12–16%', () => {
    const rest = computeBattery({ ...base, sessionVolumeKg: 0 }, 10).currentPct
    const lift = computeBattery({ ...base, sessionVolumeKg: 4000 }, 10).currentPct
    const drain = rest - lift
    expect(drain).toBeGreaterThanOrEqual(12)
    expect(drain).toBeLessThanOrEqual(16)
  })
  it('a heavy leg day drains far more than the same-volume default split', () => {
    const legs    = computeBattery({ ...base, sessionVolumeKg: 8000, splitDay: 'legs' }, 10).currentPct
    const generic = computeBattery({ ...base, sessionVolumeKg: 8000 }, 10).currentPct
    expect(legs).toBeLessThan(generic)
  })
  it('constants reflect the v6 calibration', () => {
    expect(BATTERY.workoutFlat).toBe(5)
    expect(BATTERY.workoutPerKg).toBe(0.0022)
  })
})

// ── Era-aware phase tag ──────────────────────────────────────────────────────
import { phaseDisplay, PHASE_META } from '@/lib/nutrition/phase'

describe('phaseDisplay — cut phase label', () => {
  it('labels cut days as the plain sub-phase "Cut" (era tag now nests under Helix 5.1)', () => {
    expect(phaseDisplay('cut', '2026-07-15').label).toBe('Cut')
    expect(phaseDisplay('cut', '2026-09-10').label).toBe('Cut')
  })
  it('keeps the plain label for pre-boundary cut days', () => {
    expect(phaseDisplay('cut', '2026-07-14').label).toBe('Cut')
    expect(phaseDisplay('cut', '2026-05-10').label).toBe('Cut')
  })
  it('never rebrands maintenance/bulk and keeps the phase color', () => {
    expect(phaseDisplay('maintenance', '2026-08-30').label).toBe('Maint')
    expect(phaseDisplay('bulk', '2026-11-01').label).toBe('Bulk')
    expect(phaseDisplay('cut', '2026-07-15').color).toBe(PHASE_META.cut.color)
  })
})

// ── Axis-5 Week 0 injection + chart split resolver ───────────────────────────
import { resolveChartSplit } from '@/components/charts/VolumeChart'

describe('Axis-5 Week 0', () => {
  it('maps the transitional ramp days (15–17 Jul) to the HELIX era', () => {
    expect(eraForDate('2026-07-15')).toBe('axis')  // Wed
    expect(eraForDate('2026-07-16')).toBe('axis')  // Thu
    expect(eraForDate('2026-07-17')).toBe('axis')  // Fri
  })
  it('does not shift days before the boundary', () => {
    expect(eraForDate('2026-07-14')).toBe('ppl')   // Tue before the Helix Cut opens
    expect(eraForDate('2026-07-18')).toBe('axis')  // unified boundary: everything ≥ Jul 15 is HELIX
    expect(eraForDate('2026-07-19')).toBe('axis')  // Week-1 anchor unchanged
  })
})

describe('resolveChartSplit', () => {
  it('folds legacy lower into legs', () => {
    expect(resolveChartSplit('2026-05-11', 'lower', 'ppl')).toBe('legs')
  })
  it('splits HELIX upper sessions into Upper A (Sun), Delts & Arms (Tue), Upper B (Thu)', () => {
    expect(resolveChartSplit('2026-07-19', 'upper', 'axis')).toBe('upper_a') // Sun
    expect(resolveChartSplit('2026-07-21', 'upper', 'axis')).toBe('arms')    // Tue
    expect(resolveChartSplit('2026-07-23', 'upper', 'axis')).toBe('upper_b') // Thu
  })
  it('splits HELIX legs sessions into Legs & Core A (Mon) and Legs & Core B (Fri)', () => {
    expect(resolveChartSplit('2026-07-20', 'legs', 'axis')).toBe('legs_a') // Mon
    expect(resolveChartSplit('2026-07-24', 'legs', 'axis')).toBe('legs_b') // Fri
  })
  it('leaves PPL upper untouched (no arms bucket outside HELIX)', () => {
    expect(resolveChartSplit('2026-06-23', 'upper', 'ppl')).toBe('upper')  // Tue but PPL
  })
})
