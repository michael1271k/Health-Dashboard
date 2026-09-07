import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay, type ExportSession } from '@/lib/reports/weeklyExport'
import {
  headings, headerCells, sectionLines, sectionText, rowsOf,
  weekRow, dayRow, derivedWeekRow, howLine, assertAligned, DASH,
} from './exportGrammar'

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
 *
 * v3 keeps that argument and states it in ~90 lines instead of ~310. The order
 * is now: the header, the rungs the week ran under, the EVIDENCE (days,
 * sessions, cardio, body, nutrients, the prescribed stack), then the sums over
 * that evidence, then the programme, then — last, behind a heading that says so
 * — the arithmetic Onyx did itself.
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

/**
 * The canonical RICH week — every section lit — taken from the golden fixture's
 * INPUT and rebuilt live rather than compared against the stored string. It is
 * the only fixture that exercises the whole order at once, and the only honest
 * subject for the length gate.
 */
const richInput = (() => {
  const fx = JSON.parse(readFileSync(
    'native/Packages/OnyxCore/Tests/OnyxCoreTests/Fixtures/weekly-export.json', 'utf8'))
  const hit = fx.cases.find((c: { name: string }) => c.name === 'the rich week — every section lit')
  if (!hit) throw new Error('the golden fixture no longer carries a rich week')
  return hit.input as WeeklyExportInput
})()
const rich = (): WeeklyExportInput => ({ ...richInput })

/** Index of a heading, asserted to exist so a typo cannot silently pass. */
function at(out: string, heading: string): number {
  const i = out.indexOf(`\n${heading}`)
  expect(i, `missing section: ${heading}`).toBeGreaterThan(-1)
  return i
}

describe('the document order', () => {
  it('runs targets → evidence → analysis → provenance', () => {
    const out = buildWeeklyExport(rich())
    // Every zip in every other assertion in these files depends on this.
    assertAligned(out)
    expect(out.split('\n')[0].startsWith('# ONYX ')).toBe(true)
    expect(headings(out)).toEqual([
      '## LEVERS',        // what the week was ASKED for
      '## DAYS',          // ── the evidence ──
      '## SESSIONS',
      '## CARDIO',
      '## BODY',
      '## NUTRIENTS',
      '## SUPPS',
      '## WEEK',          // ── sums over the evidence ──
      '## WEEK.MUSCLE',
      '## LEDGER',        // ── the programme ──
      '## DERIVED',       // ── Onyx's own arithmetic, fenced and last ──
      '## DERIVED.WEEK',
    ])
  })

  it('prints the rungs only when the week ran under more than one', () => {
    // A single-rung week states its rung in the header's `lever=` token; a
    // `## LEVERS` section would be four lines repeating it.
    const many = buildWeeklyExport(rich())
    expect(headings(many)).toContain('## LEVERS')
    expect(headerCells(many)[4]).toBe('lever=mixed')

    const one = buildWeeklyExport({ ...rich(), targetPeriods: [rich().targetPeriods![0]] })
    expect(headings(one)).not.toContain('## LEVERS')
    expect(headerCells(one)[4]).toMatch(/^lever=maintenance-week /)

    // And a caller with no goal history at all degrades to `—`, never to a
    // fabricated rung.
    const none = buildWeeklyExport(full())
    expect(headings(none)).not.toContain('## LEVERS')
    expect(headerCells(none)[4]).toBe(`lever=${DASH}`)
  })

  it('anchors every session to a day that exists in ## DAYS', () => {
    // `## Days` and `## Sessions` were two v2 sections forty lines apart
    // describing the same Monday, with nothing but the prose tying them. v3
    // splits them again — one line per record is the whole grammar — so the
    // JOIN has to be explicit: every session row carries the date AND the
    // weekday of the `## DAYS` row it belongs to.
    const out = buildWeeklyExport(rich())
    const days = new Map(rowsOf(out, 'DAYS').map((d) => [d.date, d.day]))
    const sessions = rowsOf(out, 'SESSIONS')
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      expect(days.has(s.date), `session on ${s.date} has no day row`).toBe(true)
      expect(s.day).toBe(days.get(s.date))
      // The day itself says a session happened, so neither section can be read
      // alone and get the week wrong.
      expect(dayRow(out, s.date).train).toBe('1')
    }
  })

  it('gathers every week-spanning total under one aggregates heading', () => {
    // The reverse of the 2026-08-03 split: tonnage, the energy balance and the
    // step average are all sums over the same seven days, and each had grown its
    // own top-level heading between the daily log and the trend table. In v3
    // they are columns of ONE row under `## WEEK`.
    const out = buildWeeklyExport(full())
    const week = weekRow(out)
    expect(week.tonnage_kg).toBe('5000')
    expect(week.steps_avg).toBe('11000')
    expect(week.sessions).toBe('1')
    // The energy balance is a sum over the same seven days, so it is one row
    // too — under the fence rather than on `## WEEK`, because BMR is carried,
    // active energy is a watch estimate and TEF is a coefficient.
    // 2 × (1700 BMR + 600 active + 199.5 TEF) = 4999 out against 3800 in.
    expect(derivedWeekRow(out).balance_kcal).toBe('-1199')
    expect(week.balance_kcal).toBeUndefined()
    // Nothing week-spanning grew a heading of its own.
    expect(headings(out).filter((h) => h.startsWith('## WEEK')))
      .toEqual(['## WEEK', '## WEEK.MUSCLE'])
    for (const gone of ['## Nutrition & Energy', '## Cardio & Activity', '## Weekly aggregates']) {
      expect(out).not.toContain(gone)
    }
  })

  it('keeps the aggregates BELOW the evidence they are derived from', () => {
    // Every number in that row is a sum of rows already printed. A reader who
    // meets the totals first anchors on them and reads the daily log to confirm
    // rather than to check.
    const out = buildWeeklyExport(rich())
    expect(at(out, '## DAYS')).toBeLessThan(at(out, '## WEEK'))
    expect(at(out, '## SESSIONS')).toBeLessThan(at(out, '## WEEK'))
    expect(at(out, '## CARDIO')).toBeLessThan(at(out, '## WEEK'))
    expect(at(out, '## BODY')).toBeLessThan(at(out, '## WEEK'))
    // And the fence is last of all — nothing measured sits below it, and every
    // figure that IS arithmetic sits under it.
    expect(at(out, '## WEEK')).toBeLessThan(at(out, '## DERIVED'))
    expect(at(out, '## DERIVED')).toBeLessThan(at(out, '## DERIVED.WEEK'))
    expect(headings(out).at(-1)).toBe('## DERIVED.WEEK')
  })
})

describe('the caveats that used to be closing notes', () => {
  /**
   * v2 ended with four constants — the prior-report pointer, the unilateral
   * rule, the Epley note and the Apple Watch note — repeating the same paragraph
   * every week to a reader who had already read it. They are retired. The two
   * caveats that actually qualify a printed number now ride on the legend of the
   * section that prints it, where a reader meets them next to the figure rather
   * than four hundred lines later.
   */
  it('states the Epley and Apple Watch caveats inline, not as closing notes', () => {
    const out = buildWeeklyExport(rich())

    // The estimate is qualified ON the PR legend, beside the column it governs.
    const prLegend = sectionLines(out, 'SESSIONS').find((l) => l.startsWith('##   PR'))!
    expect(prLegend).toContain('e1rm_kg (Epley, weight × (1 + reps/30)'
      + ' — an ESTIMATE, not a lift that happened)')

    // The unilateral rule rides on the set grammar it changes the reading of.
    const setLegend = sectionLines(out, 'SESSIONS').find((l) => l.startsWith('##   exercise'))!
    expect(setLegend).toContain('a unilateral pair is Lset|Rset')

    // The instrument caveat sits on the `##   how` line that closes the
    // document, with the other statements about how a number was arrived at.
    expect(howLine(out)).toContain('heart rate, calories and steps come off the'
      + ' Apple Watch and are estimates')

    // And the four paragraphs themselves are gone, not merely moved.
    for (const retired of [
      'is provided manually for reference and comparison',
      '*Note: Unilateral',
      '*Note: every "1RM"',
      '*Note: Heart rate',
    ]) expect(out).not.toContain(retired)
  })

  it('ends on a data line, with no note after it', () => {
    // The document's last line is the `##   how` legend for the fence above it.
    // Nothing trails the evidence any more.
    const out = buildWeeklyExport(rich()).trimEnd()
    expect(out.split('\n').at(-1)!.startsWith('##   how')).toBe(true)
    expect(out).not.toMatch(/^\*Note:/m)
  })
})

describe('the ship gate', () => {
  /**
   * THE WHOLE POINT OF v3. The v2 document was ~310 lines of prose for one week
   * and spent most of a model's context before the first question could be
   * asked. 120 is the ceiling the grammar was designed against; the rich week —
   * every section lit, seven days, four sessions, three cardio bouts — is the
   * worst realistic case.
   */
  it('states the richest possible week in 120 lines or fewer', () => {
    const lines = buildWeeklyExport(rich()).split('\n')
    expect(lines.length).toBeGreaterThan(40)   // it is still the whole week
    expect(lines.length).toBeLessThanOrEqual(120)
  })

  it('spends no line on a nested bullet, a table rule or a blockquote', () => {
    // Every one of those was a v2 line that carried no fact of its own. The
    // `## LEDGER` table is the single, deliberate exception.
    const out = buildWeeklyExport(rich())
    const ledger = new Set(sectionLines(out, 'LEDGER'))
    for (const line of out.split('\n')) {
      if (ledger.has(line)) continue
      expect(line, `nested bullet: ${line}`).not.toMatch(/^\s+[-*] /)
      expect(line, `table rule: ${line}`).not.toMatch(/\|---/)
      expect(line, `blockquote: ${line}`).not.toMatch(/^>/)
    }
  })
})

describe('the energy estimate names the days it dropped', () => {
  it('lists an excluded day by name rather than only counting it out', () => {
    // "over 5 days" in a seven-day week is a fact the reader cannot act on
    // without knowing WHICH two are missing — a rest day and the week's biggest
    // session are very different omissions. In v3 the count and the names are
    // two columns of the same `## WEEK` row.
    const out = buildWeeklyExport({
      ...full(),
      days: [
        day('2026-08-16', 'Sun', { calories: 1900, bmrKcal: 1700, activeKcal: 600 }),
        day('2026-08-17', 'Mon', { calories: 1900, bmrKcal: 1700 }),   // no watch data
      ],
    })
    expect(derivedWeekRow(out).energy_days).toBe('1')
    expect(derivedWeekRow(out).energy_excluded).toBe('2026-08-17')
  })

  it('says nothing about exclusions when every day counted', () => {
    expect(derivedWeekRow(buildWeeklyExport(full())).energy_excluded).toBe(DASH)
  })
})

describe('the set-credit rule', () => {
  /**
   * v2 printed the crediting rule as prose under the sets-per-muscle block:
   * "A set credits 1.0 to each muscle a movement directly trains and 0.5 to each
   * it assists… assistance can lift a muscle out of UNDER, but only direct work
   * can put one OVER."
   *
   * v3 does not print it anywhere. It survives as the comment above the
   * `## WEEK.MUSCLE` renderer, and the SPLIT the sentence existed to explain is
   * shown as data instead: every muscle row carries `direct` and `indirect`
   * beside `sets`, so a reader sees the composition rather than being told the
   * arithmetic. This is the pin that the composition keeps arriving.
   */
  it('shows the direct/indirect split rather than explaining it in prose', () => {
    const out = buildWeeklyExport(rich())
    const glutes = rowsOf(out, 'WEEK.MUSCLE').find((r) => r.muscle === 'Glutes')!
    // 3.0 direct + 4.5 assisted = the 7.5 graded against the target.
    expect(glutes.sets).toBe('7.5')
    expect(glutes.direct).toBe('3.0')
    expect(glutes.indirect).toBe('4.5')
    expect(Number(glutes.direct) + Number(glutes.indirect)).toBe(Number(glutes.sets))
    // Tonnage is split the same way, so assistance work can never be read as
    // direct load.
    expect(Number(glutes.direct_kg)).toBeLessThan(Number(glutes.tonnage_kg))
    expect(out).not.toContain('A set credits 1.0')
  })

  it('teaches no specific movement, and states no verdict', () => {
    const muscle = sectionText(buildWeeklyExport(rich()), 'WEEK.MUSCLE')
    // The old wording spent three clauses on an RDL and a row.
    expect(muscle).not.toMatch(/RDL|pays hamstrings|pays the back in full/)
    // A zone is a verdict, and this document holds no verdicts.
    expect(muscle).not.toMatch(/building|maintenance|under|over/i)
  })
})
