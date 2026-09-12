import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, EXPORT_NOTES,
  type WeeklyExportInput, type ExportDay, type ExportSession,
} from '@/lib/reports/weeklyExport'
import {
  headings, metaCells, title, sectionLines, subsectionLines, hasSubsection,
  weekField, dayField, dayFieldOrNull, dayHeadings, dayLines,
  tableRow, table, notes, legendText, assertAligned, notRecorded, setsOf, stack, NO_DATA,
} from './exportGrammar'

/**
 * ── WHERE A FACT SITS IS PART OF WHAT IT SAYS ────────────────────────────────
 *
 * v3 was columnar: one section per KIND of record, forty columns wide, every
 * day of the week in one block and every session in another. It stated a week
 * in 120 lines and a reader asking "what happened on Monday" had to visit four
 * sections and count dots to get there.
 *
 * v4 is day-major. The order is: the header, then `## THE WEEK` — what the week
 * was asked for and the sums over what it got — then one `## DAY n` section per
 * day carrying everything about that day, then the legend and the four notes.
 *
 * That inverts one of v3's rules and keeps the other. The AGGREGATES now come
 * FIRST, because a reader opening a weekly report wants the week and can scroll
 * for a Tuesday; v3 put them last so no total could be read before its evidence.
 * The rule that survives is the one that mattered: a computed figure is named
 * as computed WHERE IT SITS, since a day-major document has no fence to put it
 * behind.
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

describe('the document order', () => {
  it('runs header → the week → one section per day → legend → notes', () => {
    const out = buildWeeklyExport(rich())
    // Every field lookup in every other assertion in these files depends on
    // this: a row with no hard break runs into the row below it, and every
    // reader after that silently gets two rows glued together.
    assertAligned(out)
    expect(title(out)).toBe('# ONYX · WEEK 7')
    expect(headings(out)).toEqual([
      'THE WEEK',                                   // what was asked, and the sums
      'Sets by muscle',
      'Body composition',
      'Micronutrients — weekly average vs target',
      'The stack',
      'DAY 1 · Sun · 2026-08-30 · REST',            // ── the week, day by day ──
      'DAY 2 · Mon · 2026-08-31 · TRAIN — Legs & Core A',
      'Session #41 · Legs & Core A · [Quads, Calves, Abs/core, *Hamstrings*, *Glutes*]',
      'DAY 3 · Tue · 2026-09-01 · TRAIN — Delts & Arms',
      // No deck index on this one, so the order is the logged sequence and says so.
      'Session #42 · Delts & Arms · [Side delts, Biceps, Abs/core, *Forearms*] *(order: logged sequence)*',
      'DAY 4 · Wed · 2026-09-02 · REST',
      'DAY 5 · Thu · 2026-09-03 · TRAIN — Upper B',
      'Session · Upper B',
      'DAY 6 · Fri · 2026-09-04 · TRAIN — Legs & Core B',
      'Session #43 · Legs & Core B',
      'DAY 7 · Sat · 2026-09-05 · REST',
      'LEGEND',                                     // ── how to read it ──
      'NOTES',
    ])
  })

  it('names the day on its own heading, weekday and ISO date together', () => {
    // v3 keyed every row on a bare ISO date and printed the weekday in a column
    // beside it. A day-major document can put both in the heading, and must:
    // "Sun" alone cannot be looked up and `2026-08-30` alone cannot be read.
    const out = buildWeeklyExport(rich())
    expect(dayHeadings(out)).toHaveLength(7)
    expect(dayHeadings(out)[0]).toBe('DAY 1 · Sun · 2026-08-30 · REST')
    // A day that trained says so, and names what it trained.
    expect(dayHeadings(out)[1]).toBe('DAY 2 · Mon · 2026-08-31 · TRAIN — Legs & Core A')
  })

  it('prints the rungs only when the week ran under more than one', () => {
    // A single-rung week names its rung on the plan line; a bulleted list would
    // be one line repeating it.
    const many = buildWeeklyExport(rich())
    expect(weekField(many, 'Plan')).toContain('**Levers** 2 rungs this week')
    expect(sectionLines(many, 'THE WEEK').filter((l) => l.startsWith('- **'))).toHaveLength(2)

    const one = buildWeeklyExport({ ...rich(), targetPeriods: [rich().targetPeriods![0]] })
    expect(weekField(one, 'Plan')).toContain('**Lever** Maintenance Week')
    expect(sectionLines(one, 'THE WEEK').filter((l) => l.startsWith('- **'))).toHaveLength(0)

    // And a caller with no goal history at all degrades to "no data", never to
    // a fabricated rung.
    const none = buildWeeklyExport(full())
    expect(weekField(none, 'Plan')).toContain(`**Lever** ${NO_DATA}`)
  })

  it('keeps every session inside the day it was trained on', () => {
    // v3 had `## DAYS` and `## SESSIONS` forty lines apart describing the same
    // Monday, joined only by a repeated date column. The join is now structural:
    // a session is a `###` inside its day, so it cannot be attributed to another.
    const out = buildWeeklyExport(rich())
    for (const s of rich().sessions) {
      const block = dayLines(out, s.date)
      expect(block.some((l) => l.startsWith('### Session')), `no session under ${s.date}`).toBe(true)
      expect(block.some((l) => l.includes(s.label))).toBe(true)
      // The heading itself says the day trained, so neither can be read alone
      // and get the week wrong.
      expect(dayHeadings(out).find((h) => h.includes(s.date))).toContain('TRAIN')
    }
  })

  it('gathers every week-spanning total under one heading', () => {
    // Tonnage, the energy balance and the step average are all sums over the
    // same seven days. Each had grown its own top-level section in v2; here
    // they are labelled rows of one `## THE WEEK` block.
    const out = buildWeeklyExport(full())
    expect(weekField(out, 'Training')).toContain('5,000 kg')
    expect(weekField(out, 'Activity')).toContain('11,000 steps/day')
    expect(weekField(out, 'Training')).toContain('1 session')
    // 2 × (1700 BMR + 600 active + 199.5 TEF) = 4999 out against 3800 in.
    expect(weekField(out, 'Energy balance')).toContain('−1,199 kcal over the week')
    // Nothing week-spanning grew a heading of its own.
    expect(headings(out).filter((h) => h.startsWith('DAY '))).toHaveLength(2)
    for (const gone of ['## Nutrition & Energy', '## Cardio & Activity', '## Weekly aggregates']) {
      expect(out).not.toContain(gone)
    }
  })

  it('names every computed figure as computed, where it sits', () => {
    // v3's fence was a document-level boundary: measured above `## DERIVED`,
    // arithmetic below. Day-major layout cannot keep one, so the marker travels
    // with the figure — and it must, because these lines sit inches from
    // measurements.
    const out = buildWeeklyExport(rich())
    expect(weekField(out, 'Energy balance')).toContain('*computed by Onyx, an estimate*')
    const derived = dayField(out, '2026-08-30', 'Derived')
    expect(dayLines(out, '2026-08-30').find((l) => l.startsWith('**Derived**')))
      .toContain('*(computed by Onyx, not measured)*')
    expect(derived).toContain('TDEE')
    expect(derived).toContain('ACWR')
    // Day Score and Battery remain unexported: both are Onyx's own opinion of a
    // day rather than arithmetic a reader can audit.
    expect(out).not.toMatch(/battery/i)
    expect(out).not.toMatch(/day score/i)
  })
})

describe('the four closing notes', () => {
  /**
   * v3 retired v2's closing notes on the grounds that a caveat belongs on the
   * line it qualifies. That is right, and it is why the legend exists — but
   * these four are facts about how a number was ARRIVED AT, which no single
   * line can carry and which a reader who has not been told gets wrong in a
   * specific, predictable way.
   *
   * They are asserted byte for byte, against the exported constant, so a
   * reworded note fails here rather than shipping.
   */
  it('ends with the four notes, verbatim and in order', () => {
    const out = buildWeeklyExport(rich())
    expect(notes(out)).toEqual([...EXPORT_NOTES])
    expect(headings(out).at(-1)).toBe('NOTES')
    expect(out.trimEnd().split('\n').at(-1)).toBe(`- ${EXPORT_NOTES[3]}`)
  })

  it('states the unilateral rule, the Epley estimate and the watch caveat', () => {
    const all = notes(buildWeeklyExport(rich())).join('\n')
    expect(all).toContain('min(weight) × min(reps)')
    expect(all).toContain('the pair counts as ONE set')
    expect(all).toContain('weight × (1 + reps/30)')
    expect(all).toContain('Unloaded work has no 1RM estimate at all')
    expect(all).toContain('sourced from the Apple Watch')
    expect(all).toContain('Week 7 report is provided manually')
  })

  it('keeps the legend above them, and every convention in it', () => {
    const legend = legendText(buildWeeklyExport(rich()))
    // The ladder is read from RPE_LADDER, so the document cannot state a scale
    // the logger does not offer.
    expect(legend).toContain('8.5 Hard *(2 left)*')
    expect(legend).toContain('10 Failure *(missed or form broke)*')
    expect(legend).toContain('`W` warm-up')
    expect(legend).toContain('`G` ghost')
    expect(legend).toContain('0.5 to each it assists')
    expect(legend).toContain('It is never a zero.')
  })
})

describe('the ship gate', () => {
  /**
   * v3's gate was 120 lines, and it bought that with a grammar nobody could
   * read. v4 spends the lines a day-major document costs and buys back the
   * thing the export exists for: it can be pasted into a model, or read by a
   * coach, without a legend in the other hand.
   *
   * The ceiling is still a ceiling. ~19 kB of the richest realistic week — seven
   * days, four sessions, three cardio bouts, every section lit — is about five
   * thousand tokens, which is a cost a weekly document can carry. Doubling that
   * is not.
   */
  it('states the richest possible week inside its budget', () => {
    const out = buildWeeklyExport(rich())
    const lines = out.split('\n')
    expect(lines.length).toBeGreaterThan(150)      // it is still the whole week
    expect(lines.length).toBeLessThanOrEqual(400)
    expect(out.length).toBeLessThanOrEqual(25_000)
  })

  it('keeps its tables to the three that are genuinely grids', () => {
    // A markdown table collapses into one unreadable paragraph in Apple Notes,
    // and this document is written to be pasted anywhere. Three earn it: each is
    // read DOWN a column. Nothing else may grow one.
    //
    // It was FOUR until v4.1. `### Week over week` was the fourth and it was a
    // real grid — it is gone because the document is now strictly about the week
    // on its cover, not because it read badly. See the removal note in
    // `buildWeeklyExport`.
    const out = buildWeeklyExport(rich())
    const rules = out.split('\n').filter((l) => /^\|[:-]/.test(l))
    expect(rules).toHaveLength(3)
    for (const t of ['Sets by muscle', 'Body composition']) {
      expect(hasSubsection(out, t), `missing table: ${t}`).toBe(true)
    }
    expect(hasSubsection(out, 'Micronutrients — weekly average vs target')).toBe(true)
    // And the fourth stays gone.
    expect(hasSubsection(out, 'Week over week')).toBe(false)
  })

  it('spends no line on a nested bullet or a blockquote', () => {
    // Every one of those was a v2 line that carried no fact of its own.
    for (const line of buildWeeklyExport(rich()).split('\n')) {
      expect(line, `nested bullet: ${line}`).not.toMatch(/^\s+[-*] /)
      expect(line, `blockquote: ${line}`).not.toMatch(/^>/)
    }
  })

  it('opens with no prompt and no coaching header', () => {
    // The app defines no report format and gives a model no instructions. The
    // document is the week; whatever is asked of it is asked outside the app.
    const out = buildWeeklyExport(rich())
    expect(metaCells(out)[0]).toBe('2026-08-30 → 2026-09-05')
    expect(out).not.toMatch(/you are|please analyse|act as|your task/i)
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
    const block = sectionLines(out, 'THE WEEK').find((l) => l.startsWith('TDEE '))!
    expect(block).toContain('1 day counted')
    expect(block).toContain('excluded 2026-08-17')
  })

  it('says nothing about exclusions when every day counted', () => {
    const block = sectionLines(buildWeeklyExport(full()), 'THE WEEK').find((l) => l.startsWith('TDEE '))!
    expect(block).not.toContain('excluded')
  })

  it('says so plainly when no day carried both halves', () => {
    const out = buildWeeklyExport({ ...full(), days: [day('2026-08-16', 'Sun')] })
    expect(weekField(out, 'Energy balance'))
      .toBe(`${NO_DATA} — no day carried both an intake and an expenditure.`)
  })
})

describe('the set-credit rule', () => {
  /**
   * v2 printed the crediting rule as prose. v3 dropped it and showed the SPLIT
   * as data instead. v4 keeps the data AND states the rule once, in the legend
   * — a reader meeting `7.5 / 8.0` with a `3.0` and a `4.5` beside it can see
   * the composition, but cannot infer that an assisted set is worth half.
   */
  it('shows the direct/indirect split as columns of the table', () => {
    const out = buildWeeklyExport(rich())
    const glutes = tableRow(out, 'Sets by muscle', 'Glutes')
    // 3.0 direct + 4.5 assisted = the 7.5 graded against the target.
    expect(glutes.Sets).toBe('7.5')
    expect(glutes.Target).toBe('8.0')
    expect(glutes.Δ).toBe('−0.5')
    expect(glutes.Direct).toBe('3.0')
    expect(glutes.Indirect).toBe('4.5')
    expect(Number(glutes.Direct) + Number(glutes.Indirect)).toBe(Number(glutes.Sets))
    expect(legendText(out)).toContain('0.5 to each it assists')
  })

  it('says "none" for a muscle with no target rather than a target of zero', () => {
    // `Adductors` genuinely carries 0 on a cut, and a muscle the plan never
    // named carries none at all. A printed `0.0` would read as the second.
    const out = buildWeeklyExport(rich())
    expect(tableRow(out, 'Sets by muscle', 'Adductors').Target).toBe('none')
    expect(tableRow(out, 'Sets by muscle', 'Adductors').Δ).toBe('—')
  })

  it('teaches no specific movement, and states no verdict', () => {
    const muscle = subsectionLines(buildWeeklyExport(rich()), 'Sets by muscle').join('\n')
    expect(muscle).not.toMatch(/RDL|pays hamstrings|pays the back in full/)
    // A zone is a verdict, and this document holds no verdicts.
    expect(muscle).not.toMatch(/building|maintenance|optimal/i)
  })
})

describe('a day with nothing in it', () => {
  it('drops the rows it has no reading for and names them once', () => {
    // Twelve rows all saying "no data" is not stating a gap — it is burying the
    // day's one real fact in it. The gap is stated once, by name, at the foot.
    const out = buildWeeklyExport(rich())
    const empty = notRecorded(out, '2026-09-05')
    expect(empty).toContain('sleep')
    expect(empty).toContain('vitals')
    expect(empty).toContain('intake')
    expect(empty).toContain('training')
    expect(empty).toContain('cardio')
    expect(dayFieldOrNull(out, '2026-09-05', 'Sleep')).toBeNull()
    expect(dayFieldOrNull(out, '2026-09-05', 'Intake')).toBeNull()
    // What it DOES know still prints: a joint flag and why there was no weigh-in.
    expect(dayField(out, '2026-09-05', 'Readiness')).toContain('joints AC joint')
    expect(dayField(out, '2026-09-05', 'Body')).toBe('no weigh-in — Travel · BMR 1,511 kcal *(carried)*')
  })

  it('never claims a day was standard when it heard nothing about it', () => {
    const out = buildWeeklyExport(rich())
    expect(dayFieldOrNull(out, '2026-09-05', 'Shape')).toBeNull()
    expect(dayField(out, '2026-08-30', 'Shape')).toBe('standard day')
  })

  it('carries a whole empty week without inventing a single figure', () => {
    const out = buildWeeklyExport({
      weekStart: '2026-08-16', weekEnd: '2026-08-22', programLabel: 'Helix Cut',
      calorieGoal: null, proteinGoalG: null, stepsGoal: null, sleepGoalHours: null,
      days: [day('2026-08-16', 'Sun')], sessions: [], volumeByMuscle: [], doms: [],
    })
    assertAligned(out)
    expect(weekField(out, 'Body')).toBe('no weigh-in this week')
    expect(weekField(out, 'Cardio')).toBe('none')
    expect(notRecorded(out, '2026-08-16')).toContain('sleep')
    expect(out).not.toMatch(/\b0 kcal\b/)
    // The legend and the notes are unconditional: they describe the document,
    // not the week, and a thin week is exactly where a reader needs them.
    expect(notes(out)).toEqual([...EXPORT_NOTES])
  })
})

describe('the tables', () => {
  it('averages a micronutrient over the days that carried a reading', () => {
    // Over seven would report a deficiency the week does not have — the same
    // class of error as reading a gap as a zero.
    const out = buildWeeklyExport(rich())
    const c = tableRow(out, 'Micronutrients — weekly average vs target', 'Calcium')
    // One of the two readings is implausible, so it is DISCARDED rather than
    // averaged in, and the Days column states both numbers: the mean is over
    // one day, out of two that carried a figure.
    expect(c.Days).toBe('1 of 2 ⚠')
    expect(c.Target).toBe('1,000 mg')
    // A nutrient with nothing to doubt states its denominator plainly.
    expect(tableRow(out, 'Micronutrients — weekly average vs target', 'Iron').Days)
      .toBe('2')
  })

  it('keeps food and stack apart on every nutrient', () => {
    const t = table(buildWeeklyExport(rich()), 'Micronutrients — weekly average vs target')
    expect(t.columns).toEqual(['Nutrient', 'Food', 'Stack', 'Total', 'Target', '%', 'Days'])
    const vitC = tableRow(buildWeeklyExport(rich()),
      'Micronutrients — weekly average vs target', 'Vitamin C')
    // A tablet supplied most of it, which is a different fact about the week.
    expect(Number(vitC.Stack.replace(/,/g, ''))).toBeGreaterThan(Number(vitC.Food.replace(/,/g, '')))
  })

  it('states a compartment as a percentage AND a mass', () => {
    // A percentage of a falling bodyweight can rise while the tissue shrinks.
    const b = tableRow(buildWeeklyExport(rich()), 'Body composition', '30 Aug')
    expect(b['Fat %']).toBe('16.8')
    expect(b['Fat kg']).toBe('10.9')
    expect(b['Muscle %']).toBe('77.4')
    expect(b['Muscle kg']).toBe('50.2')
  })

  it('names the days with no weigh-in under the body table, with the reason', () => {
    const out = buildWeeklyExport(rich())
    const note = subsectionLines(out, 'Body composition').find((l) => l.startsWith('*No weigh-in'))!
    expect(note).toContain('1 Sep — Sick')
    expect(note).toContain('5 Sep — Travel')
    // A skipped weigh-in with no stored reason resolves to the protocol
    // default, which is a fact, not to "unknown", which is not.
    expect(note).toContain('31 Aug — As Planned')
  })
})

/**
 * ── THE EXPORT IS A PURE FUNCTION OF THE ROWS ────────────────────────────────
 *
 * The reported defect was that a retroactive edit — water logged for Tuesday on
 * Friday, a weigh-in corrected three days later, a set fixed after the fact —
 * did not reach the document. It was never the renderer: `buildWeeklyExport` has
 * no cache and no clock, so the same payload always renders the same bytes and a
 * changed payload always renders the changed bytes.
 *
 * It was the two layers ABOVE it, and both are fixed elsewhere in this wave:
 *   · web — `['weekly_export']` hung off four tables out of a dozen, so a
 *     `water_intake` / `daily_logs` / `nutrition_entries` write invalidated
 *     nothing and `staleTime: 60_000` served the stale markdown;
 *   · native — `WeekDaysView.load()` rebuilt the file only when a rescore
 *     cascade bumped `rescoreGeneration`, so anything that does not rescore
 *     (a supplement tick, a cardio bout, a sync pull) left the previous
 *     `onyx-week-<date>.md` in the temporary directory to be shared again.
 *
 * These tests pin the property the fixes depend on: edit the payload, and the
 * document moves with it. If this ever fails, no amount of invalidation helps.
 */
describe('a retroactive edit reaches the document', () => {
  const withDay = (base: WeeklyExportInput, date: string, patch: Partial<ExportDay>) => ({
    ...base,
    days: base.days.map((d) => (d.date === date ? { ...d, ...patch } : d)),
  })

  it('is deterministic: the same payload renders the same bytes twice', () => {
    const input = rich()
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('moves water logged for an earlier day', () => {
    const before = buildWeeklyExport(rich())
    const after = buildWeeklyExport(withDay(rich(), '2026-09-02', { waterMl: 3500 }))
    expect(after).not.toBe(before)
    expect(dayField(after, '2026-09-02', 'Intake')).toContain('water 3.50')
  })

  it('moves a weigh-in corrected days later', () => {
    const after = buildWeeklyExport(withDay(rich(), '2026-09-02', { weightKg: 63.9 }))
    expect(dayField(after, '2026-09-02', 'Body')).toContain('63.9 kg')
  })

  it('moves a set added to a session after the fact', () => {
    const base = rich()
    const session = base.sessions[0]
    const exercise = session.exercises[0]
    const after = buildWeeklyExport({
      ...base,
      sessions: base.sessions.map((s) => (s === session
        ? {
          ...s,
          exercises: s.exercises.map((e) => (e === exercise
            ? { ...e, sets: [...e.sets, { weightKg: 80, reps: 6, rpe: 9, failure: false, side: null, pairId: null }] }
            : e)),
        }
        : s)),
    })
    expect(setsOf(after, session.date, exercise.name).join('\n')).toContain('80 kg × 6')
  })

  it('moves a supplement skipped after the week closed', () => {
    const after = buildWeeklyExport(withDay(rich(), '2026-09-02', {
      supplementsSkipped: ['Creatine'],
    }))
    expect(stack(after, '2026-09-02').skipped).toEqual(['Creatine (planned)'])
  })

  it('moves a stress reading logged retroactively', () => {
    const base = rich()
    const after = buildWeeklyExport({
      ...base,
      stress: [...(base.stress ?? []), {
        date: '2026-09-02', slot: 'evening', level: 4, label: 'Strained',
        tags: ['work'], note: null,
      }],
    })
    expect(dayField(after, '2026-09-02', 'Stress')).toContain('evening 4 Strained')
  })

  it('carries a correction into the weekly totals, not just the day', () => {
    const before = buildWeeklyExport(rich())
    const after = buildWeeklyExport(withDay(rich(), '2026-09-02', { steps: 20000 }))
    const stepsOf = (out: string) => weekField(out, 'Activity')
    expect(stepsOf(after)).not.toBe(stepsOf(before))
  })
})
