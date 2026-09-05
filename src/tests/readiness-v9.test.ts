import { describe, it, expect } from 'vitest'
import {
  READINESS, zSignal, ewmaLoads, loadSignal, sessionLoad, cardioLoad, dailyLoads,
  computeReadinessSignals,
} from '@/lib/scoring/readiness'
import {
  BATTERY, MAX_TOTAL_DRAIN, computeBattery, batteryBreakdown, sleepQualityParts, zQuality,
  wellnessParts, loadParts,
} from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'

// ─────────────────────────────────────────────────────────────────────────────
// Readiness v9 — the behaviours the model must have, before it exists.
//
// Every claim here is one the docs/READINESS_MODEL.md states. The golden
// vectors prove the Swift port agrees with this file; this file proves the
// TypeScript agrees with the paper it cites.
// ─────────────────────────────────────────────────────────────────────────────

function inputs(over: Partial<ScoringInputs> = {}): ScoringInputs {
  return {
    sleepHours: 7, deepMinutes: 60, remMinutes: 90, sleepGoalHours: 8,
    calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
    calorieGoal: 0, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0,
    steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
    workoutLogged: false, isRestDay: false, newPRsToday: 0,
    sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    waterMl: 0, waterGoalMl: 3000,
    ...over,
  }
}

/** A 49-day series: 42 baseline days then 7 rolling days. */
function series(baseline: number, rolling: number, jitter = 0): Array<number | null> {
  const out: Array<number | null> = []
  for (let i = 0; i < 42; i++) out.push(baseline + (i % 2 === 0 ? jitter : -jitter))
  for (let i = 0; i < 7; i++) out.push(rolling)
  return out
}

describe('readiness v9 — the z-signal (Plews 2013, Buchheit 2014)', () => {
  it('reads a 7-day rolling mean against the 42 days before it', () => {
    const s = zSignal(series(60, 60, 4), { log: false })
    expect(s.rolling).toBe(60)
    expect(s.baselineMean).toBe(60)
    expect(s.n.rolling).toBe(7)
    expect(s.n.baseline).toBe(42)
  })

  it('takes the natural log for HRV, so a 10% drop is the same event at 40 ms and at 80 ms', () => {
    const low = zSignal(series(40, 36, 2), { log: true })
    const high = zSignal(series(80, 72, 4), { log: true })
    expect(low.z).not.toBeNull()
    expect(low.z).toBeCloseTo(high.z as number, 6)
  })

  it('the SWC is half the baseline SD, and a change inside it is noise (z = 0)', () => {
    const s = zSignal(series(60, 61, 4), { log: false })
    expect(s.swc).toBeCloseTo(0.5 * s.baselineSd!, 12)
    expect(Math.abs(s.delta!)).toBeLessThan(s.swc!)
    expect(s.z).toBe(0)
  })

  it('a change beyond the SWC is expressed in baseline SDs, clamped to ±2', () => {
    const down = zSignal(series(60, 50, 4), { log: false })
    expect(down.z).toBeLessThan(0)
    expect(down.z).toBeGreaterThanOrEqual(-2)
    const crash = zSignal(series(60, 5, 4), { log: false })
    expect(crash.z).toBe(-2)
    const spike = zSignal(series(60, 200, 4), { log: false })
    expect(spike.z).toBe(2)
  })

  it('has no opinion with fewer than 3 rolling or 14 baseline readings', () => {
    const thinRolling = [...series(60, 50, 4).slice(0, 42), null, null, null, null, null, 50, 50]
    expect(zSignal(thinRolling, { log: false }).z).toBeNull()
    const thinBaseline = [...Array(42).fill(null).map((_, i) => (i < 13 ? 60 : null)), 50, 50, 50, 50, 50, 50, 50]
    expect(zSignal(thinBaseline, { log: false }).z).toBeNull()
    expect(zSignal([], { log: false }).z).toBeNull()
  })

  it('a flat baseline (SD 0) yields no z rather than a division by zero', () => {
    const s = zSignal(series(60, 55, 0), { log: false })
    expect(s.baselineSd).toBe(0)
    expect(s.z).toBeNull()
  })

  it('a non-positive HRV reading is missing under the log, never −Infinity', () => {
    const s = zSignal([...series(60, 60, 4).slice(0, 48), 0], { log: true })
    expect(s.n.rolling).toBe(6)
    expect(Number.isFinite(s.rolling as number)).toBe(true)
  })
})

describe('readiness v9 — sRPE load (Foster 1998/2001)', () => {
  it('a lifting session is CR-10 × minutes', () => {
    expect(sessionLoad({ sessionRpe: 7, durationMin: 60 })).toBe(420)
  })
  it('an unrated lifting session falls back to the battery default (7), not to zero', () => {
    expect(sessionLoad({ sessionRpe: null, durationMin: 60 })).toBe(BATTERY.defaultRpe * 10 * 60)
  })
  it('a session with no duration carries no load', () => {
    expect(sessionLoad({ sessionRpe: 8, durationMin: null })).toBe(0)
    expect(sessionLoad({ sessionRpe: 8, durationMin: 0 })).toBe(0)
  })
  it('a cardio bout is effort × minutes, and an unrated bout carries none', () => {
    expect(cardioLoad({ effort: 4, durationMin: 30 })).toBe(120)
    expect(cardioLoad({ effort: null, durationMin: 30 })).toBe(0)
  })
  it('buckets loads by date over the whole history, with rest days as real zeros', () => {
    const loads = dailyLoads(
      ['2026-09-01', '2026-09-02', '2026-09-03'],
      [{ date: '2026-09-01', sessionRpe: 7, durationMin: 60 }, { date: '2026-09-03', sessionRpe: 8, durationMin: 50 }],
      [{ date: '2026-09-03', effort: 3, durationMin: 20 }],
    )
    expect(loads).toEqual([420, 0, 460])
  })
})

describe('readiness v9 — EWMA ACWR (Williams 2017)', () => {
  it('uses λ = 2/(N+1) with N = 7 acute and N = 28 chronic', () => {
    expect(READINESS.acuteLambda).toBeCloseTo(2 / 8, 12)
    expect(READINESS.chronicLambda).toBeCloseTo(2 / 29, 12)
  })

  it('a steady load is an ACWR of exactly 1', () => {
    const s = loadSignal(Array(49).fill(400))
    expect(s.acute).toBeCloseTo(400, 9)
    expect(s.chronic).toBeCloseTo(400, 9)
    expect(s.acwr).toBeCloseTo(1, 9)
  })

  it('a spike in the last week reads above 1.3, a taper below 0.8', () => {
    const spike = loadSignal([...Array(42).fill(300), ...Array(7).fill(900)])
    expect(spike.acwr!).toBeGreaterThan(1.3)
    const taper = loadSignal([...Array(42).fill(600), ...Array(7).fill(100)])
    expect(taper.acwr!).toBeLessThan(0.8)
  })

  it('the acute EWMA answers faster than the chronic one', () => {
    const { acute, chronic } = ewmaLoads([...Array(42).fill(300), ...Array(7).fill(900)])
    expect(acute as number).toBeGreaterThan(chronic as number)
  })

  it('no history means no ratio, and a zero chronic load means no ratio', () => {
    expect(loadSignal([]).acwr).toBeNull()
    expect(loadSignal(Array(49).fill(0)).acwr).toBeNull()
  })

  it('a chronic side built on fewer than 3 loaded days has no opinion — the first session after a gap is not a spike', () => {
    const quiet = Array(42).fill(0)
    expect(loadSignal([...quiet, 663, 0, 0, 0, 0, 0, 0]).acwr).toBeNull()
    expect(loadSignal([...quiet.slice(0, 40), 400, 400, 663, 0, 0, 0, 0, 0, 0]).acwr).toBeNull()
    expect(loadSignal([...quiet.slice(0, 39), 400, 400, 400, 663, 0, 0, 0, 0, 0, 0]).acwr).not.toBeNull()
    // The rolling week's own sessions do not count towards the chronic side.
    expect(loadSignal([...quiet, 663, 663, 663, 663, 663, 663, 663]).acwr).toBeNull()
  })
})

describe('readiness v9 — monotony and strain (Foster 1998)', () => {
  it('monotony is the mean over the SD of the last seven daily loads', () => {
    const week = [600, 0, 500, 0, 700, 0, 400]
    const s = loadSignal([...Array(42).fill(300), ...week])
    const mean = week.reduce((a, b) => a + b, 0) / 7
    const sd = Math.sqrt(week.reduce((a, b) => a + (b - mean) ** 2, 0) / 6)
    expect(s.weeklyLoad).toBe(2200)
    expect(s.monotony).toBeCloseTo(mean / sd, 12)
    expect(s.strain).toBeCloseTo(2200 * (mean / sd), 9)
  })

  it('a week with no variation has no monotony and no strain — not infinity', () => {
    const s = loadSignal(Array(49).fill(400))
    expect(s.monotony).toBeNull()
    expect(s.strain).toBeNull()
    expect(s.strainZ).toBeNull()
  })

  it('strain z compares this week against the rolling strains before it, clamped ±2', () => {
    const calm: number[] = []
    for (let i = 0; i < 42; i++) calm.push(i % 2 === 0 ? 400 : 200)
    const heavy = loadSignal([...calm, 1400, 1300, 1400, 1300, 1400, 1300, 1400])
    expect(heavy.strainZ).toBe(2)
    const same = loadSignal([...calm, 400, 200, 400, 200, 400, 200, 400])
    expect(Math.abs(same.strainZ!)).toBeLessThan(1)
  })

  it('needs fewer than 7 days of history to answer nothing about the week', () => {
    const s = loadSignal([400, 200, 400])
    expect(s.monotony).toBeNull()
    expect(s.weeklyLoad).toBeNull()
  })
})

describe('readiness v9 — the composite signals', () => {
  it('runs the three series through one door', () => {
    const s = computeReadinessSignals({
      hrv: series(60, 45, 4), rhr: series(52, 58, 2), loads: [...Array(42).fill(300), ...Array(7).fill(900)],
    })
    expect(s.hrv.z).toBeLessThan(0)
    expect(s.rhr.z).toBeGreaterThan(0)
    expect(s.load.acwr!).toBeGreaterThan(1.3)
  })
})

describe('battery v9 — wellness (Hooper 1995)', () => {
  it('four items, each 0..1 where 1 is worst, averaged over the ones that were answered', () => {
    const w = wellnessParts(inputs({ fatigueLevel: 5, domsSeverity: 3, sleepOnsetTrouble: true, sleepHours: 4, sleepGoalHours: 8 }))
    expect(w.fatigue).toBe(1)
    expect(w.soreness).toBe(1)
    expect(w.onset).toBe(1)
    expect(w.sleep).toBe(0.5)
    expect(w.index).toBeCloseTo(3.5 / 4, 12)
    expect(w.drain).toBeCloseTo(BATTERY.wellnessCap * 3.5 / 4, 12)
  })

  it('a day with nothing logged and an ordinary night drains nothing', () => {
    const w = wellnessParts(inputs({ sleepHours: 8, sleepGoalHours: 8, sleepOnsetTrouble: false }))
    expect(w.fatigue).toBeNull()
    expect(w.soreness).toBeNull()
    expect(w.index).toBe(0)
    expect(w.drain).toBe(0)
  })

  it('an unknown onset flag (null) is excluded, not read as trouble', () => {
    const w = wellnessParts(inputs({ sleepOnsetTrouble: null, sleepHours: 0 }))
    expect(w.onset).toBeNull()
    expect(w.sleep).toBeNull()
    expect(w.index).toBeNull()
    expect(w.drain).toBe(0)
  })

  it('never exceeds its cap', () => {
    const w = wellnessParts(inputs({ fatigueLevel: 99, domsSeverity: 99, sleepOnsetTrouble: true, sleepHours: 0.1 }))
    expect(w.drain).toBeLessThanOrEqual(BATTERY.wellnessCap)
  })
})

describe('battery v9 — the load drain', () => {
  it('drains nothing at or below an ACWR of 1.3 and nothing for a negative strain z', () => {
    expect(loadParts(inputs({ acwr: 1.3, strainZ: -2 })).drain).toBe(0)
    expect(loadParts(inputs({ acwr: 0.8 })).drain).toBe(0)
    expect(loadParts(inputs()).drain).toBe(0)
  })
  it('rises with the ACWR past 1.3 and saturates at 2.0', () => {
    const mid = loadParts(inputs({ acwr: 1.65 }))
    const top = loadParts(inputs({ acwr: 2.0 }))
    const over = loadParts(inputs({ acwr: 3.0 }))
    expect(mid.acwrTerm).toBeCloseTo(BATTERY.loadCap * READINESS.acwrShare / 2, 12)
    expect(top.acwrTerm).toBeCloseTo(BATTERY.loadCap * READINESS.acwrShare, 12)
    expect(over.acwrTerm).toBe(top.acwrTerm)
  })
  it('a strain two SDs above normal fills the strain share, and the two together fill the cap', () => {
    const p = loadParts(inputs({ acwr: 2.0, strainZ: 2 }))
    expect(p.strainTerm).toBeCloseTo(BATTERY.loadCap * (1 - READINESS.acwrShare), 12)
    expect(p.drain).toBeCloseTo(BATTERY.loadCap, 12)
  })
})

describe('battery v9 — the charge', () => {
  it('weights duration 0.45, stages 0.15, HRV z 0.25, RHR z 0.15', () => {
    const q = sleepQualityParts(inputs({ sleepHours: 8, deepMinutes: 108, remMinutes: 108, sleepGoalHours: 8, hrvZ: 1, rhrZ: -1 }))
    expect(q.ratio).toBe(1)
    expect(q.stagesQ).toBe(1)
    expect(q.hrvQ).toBe(1)
    expect(q.rhrQ).toBe(1)
    expect(q.quality).toBe(1)
    const half = sleepQualityParts(inputs({ sleepHours: 4, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8, hrvZ: -2, rhrZ: 2 }))
    expect(half.quality).toBeCloseTo(0.45 * 0.5 + 0.15 * 0 + 0.25 * 0.25 + 0.15 * 0.25, 12)
  })

  it('a missing z is neutral (0.75), never a penalty', () => {
    expect(zQuality(null)).toBe(0.75)
    expect(zQuality(0)).toBe(0.75)
    expect(zQuality(1)).toBe(1)
    expect(zQuality(-2)).toBe(0.25)
  })

  it('a higher resting HR lowers the charge, a higher HRV raises it', () => {
    const base = sleepQualityParts(inputs())
    expect(sleepQualityParts(inputs({ rhrZ: 2 })).rhrQ).toBeLessThan(base.rhrQ)
    expect(sleepQualityParts(inputs({ hrvZ: 2 })).hrvQ).toBeGreaterThan(base.hrvQ)
  })

  it('no longer reads the v8 seven-day baselines', () => {
    const a = sleepQualityParts(inputs({ hrvMs: 90, hrvBaseline: 60, restingHR: 70, baselineHR: 52 }))
    const b = sleepQualityParts(inputs())
    expect(a).toEqual(b)
  })

  it('onset trouble no longer takes 3 off the wake charge — it is a wellness item now', () => {
    const calm = computeBattery(inputs({ sleepOnsetTrouble: false }), 0)
    const hard = computeBattery(inputs({ sleepOnsetTrouble: true }), 0)
    expect(hard.morningCharge).toBe(calm.morningCharge)
    expect(hard.currentPct).toBeLessThan(calm.currentPct)
  })
})

describe('battery v9 — the budget', () => {
  it('time 35 + activity 12 + workout 32 + load 8 + wellness 6 = 93, strictly under a full charge', () => {
    expect(BATTERY.loadCap).toBe(8)
    expect(BATTERY.wellnessCap).toBe(6)
    expect(MAX_TOTAL_DRAIN).toBe(93)
    expect(MAX_TOTAL_DRAIN).toBeLessThan(100 - BATTERY.floor)
  })

  it('the worst day imaginable on a perfect night still ends above the floor', () => {
    const worst = computeBattery(inputs({
      sleepHours: 9, deepMinutes: 120, remMinutes: 120, hrvZ: 2, rhrZ: -2, sleepOnsetTrouble: true,
      steps: 40000, activeCal: 3000, hoursAwake: 18,
      sessionVolumeKg: 30000, trailingAvgVolumeKg: 1000, sessionRpe: 10, sessionDayKey: 'legs_a',
      acwr: 3, strainZ: 2, fatigueLevel: 5, domsSeverity: 3,
    }))
    expect(worst.morningCharge).toBe(100)
    expect(worst.currentPct).toBeGreaterThan(BATTERY.floor)
  })
})

describe('battery v9 — the breakdown', () => {
  it('exposes every term, and the terms sum to the number', () => {
    const b = batteryBreakdown(inputs({
      sleepHours: 6, deepMinutes: 40, remMinutes: 60, hrvZ: -1.5, rhrZ: 1,
      steps: 9000, activeCal: 600, sessionVolumeKg: 13072.5, trailingAvgVolumeKg: 12712, sessionRpe: 7, sessionDayKey: 'legs_a',
      acwr: 1.6, strainZ: 0.5, fatigueLevel: 3, domsSeverity: 2, sleepOnsetTrouble: false,
    }), 12)
    expect(b.charge.morningCharge).toBe(computeBattery(inputs({ sleepHours: 6, deepMinutes: 40, remMinutes: 60, hrvZ: -1.5, rhrZ: 1 })).morningCharge)
    expect(b.drains.time).toBeGreaterThan(0)
    expect(b.drains.activity).toBeGreaterThan(0)
    expect(b.drains.workout).toBeGreaterThan(0)
    expect(b.drains.load).toBeGreaterThan(0)
    expect(b.drains.wellness).toBeGreaterThan(0)
    const sum = b.drains.time + b.drains.activity + b.drains.workout + b.drains.load + b.drains.wellness
    expect(b.drains.total).toBeCloseTo(sum, 12)
    expect(b.currentPct).toBe(Math.round(Math.max(BATTERY.floor, Math.min(100, b.charge.morningCharge - sum))))
    expect(b.version).toBe(9)
  })

  it('agrees with computeBattery on every grid point', () => {
    for (const awake of [0, 4, 8, 12, 18]) {
      for (const acwr of [null, 1, 1.5, 2.2]) {
        const i = inputs({ acwr, hrvZ: -0.5, fatigueLevel: 2 })
        const b = batteryBreakdown(i, awake)
        const s = computeBattery(i, awake)
        expect(b.currentPct).toBe(s.currentPct)
        expect(b.charge.morningCharge).toBe(s.morningCharge)
      }
    }
  })
})
