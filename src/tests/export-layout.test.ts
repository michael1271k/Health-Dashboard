import { describe, it, expect } from 'vitest'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay, type ExportSession } from '@/lib/reports/weeklyExport'

/**
 * ── WHERE A FACT SITS IS PART OF WHAT IT SAYS ────────────────────────────────
 *
 * Everything in this export was already correct and much of it was in the wrong
 * place. Sets-per-muscle and tonnage-per-muscle — the same question in two
 * units — sat six sections apart, with the soreness list and the supplement
 * protocol between them. The energy balance and the step average were bullets
 * of a "Weekly aggregates" block below the trend ledger, at the very bottom.
 *
 * A section order is not a style preference here: a reader (or a model) given a
 * long document reads it in order, and burying the deficit under the trend table
 * asks them to hold the whole week in memory before they meet the number the
 * week is steered by.
 */

const day = (date: string, weekdayLabel: string, o: Partial<ExportDay> = {}): ExportDay => ({
  date, weekdayLabel, isTrainingDay: false,
  weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
  steps: null, distanceM: null, trainingMin: null, sleepMin: null, deepMin: null, remMin: null,
  restingHr: null, hrvMs: null, wristTempDeltaC: null, bloodOxygenPct: null,
  waterMl: null, supplementsTaken: null,
  activeKcal: null, bmrKcal: null, weighInSkipReason: null,
  nutritionException: null, nutritionEstimated: false, ...o,
})

const session: ExportSession = {
  date: '2026-08-17', sessionNumber: 12, label: 'Upper A', volumeKg: 5000, setCount: 18, failureSets: 1,
  durationMin: 60, avgBpm: 120, caloriesBurned: 400, sessionRpe: 8,
  exercises: [{
    name: 'Chest Press', repWindow: '8–12', topKg: 60,
    sets: [{ weightKg: 60, reps: 10, rpe: 8.5, side: null, failure: false, pairId: null }],
  }],
  prs: [],
}

const full = (): WeeklyExportInput => ({
  weekStart: '2026-08-16', weekEnd: '2026-08-22', weekLabel: 'Week 6',
  programLabel: 'Helix Cut',
  calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 7.5,
  days: [
    day('2026-08-16', 'Sun', { calories: 1900, bmrKcal: 1700, activeKcal: 600, steps: 10000 }),
    day('2026-08-17', 'Mon', { calories: 1900, bmrKcal: 1700, activeKcal: 600, steps: 12000, isTrainingDay: true }),
  ],
  sessions: [session],
  volumeByMuscle: [{ muscle: 'Chest', sets: 9, target: 12, directSets: 9, indirectSets: 0 }],
  tonnageByMuscle: [{ muscle: 'Chest', volumeKg: 5000 }],
  doms: [{ date: '2026-08-17', muscle: 'Chest', severity: 2 }],
  cardio: [],
  supplementProtocol: [{ time: '08:00', name: 'Creatine', dose: '5 g' }],
  ledger: [{ label: 'Week 6', weekStart: '2026-08-16', totals: {
    avgKcal: 1900, totalVolumeKg: 5000, avgSteps: 11000,
    cardioMinutes: null, avgWaterMl: null, avgWeightKg: 76,
  } }],
})

/** Index of a heading, asserted to exist so a typo cannot silently pass. */
function at(out: string, heading: string): number {
  const i = out.indexOf(heading)
  expect(i, `missing section: ${heading}`).toBeGreaterThan(-1)
  return i
}

describe('the document order', () => {
  it('runs targets → evidence → analysis → provenance', () => {
    const out = buildWeeklyExport(full())
    const order = [
      '## Targets & Levers',
      '## Weekly summary',
      '## Days',
      '## Sets Targets',
      '## DOMS',
      '## Supplements protocol',
      '## Week-over-Week Trends',
      '## Weekly aggregates',
    ].map((h) => at(out, h))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('has no separate Sessions section — the day owns its session', () => {
    // `## Days` and `## Sessions` were two sections forty lines apart describing
    // the same Monday. A session happens ON a day, against that day's sleep,
    // food and weigh-in, so it is printed inside it.
    const out = buildWeeklyExport(full())
    expect(out).not.toContain('## Sessions')
    const days = at(out, '## Days')
    const next = out.indexOf('## Sets Targets')
    expect(out.slice(days, next)).toContain('Session Metadata:')
  })

  it('gathers every week-spanning total under one aggregates heading', () => {
    // The reverse of the 2026-08-03 split: tonnage, the energy balance and the
    // step average are all sums over the same seven days, and each had grown its
    // own top-level heading between the daily log and the trend table.
    const out = buildWeeklyExport(full())
    const agg = at(out, '## Weekly aggregates')
    expect(out.indexOf('**Total volume:**')).toBeGreaterThan(agg)
    expect(out.indexOf('**Energy balance (estimated):**')).toBeGreaterThan(agg)
    expect(out.indexOf('**Steps (avg/day):**')).toBeGreaterThan(agg)
    expect(out.indexOf('**Daily shape**')).toBeGreaterThan(agg)
    expect(out).not.toContain('## Nutrition & Energy')
    expect(out).not.toContain('## Cardio & Activity')
  })

  it('keeps the aggregates BELOW the evidence they are derived from', () => {
    // Every number in that block is a sum of rows already printed. A reader who
    // meets the totals first anchors on them and reads the daily log to confirm
    // rather than to check.
    const out = buildWeeklyExport(full())
    expect(at(out, '## Days')).toBeLessThan(at(out, '## Weekly aggregates'))
  })
})

describe('the closing notes', () => {
  it('ends with the prior-report note and nothing after it', () => {
    const out = buildWeeklyExport(full()).trimEnd()
    expect(out.endsWith('*Note: Week 6 report is provided manually for reference and comparison.*')).toBe(true)
  })

  it('keeps the methodology notes above it', () => {
    const out = buildWeeklyExport(full())
    expect(out.indexOf('*Note: Unilateral')).toBeLessThan(out.indexOf('*Note: every "1RM"'))
    expect(out.indexOf('*Note: every "1RM"')).toBeLessThan(out.indexOf('*Note: Heart rate'))
    expect(out.indexOf('*Note: Heart rate')).toBeLessThan(out.indexOf('is provided manually'))
  })

  it('names Epley, because the PR lines now print the estimate itself', () => {
    // A bare "1RM: 53.73 kg" invites comparison with Hevy's figure, which is a
    // different formula. Printing the value obliges the document to say how.
    expect(buildWeeklyExport(full())).toContain('ESTIMATE from the Epley formula')
  })
})

describe('the set-credit note', () => {
  it('states the rule without teaching two specific movements', () => {
    const out = buildWeeklyExport(full())
    expect(out).toContain('A set credits 1.0 to each muscle a movement directly trains'
      + ' and 0.5 to each it assists.')
    // The old wording spent three clauses on an RDL and a row.
    expect(out).not.toMatch(/RDL/)
    expect(out).not.toMatch(/pays hamstrings/)
    expect(out).not.toMatch(/pays the back in full/)
  })

  it('still keeps the asymmetry, which is the part that surprises people', () => {
    expect(buildWeeklyExport(full()))
      .toContain('assistance can lift a muscle out of UNDER, but only direct work can put one OVER')
  })

  it('says it ONCE, for both sub-sections', () => {
    const out = buildWeeklyExport(full())
    expect(out.match(/A set credits 1\.0/g)).toHaveLength(1)
  })
})

describe('the energy estimate names the days it dropped', () => {
  it('lists an excluded day by name rather than only counting it out', () => {
    // "over 5 days" in a seven-day week is a fact the reader cannot act on
    // without knowing WHICH two are missing — a rest day and the week's biggest
    // session are very different omissions.
    const out = buildWeeklyExport({
      ...full(),
      days: [
        day('2026-08-16', 'Sun', { calories: 1900, bmrKcal: 1700, activeKcal: 600 }),
        day('2026-08-17', 'Mon', { calories: 1900, bmrKcal: 1700 }),   // no watch data
      ],
    })
    expect(out).toContain('over 1 day')
    expect(out).toContain('- Excluded: Mon 2026-08-17')
  })

  it('says nothing about exclusions when every day counted', () => {
    expect(buildWeeklyExport(full())).not.toContain('Excluded:')
  })
})
