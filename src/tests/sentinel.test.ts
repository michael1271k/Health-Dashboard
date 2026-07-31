import { describe, it, expect } from 'vitest'
import { bar, targetBar, mdTable, asciiBox, pad, padStart, num, signed, hhmm } from '@/lib/reports/ascii'
import { tdeeForDay, tdeeForWeek, TEF_RATE, KCAL_PER_STEP, KCAL_PER_KG_FAT } from '@/lib/reports/tdee'
import { t4wmSeries, latestT4wm, stallStatus } from '@/lib/reports/t4wm'
import { integrityReport, type IntegrityDay } from '@/lib/reports/integrity'
import { buildSentinelExport, type SentinelInput } from '@/lib/reports/sentinel'

describe('ascii primitives', () => {
  it('fills a bar proportionally', () => {
    expect(bar(50, 100, 10)).toBe('█████░░░░░')
    expect(bar(100, 100, 10)).toBe('██████████')
  })

  it('shows at least one cell for a tiny non-zero value, and none for zero', () => {
    // A 1% day should still be visibly different from a day with nothing.
    expect(bar(1, 1000, 10)).toBe('█░░░░░░░░░')
    expect(bar(0, 100, 10)).toBe('░░░░░░░░░░')
    expect(bar(null, 100, 10)).toBe('░░░░░░░░░░')
  })

  it('is width-stable — every bar is exactly `width` characters', () => {
    for (const v of [null, 0, 1, 50, 99, 100, 1e6]) {
      expect([...bar(v, 100, 20)]).toHaveLength(20)
      expect([...targetBar(v, 80, 100, 20)]).toHaveLength(20)
    }
  })

  it('marks the target inside the bar', () => {
    expect(targetBar(100, 50, 100, 10)).toContain('│')
  })

  it('pads and truncates to a fixed width', () => {
    expect(pad('abc', 6)).toBe('abc   ')
    expect(pad('abcdefgh', 5)).toBe('abcd…')
    expect(padStart('42', 5)).toBe('   42')
    expect([...pad('x', 4)]).toHaveLength(4)
  })

  it('builds a GFM table with a rule row and pads short rows', () => {
    const t = mdTable(['A', 'B'], [['1', '2'], ['3']])
    expect(t.split('\n')).toEqual(['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | — |'])
  })

  it('boxes lines to a common width', () => {
    const lines = asciiBox(['hi', 'a much longer line'], 10)
    const widths = new Set(lines.split('\n').map((l) => [...l].length))
    expect(widths.size).toBe(1)
  })

  it('em-dashes missing numbers rather than printing a confident zero', () => {
    expect(num(null)).toBe('—')
    expect(num(undefined, 1)).toBe('—')
    expect(num(3.14159, 2)).toBe('3.14')
    expect(signed(-1.5)).toBe('-1.5')
    expect(signed(2)).toBe('+2.0')
    expect(signed(null)).toBe('—')
    expect(hhmm(450)).toBe('7h30')
    expect(hhmm(null)).toBe('—')
  })
})

describe('TDEE decomposition', () => {
  const day = {
    date: '2026-07-27', bmrKcal: 1500, intakeKcal: 2000, steps: 10000,
    sessionKcal: 400, cardioKcal: 100,
  }

  it('sums BMR + TEF + NEAT + EAT', () => {
    const d = tdeeForDay(day)
    expect(d.tef).toBe(2000 * TEF_RATE)              // 200
    expect(d.neat).toBe(10000 * KCAL_PER_STEP)       // 400
    expect(d.eat).toBe(500)
    expect(d.tdee).toBe(1500 + 200 + 400 + 500)      // 2600
    expect(d.balance).toBe(2000 - 2600)              // −600
  })

  it('keeps "not recorded" distinct from zero', () => {
    // A day with no session logged is unknown, not a zero-calorie day.
    const d = tdeeForDay({ ...day, sessionKcal: null, cardioKcal: null })
    expect(d.eat).toBeNull()
    expect(d.tdee).toBe(1500 + 200 + 400)
  })

  it('cannot produce a TDEE without a BMR', () => {
    expect(tdeeForDay({ ...day, bmrKcal: null }).tdee).toBeNull()
    expect(tdeeForDay({ ...day, bmrKcal: null }).balance).toBeNull()
  })

  it('averages over the days that HAVE data, not over the whole week', () => {
    const w = tdeeForWeek([day, { ...day, date: 'x', intakeKcal: null }])
    // One day has intake; the mean must be that day's, not half of it.
    expect(w.meanIntake).toBe(2000)
  })

  it('converts the weekly balance to a predicted fat change', () => {
    const w = tdeeForWeek(Array.from({ length: 7 }, (_, i) => ({ ...day, date: `d${i}` })))
    expect(w.totalBalance).toBe(-600 * 7)
    expect(w.predictedFatKg).toBeCloseTo((-600 * 7) / KCAL_PER_KG_FAT, 2)
  })
})

describe('T4WM — trailing-4 weigh-in mean', () => {
  const w = (date: string, weightKg: number) => ({ date, weightKg })
  const four = [w('2026-07-05', 64), w('2026-07-12', 63.5), w('2026-07-19', 63.8), w('2026-07-26', 63.1)]

  it('is null until four weigh-ins exist — three points are not a trend', () => {
    const s = t4wmSeries(four.slice(0, 3))
    expect(s.every((p) => p.t4wm === null)).toBe(true)
    expect(latestT4wm(four.slice(0, 3))).toBeNull()
  })

  it('averages the last four', () => {
    expect(latestT4wm(four)).toBeCloseTo((64 + 63.5 + 63.8 + 63.1) / 4, 2)
  })

  it('sorts by date, so input order cannot change the answer', () => {
    expect(latestT4wm([...four].reverse())).toBe(latestT4wm(four))
  })

  it('ignores impossible weights rather than poisoning the mean', () => {
    expect(latestT4wm([...four, w('2026-08-02', 0)])).toBe(latestT4wm(four))
  })
})

describe('stall protocol', () => {
  const series = (weights: number[]) =>
    weights.map((kg, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, weightKg: kg }))

  it('reports "on track" while the trend moves at target', () => {
    // Losing ~0.5 kg/wk against a −0.5 target.
    const s = stallStatus(series([66, 65.5, 65, 64.5, 64, 63.5, 63]), -0.5)
    expect(s.lever).toBe(0)
    expect(s.label).toBe('On track')
  })

  it('escalates Lever 1 → 2 → 3 as stalled weeks accumulate', () => {
    const flat = series([64, 64, 64, 64, 64, 64])
    expect(stallStatus(flat, -0.5, 0).lever).toBe(1)
    expect(stallStatus(flat, -0.5, 2).lever).toBe(2)
    expect(stallStatus(flat, -0.5, 3).lever).toBe(3)
  })

  it('counts losing at a quarter of target as a stall, not as progress', () => {
    // −0.1/wk against a −0.5 target is 20% of target: still a stall.
    expect(stallStatus(series([64, 63.9, 63.8, 63.7, 63.6, 63.5]), -0.5).lever).toBe(1)
  })

  it('stays neutral without a target or enough data', () => {
    expect(stallStatus(series([64, 64, 64, 64]), null).lever).toBe(0)
    expect(stallStatus([], -0.5).lever).toBe(0)
  })
})

describe('integrity report', () => {
  const day = (over: Partial<IntegrityDay> = {}): IntegrityDay => ({
    date: '2026-07-27', intakeKcal: 2000, proteinG: 170, steps: 9000,
    sleepMin: 450, waterMl: 3000, weightKg: 63, isTrainingDay: false, hasSession: false, ...over,
  })

  it('is 100% on a full week and says so', () => {
    const r = integrityReport(Array.from({ length: 7 }, (_, i) => day({ date: `d${i}` })))
    expect(r.completenessPct).toBe(100)
    expect(r.flags).toEqual(['None — full week, no gaps.'])
  })

  it('names the days with no intake', () => {
    const days = [day({ date: 'a', intakeKcal: null }), day({ date: 'b' })]
    const r = integrityReport(days)
    expect(r.missingIntakeDates).toEqual(['a'])
    expect(r.completenessPct).toBe(88)   // 7 of 8 tracked fields
    expect(r.flags[0]).toMatch(/1 day without logged intake \(a\)/)
  })

  it('flags a thin weigh-in count — the trend is weak below 3', () => {
    const r = integrityReport([day({ weightKg: null }), day({ weightKg: null }), day()])
    expect(r.flags.some((f) => /Only 1 weigh-in/.test(f))).toBe(true)
  })

  it('separates missed sessions from unscheduled ones', () => {
    const r = integrityReport([
      day({ date: 'a', isTrainingDay: true, hasSession: false }),
      day({ date: 'b', isTrainingDay: false, hasSession: true }),
    ])
    expect(r.missedSessions).toEqual(['a'])
    expect(r.unscheduledSessions).toEqual(['b'])
  })

  it('catches intake logged without protein — an incomplete entry, not a real zero', () => {
    const r = integrityReport([day({ date: 'a', proteinG: 0 })])
    expect(r.flags.some((f) => /without protein on a/.test(f))).toBe(true)
  })
})

describe('buildSentinelExport', () => {
  const input: SentinelInput = {
    weekStart: '2026-07-26', weekEnd: '2026-08-01', weekLabel: 'Week 3',
    planLabel: 'Helix-5', phase: 'cut',
    days: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-07-${26 + i}`.slice(0, 10), weekdayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      isTrainingDay: i !== 3, intakeKcal: 1900 + i * 10, proteinG: 170, carbsG: 190, fatG: 55,
      steps: 9000 + i * 100, sleepMin: 430, waterMl: 3000, restingHr: 52, hrvMs: 60, score: 90,
    })),
    bodyComp: [
      { date: '2026-07-26', weightKg: 63.5, bmi: 21.1, bodyFatPct: 14.2, fatMassKg: 9.0, musclePercent: 48, muscleMassKg: 30.5, fatFreeMassKg: 54.5, waterPercent: 60, visceralFat: 5, bmr: 1520 },
      { date: '2026-08-01', weightKg: 63.0, bmi: 20.9, bodyFatPct: 13.9, fatMassKg: 8.8, musclePercent: 48.3, muscleMassKg: 30.6, fatFreeMassKg: 54.2, waterPercent: 60.4, visceralFat: 5, bmr: 1515 },
    ],
    weighInHistory: [
      { date: '2026-07-05', weightKg: 64.4 }, { date: '2026-07-12', weightKg: 64.0 },
      { date: '2026-07-19', weightKg: 63.6 }, { date: '2026-07-26', weightKg: 63.5 },
    ],
    sessions: [{
      date: '2026-07-31', label: 'Legs & Core B', volumeKg: 9200, setCount: 19,
      durationMin: 71, avgBpm: 116, caloriesBurned: 520, sessionRpe: 8,
      exercises: [{
        name: 'Hip Thrust (Machine)',
        sets: [
          { weightKg: 25, reps: 14, setType: null, isPr: false, side: null, pairId: null },
          { weightKg: 27.5, reps: 13, setType: null, isPr: true, side: null, pairId: null },
        ],
        targetRx: '3 × 8–15', baseline: '27.5kg × 12', prAxes: ['PR'],
      }],
    }],
    cardio: [{ date: '2026-07-28', kind: 'walk', distanceM: 4200, durationMin: 45, activeKcal: 210, totalKcal: 265, avgHr: 112, effort: 4 }],
    volume: [
      { muscle: 'Glutes', sets: 6, target: 6, failureExercises: [] },
      { muscle: 'Quads', sets: 7, target: 10, failureExercises: ['Leg Press'] },
    ],
    targets: {
      calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
      stepsGoal: 10000, sleepGoalHours: 8, waterGoalMl: 3000,
      targetWeightKg: 62, targetBodyFatPct: 13, rateMinKgWk: -0.5, rateMaxKgWk: -0.4,
    },
    priorFindings: ['Protein under target on rest days'],
    priorStalledWeeks: 0,
  }

  const out = buildSentinelExport(input)

  it('emits every mandated section, in order', () => {
    const order = ['## HEADLINE', '## §0 CHANGELOG', '## §1 BODY COMP MATRIX', '## §2 EXECUTIVE DASHBOARD',
      '## §3 TDEE & DEFICIT', '## §4 WEIGHT SUMMARY', '## §5 SESSION ANALYTICS',
      '## §6 MEV TARGET AUDIT', '## §7 DIRECTIVES']
    let cursor = -1
    for (const h of order) {
      const at = out.indexOf(h)
      expect(at, `${h} missing`).toBeGreaterThan(-1)
      expect(at, `${h} out of order`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('opens with an ASCII header box carrying cycle, phase and completeness', () => {
    expect(out).toMatch(/╔═+╗/)
    expect(out).toContain('SENTINEL-7 · WEEKLY TELEMETRY AUDIT')
    expect(out).toContain('2026-07-26 → 2026-08-01')
    expect(out).toContain('Helix-5 · cut')
    expect(out).toMatch(/COMPLETENESS 100%/)
  })

  it('leaves the verdict and both grades for the model to assign', () => {
    expect(out).toMatch(/VERDICT\s+__ \/ 100/)
    expect(out).toMatch(/EXECUTION GRADE\s+__/)
    expect(out).toMatch(/STRATEGY GRADE\s+__/)
  })

  it('carries the TDEE ledger pre-computed, not as an instruction to calculate', () => {
    expect(out).toContain('= TDEE')
    expect(out).toContain('= BALANCE')
    expect(out).toContain('kg predicted fat change')
    expect(out).toMatch(/Do not recompute/)
  })

  it('shows T4WM and the three stall levers', () => {
    expect(out).toContain('T4WM')
    expect(out).toContain('1 · NEAT')
    expect(out).toContain('2 · Intake')
    expect(out).toContain('3 · Diet break')
  })

  it('lists every body-comp column the brief asks for, including BMI', () => {
    for (const col of ['BMI', 'BF%', 'Fat mass', 'Muscle%', 'Muscle mass', 'FFM', 'Water%', 'Visceral', 'BMR']) {
      expect(out, `missing column ${col}`).toContain(col)
    }
  })

  it('maps sessions to executed / target Rx / baseline / status', () => {
    expect(out).toContain('| Exercise | Executed | Target Rx | Pre-cycle baseline | Status |')
    expect(out).toContain('27.5kg × 13')
    expect(out).toContain('3 × 8–15')
  })

  it('renders the cardio pace derived, and states it is already counted', () => {
    expect(out).toContain('10:43 /km')
    expect(out).toMatch(/already inside the day's steps and active calories/)
  })

  it('audits volume compliance and the failure policy', () => {
    expect(out).toContain('UNDER')          // Quads 7/10
    expect(out).toContain('Taken to failure')
    expect(out).toContain('Leg Press')
  })

  it('forbids inventing numbers', () => {
    expect(out).toMatch(/Never invent a number/)
    expect(out).toMatch(/No baseline, no percentage/)
  })

  it('is deterministic — no clock, no randomness', () => {
    expect(buildSentinelExport(input)).toBe(out)
  })

  it('degrades honestly on an empty week instead of fabricating a shape', () => {
    const empty = buildSentinelExport({
      ...input, bodyComp: [], sessions: [], cardio: [], weighInHistory: [], priorFindings: [],
      days: input.days.map((d) => ({ ...d, intakeKcal: null, steps: null, sleepMin: null, waterMl: null })),
    })
    expect(empty).toContain('_No InBody readings this cycle')
    expect(empty).toContain('_No sessions logged this cycle._')
    expect(empty).toContain('_No weigh-ins on record._')
    expect(empty).toMatch(/COMPLETENESS 0%/)
  })
})

describe('the stability chart shows deviation, not just magnitude', () => {
  // Regression: intake clustered around the target rendered as seven identical
  // full bars — a "stability" chart in which no variance was visible.
  const clustered: SentinelInput = {
    ...({} as SentinelInput),
    weekStart: '2026-07-26', weekEnd: '2026-08-01', weekLabel: null,
    planLabel: 'Helix-5', phase: 'cut',
    days: [1900, 1930, 1960, 1990, 2020, 2050, 2080].map((kcal, i) => ({
      date: `2026-07-2${i}`, weekdayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      isTrainingDay: false, intakeKcal: kcal, proteinG: 170, carbsG: 190, fatG: 55,
      steps: 10000, sleepMin: 430, waterMl: 3000, restingHr: 52, hrvMs: 60, score: 90,
    })),
    bodyComp: [], weighInHistory: [], sessions: [], cardio: [], volume: [],
    targets: {
      calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
      stepsGoal: 10000, sleepGoalHours: 8, waterGoalMl: 3000,
      targetWeightKg: 62, targetBodyFatPct: 13, rateMinKgWk: -0.5, rateMaxKgWk: -0.4,
    },
    priorFindings: [], priorStalledWeeks: 0,
  }
  const out = buildSentinelExport(clustered)

  it('prints a signed delta against target for every day', () => {
    expect(out).toMatch(/Δ\s+-55/)    // 1900 vs 1955
    expect(out).toMatch(/Δ\s+\+125/)  // 2080 vs 1955
  })

  it('states the spread, so clustered bars cannot hide the variance', () => {
    expect(out).toMatch(/spread\s+180 kcal/)
  })

  it('omits the spread line when only one day was logged', () => {
    const single = buildSentinelExport({
      ...clustered,
      days: clustered.days.map((d, i) => (i === 0 ? d : { ...d, intakeKcal: null })),
    })
    expect(single).not.toMatch(/spread/)
  })
})
