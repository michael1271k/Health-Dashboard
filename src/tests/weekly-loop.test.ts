import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, weeklySummary, trendTotals,
  type WeeklyExportInput, type ExportDay, type ExportSession, type ExportCardio,
  type LedgerWeek, type ExportBodyComp, sparkline,
} from '@/lib/reports/weeklyExport'
import { stallProtocol, rollingAverage, type DayPoint, type SessionPoint } from '@/lib/coach/insights'
import {
  dayField, dayFieldOrNull, dayDates, dayHeadings, trained, notRecorded,
  bodyRow, muscleRow, cardioLines, sessionBlock, setsOf, exercise, weekSessions,
  sessionRpe, subsectionLines, hasSubsection, sectionLines, headings, metaCells,
  title, weekField, weekTotals, energy, derivedOf, stackProtocol, shape,
  legendText, readiness, dayLines, notMeasured, table, assertAligned, NO_DATA, NONE,
} from './exportGrammar'

const day = (date: string, p: Partial<DayPoint>): DayPoint => ({
  date, sleepMin: null, restHr: null, respiratory: null, weightKg: null,
  calories: null, calorieGoal: null, ...p,
})

/** n days of a perfectly flat weight — a genuine stall. */
function flatWeeks(days: number, kg: number, extra: Partial<DayPoint> = {}): DayPoint[] {
  return Array.from({ length: days }, (_, i) =>
    day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: kg, ...extra }))
}

describe('rollingAverage', () => {
  it('produces a 7-day window series', () => {
    expect(rollingAverage([1, 2, 3, 4, 5, 6, 7], 7)).toEqual([4])
    expect(rollingAverage([1, 2, 3], 7)).toEqual([])
  })
})

describe('stallProtocol — one lever, never a list', () => {
  const noSessions: SessionPoint[] = []

  it('stays silent without enough history', () => {
    expect(stallProtocol(flatWeeks(10, 65), noSessions)).toBeNull()
  })

  it('fires on a genuine 14-day flat rolling average', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out).not.toBeNull()
    expect(out!.id).toBe('stall-protocol')
    expect(out!.headline).toMatch(/stall/i)
  })

  it('picks the STEPS lever when steps are the weakest input', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out!.detail).toMatch(/1,500 steps/)
    expect(out!.detail).not.toMatch(/carb/i)
  })

  it('picks the CARB lever when steps are already high but carbs are not', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 220 }), noSessions)
    expect(out!.detail).toMatch(/100 kcal of carbs/)
  })

  it('falls back to the VOLUME lever when steps and carbs are both tight', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 90 }), noSessions)
    expect(out!.detail).toMatch(/one set per muscle/)
  })

  it('does NOT fire when a heavy session lands in the final 72h (that is water)', () => {
    const days = flatWeeks(25, 65, { steps: 6000 })
    const recent = days.slice(-2)[0].date
    expect(stallProtocol(days, [{ date: recent, volumeKg: 9000 }])).toBeNull()
  })

  it('does NOT fire when the rolling average is genuinely falling', () => {
    const days = Array.from({ length: 25 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: 68 - i * 0.08, steps: 6000 }))
    expect(stallProtocol(days, [])).toBeNull()
  })
})

/**
 * ── READING v3 ───────────────────────────────────────────────────────────────
 *
 * v2 was prose, and the three helpers that used to live here existed to cope
 * with it: one to find a day's four indented lines, one to cut off the JSON
 * block that repeated every string, one to scope a `toContain` to a single
 * section because the vocabularies overlapped.
 *
 * v3 needs none of them. Every record is one ` · `-separated line under a
 * heading that names its columns, so `exportGrammar` zips a row against its own
 * legend by index and the assertions below read FIELDS rather than substrings.
 * The overlap problem is worse now, not better — a date opens a row in five
 * different sections — which is exactly why nothing here greps the document.
 */

describe('buildWeeklyExport', () => {
  const emptyDay = (date: string, weekdayLabel: string): ExportDay => ({
    date, weekdayLabel, isTrainingDay: false,
    wristTempDeltaC: null, bloodOxygenPct: null,
    weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
    steps: null, distanceM: null, trainingMin: null,
    sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
    waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null, weighInSkipReason: null,
    nutritionException: null, nutritionEstimated: false,
  })

  const input: WeeklyExportInput = {
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [
      {
        ...emptyDay('2026-07-19', 'Sun'), isTrainingDay: true,
        weightKg: 65.3, calories: 1940, proteinG: 172, carbsG: 190, fatG: 54,
        steps: 9200, distanceM: 7100, trainingMin: 68,
        sleepMin: 551, restingHr: 48, hrvMs: 62, waterMl: 3000,
        supplementsTaken: 3,
      },
      emptyDay('2026-07-20', 'Mon'),
    ],
    sessions: [
      {
        date: '2026-07-19', sessionNumber: 9, label: 'Upper A', volumeKg: 8240, setCount: 24,
        failureSets: 1, durationMin: 68, avgBpm: 118, caloriesBurned: 512, sessionRpe: 8,
        exercises: [{
          name: 'Chest Press', repWindow: '10–12', topKg: 60,
          sets: [
            { weightKg: 60, reps: 12, rpe: null, side: null, failure: false, pairId: null },
            { weightKg: 60, reps: 11, rpe: null, side: null, failure: false, pairId: null },
            { weightKg: 57.5, reps: 10, rpe: null, side: null, failure: true, pairId: null },
          ],
        }, {
          name: 'Single Arm Cable Crossover', repWindow: '12–15', topKg: 7.5,
          sets: [
            { weightKg: 7.5, reps: 15, rpe: null, side: 'L', failure: false, pairId: 'p1' },
            { weightKg: 7.5, reps: 13, rpe: null, side: 'R', failure: true, pairId: 'p1' },
          ],
        }],
        prs: [{
          name: 'Chest Press', weightKg: 60, reps: 12, axes: ['weight', 'e1rm'],
          volumeKg: 720, e1rmKg: 84,
        }],
      },
    ],
    volumeByMuscle: [
      { muscle: 'Chest', sets: 11, target: 11 },
      { muscle: 'Biceps', sets: 4, target: 8 },
    ],
    doms: [{ date: '2026-07-20', muscle: 'Quads', severity: 2 }],
  }

  it('is deterministic (same input → identical string)', () => {
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('zips every row against the legend on its own heading', () => {
    // The precondition for every other assertion in this file. A row missing
    // its hard break runs into the row below it, and every field read after
    // that silently returns two rows glued together.
    assertAligned(buildWeeklyExport(input))
  })

  it('names a gap instead of dropping the day or implying zero', () => {
    const out = buildWeeklyExport(input)
    // The empty day is still PRESENT — it has a heading of its own, and it
    // names every row it had no reading for rather than going quiet.
    expect(dayHeadings(out).find((h) => h.includes('2026-07-20'))).toBe('DAY 2 · Mon · 2026-07-20 · REST')
    expect(trained(out, '2026-07-20')).toBe(false)
    for (const row of ['sleep', 'vitals', 'intake', 'activity', 'training', 'cardio']) {
      expect(notRecorded(out, '2026-07-20'), `${row} on the empty day`).toContain(row)
    }
    for (const label of ['Sleep', 'Vitals', 'Intake', 'Activity']) {
      expect(dayFieldOrNull(out, '2026-07-20', label), label).toBeNull()
    }
    // Never a fabricated 0. A day the app heard nothing about states nothing.
    const block = dayLines(out, '2026-07-20').join('\n')
    expect(block).not.toMatch(/\b0 (kcal|kg|steps|min)\b/)
  })

  it('is DRY DATA — no coaching prompt or instruction header', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/elite physique coach/)
    expect(out).not.toMatch(/Never invent data/)
    expect(out).not.toMatch(/highest-leverage/)
    // Starts straight at the week heading — the identity of the week, and
    // nothing telling the reader what to think about it.
    expect(title(out)).toBe('# ONYX · WEEK')
    expect(metaCells(out)[0]).toBe('2026-07-19 → 2026-07-25')
  })

  it('carries the program, sessions, and volume targets', () => {
    const out = buildWeeklyExport(input)
    expect(metaCells(out)[1]).toBe('Helix Cut')
    expect(sessionBlock(out, '2026-07-19').heading).toContain('Upper A')
    // The dose and the target, side by side. v2 graded it with a ZONE word
    // ("building"); the document prints no verdicts at all, so the comparison
    // is the reader's to make — 4 against 8 says everything the word did.
    const biceps = muscleRow(out, 'Biceps')
    expect(biceps.Sets).toBe('4.0')
    expect(biceps.Target).toBe('8.0')
    expect(subsectionLines(out, 'Sets by muscle').join('\n')).not.toMatch(/building/)
  })

  it('nests body composition under the weigh-in day only when supplied', () => {
    expect(hasSubsection(buildWeeklyExport(input), 'Body composition')).toBe(false)
    const withBody = buildWeeklyExport({
      ...input,
      bodyComp: [{
        date: '2026-07-19', weightKg: 65.3, bmi: 22.4, bodyFatPct: 13.2, musclePercent: 46.1,
        waterPercent: 60.5, visceralFat: 6, bmr: 1620, boneMineral: 4.1,
        muscleMassKg: 30.1, fatFreeMassKg: 56.7,
        fatMassKg: 8.6, proteinMassKg: 12.9, proteinPercent: 19.7, boneMineralKg: 2.81, waterMassKg: 39.5,
        skeletalMuscleMassKg: 27.0, estimatedWaistToHipRatio: 0.8,
      }],
    })
    // ONE line, every compartment in ABSOLUTE kg beside its percentage, in the
    // scale's own order — so a week-over-week read never has to multiply by a
    // bodyweight that is itself moving.
    const body = bodyRow(withBody, '2026-07-19')
    expect([body.Weight, body.BMI, body['Fat %'], body['Fat kg']])
      .toEqual(['65.3', '22.4', '13.2', '8.6'])
    expect([body['Muscle %'], body['Muscle kg']]).toEqual(['46.1', '30.1'])
    expect([body['Protein %'], body['Protein kg']]).toEqual(['19.7', '12.9'])
    expect([body.SMM, body.Visceral, body.BMR]).toEqual(['27.0', '6.0', '1,620'])
    expect([body.WHR, body.FFM]).toEqual(['0.80', '56.7'])
    // THREE numbers here could answer to "muscle mass" and they are ~23 kg
    // apart. Each gets its own NAMED column, which is the disambiguation v2
    // spent a parenthetical gloss on.
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['SMM', 'Muscle kg', 'FFM']))
    // The day's own row carries the same figures without leaving the day, and
    // they agree with the scale's row.
    const dayBody = dayField(withBody, '2026-07-19', 'Body')
    expect(dayBody).toContain('SMM 27.0 kg')
    expect(dayBody).toContain('BF 13.2 %')
  })

  it('nests walks/cardio under their day, flagged as already counted', () => {
    expect(buildWeeklyExport(input)).not.toContain('**Cardio**\n-')
    const withCardio = buildWeeklyExport({
      ...input,
      cardio: [{
        date: '2026-07-19', kind: 'walk', distanceM: 4200, durationMin: 45,
        kcal: 210, totalKcal: 265, avgHr: 112, effort: 4,
        startedAt: '2026-07-19T07:32:00+01:00', elevationM: 86, source: 'health',
      }],
    })
    // Every requested metric, named on the legend, in a fixed order. Pace is
    // DERIVED (45 min ÷ 4.2 km = 10:43 /km), never a stored column.
    const [walk] = cardioLines(withCardio, '2026-07-19')
    expect(walk).toContain('**Walk**')
    expect(walk).toContain('45.0 min')
    expect(walk).toContain('4.20 km')
    expect(walk).toContain('10:43 /km')
    expect(walk).toContain('avg HR 112')
    expect(walk).toContain('CR10 4')
    // v2 shouted the double-count warning in bold on every walk line. The
    // document states it structurally instead: the active share is named as
    // active and the total sits BESIDE it in the same phrase, so a reader
    // cannot add them together by accident.
    expect(walk).toContain('210 kcal active (265 total)')
    // An imported bout knows WHEN it happened and HOW MUCH it climbed. Both
    // were on the row and neither was exported, so a week of walks read as an
    // undifferentiated list of durations.
    expect(walk).toContain('07:32')
    expect(walk).toContain('+86 m')
    expect(walk).toContain('Apple Watch')
  })

  it('refuses to print a hand-typed row\'s insertion instant as a start time', () => {
    // `cardio_logs.created_at` is the bout's start on an IMPORTED row and the
    // moment of typing on a manual one — the column carries two meanings
    // because the table has no `started_at` and cannot get one. Printing the
    // manual one under `start_time` states that a walk done at 08:00 happened
    // at 21:00. `source` is exported so a reader can tell the two apart, but
    // the renderer does not make them depend on reading it.
    const typed = buildWeeklyExport({
      ...input,
      cardio: [{
        date: '2026-07-19', kind: 'walk', distanceM: 3000, durationMin: 30,
        kcal: 150, totalKcal: null, avgHr: null, effort: null,
        startedAt: '2026-07-19T21:04:00+01:00', elevationM: null, source: 'manual',
      }],
    })
    const [walk] = cardioLines(typed, '2026-07-19')
    expect(walk).toContain(`start ${NO_DATA}`)
    expect(walk).toContain('typed')
    expect(walk).not.toContain('21:04')
    // And the elevation it never had stays unstated rather than becoming zero.
    expect(walk).not.toMatch(/[+−]0 m/)
  })

  it('names every cardio metric even when it was never entered — and never invents a zero', () => {
    const sparse = buildWeeklyExport({
      ...input,
      cardio: [{
        date: '2026-07-19', kind: 'run', distanceM: null, durationMin: 30, kcal: null,
        totalKcal: null, avgHr: null, effort: null,
        startedAt: null, elevationM: null, source: 'manual',
      }],
    })
    // Dropping absent fields made two walks incomparable: one showed "avg HR
    // 112" and one showed nothing, with no way to tell missing data from a
    // missing export. Each field is a column and is explicitly unknown.
    const [run] = cardioLines(sparse, '2026-07-19')
    expect(run).toContain('**Run**')
    expect(run).toContain('30.0 min')
    expect(run).toContain(`start ${NO_DATA}`)
    expect(run).toContain(`avg HR ${NO_DATA}`)
    // The invariant that mattered in the original test: no fabricated zeros. A
    // distance, a pace, an elevation and a calorie figure that were never
    // entered are simply not stated, rather than becoming 0.
    expect(run).not.toMatch(/\b0(\.0+)? (km|m|kcal)\b/)
    expect(run).not.toContain('/km')
  })

  it('carries the Borg CR10 session effort onto the session line', () => {
    // `srpe` is the Borg CR10 rating, stated as given — the scale is named on
    // the legend rather than repeated as a suffix on every row.
    expect(sessionBlock(buildWeeklyExport(input), '2026-07-19').meta).toContain('sRPE 8 Very hard')
    // The scale is named in the legend rather than repeated on every session.
    expect(legendText(buildWeeklyExport(input))).toContain('Session sRPE uses Borg CR10')
  })

  it('lists EVERY working set, one per numbered line — not just the top set', () => {
    // Every set gets its own numbered line. The pin is that none is collapsed
    // away, and that the numbering counts WORKING sets.
    const out = buildWeeklyExport(input)
    expect(setsOf(out, '2026-07-19', 'Chest Press')).toEqual([
      '`S1` 60 kg × 12', '`S2` 60 kg × 11', '`S3` 57.5 kg × 10 — to failure',
    ])
    // The rep window the sets are read against rides on the exercise's header.
    expect(exercise(out, '2026-07-19', 'Chest Press').header).toContain('target 10–12 reps')
  })

  it('carries per-workout volume, failures, time and kcal burned', () => {
    const row = sessionBlock(buildWeeklyExport(input), '2026-07-19')
    expect(row.meta).toContain('68 min')
    expect(row.counts).toContain('8,240 kg tonnage')
    // Counted from the rows the document prints, not from the stored
    // `set_count`: where the two disagree the reader can count the lines.
    expect(row.counts).toContain('2 to failure')
    expect(row.meta).toContain('512 kcal')
    expect(row.meta).toContain('avg 118 bpm')
    expect(row.heading).toContain('Session #9')
  })

  it('marks a set taken to failure and NEVER emits an estimated 1RM', () => {
    const out = buildWeeklyExport(input)
    // The words, not a flag letter: `F` needed a legend to be read at all.
    expect(setsOf(out, '2026-07-19', 'Chest Press')[2]).toBe('`S3` 57.5 kg × 10 — to failure')
    expect(legendText(out)).toContain('`to failure`')
    // A SET line never grows an estimate. The only e1RM in the document is on a
    // PR line, and the closing notes say in as many words that it is an
    // estimate rather than a lift that happened.
    for (const ex of sessionBlock(out, '2026-07-19').exercises) {
      for (const line of ex.sets) expect(line).not.toMatch(/e1rm/i)
    }
    expect(buildWeeklyExport(input))
      .toContain('not a lift that was performed')
  })

  it('splits unilateral work per side (L/R weight · reps · failure)', () => {
    const out = buildWeeklyExport(input)
    // ONE token for the pair, both sides inside it — decided per SET by
    // `pairId`, so the two arms can never drift into two separate sets.
    expect(setsOf(out, '2026-07-19', 'Single Arm Cable Crossover'))
      .toEqual(['`S1` L 7.5 kg × 15 · R 7.5 kg × 13 — to failure → scores 7.5 kg × 13'])
  })

  it('names the PRs, and each axis carries its own value', () => {
    // The axis names ARE the labels: a Weight record's value is the lift
    // already printed to its left and stands alone, while the 1RM axis carries
    // the estimate a reader would otherwise have to compute.
    const out = buildWeeklyExport(input)
    const [pr] = sessionBlock(out, '2026-07-19').prs
    expect(pr).toBe('Chest Press 60 kg × 12 · Weight, 1RM · 720 kg volume · e1RM 84 kg')
    // ONE row per record — the axis list and the values are columns of the
    // same line, so neither can be printed twice.
    expect(sessionBlock(out, '2026-07-19').prs).toHaveLength(1)
    expect(sessionBlock(out, '2026-07-19').counts).toContain('1 PR')
  })

  it('carries steps and recovery signals per day', () => {
    const out = buildWeeklyExport(input)
    expect(dayField(out, '2026-07-19', 'Activity')).toContain('9,200 steps')
    expect(dayField(out, '2026-07-19', 'Vitals')).toContain('HRV 62.0 ms')
    expect(dayField(out, '2026-07-19', 'Vitals')).toContain('RHR 48')
  })

  /**
   * Score and Battery are Onyx's own derived OPINIONS and belong under the
   * fence or nowhere. Apple's active energy is not one of them: it is a
   * measurement, it always rode on the cardio line, and v3 gives it a named
   * `active_kcal` column on every day. What must never appear above the fence
   * is a verdict.
   */
  it('never emits Day Score or Battery, and names what it does compute', () => {
    const out = buildWeeklyExport(input)
    // Score and Battery are Onyx's own OPINION of a day, not arithmetic a
    // reader can audit, and they are exported nowhere.
    expect(out).not.toMatch(/battery/i)
    expect(out).not.toMatch(/\bday score\b/i)
    // Apple's active energy is NOT one of them: it is a measurement, and it
    // sits on the activity row of the day it was measured on.
    expect(dayField(out, '2026-07-19', 'Activity')).toContain('active ')
    // The battery's own inputs are stated per day, on a row that says in words
    // that Onyx computed them. v3 kept a document-level fence; a day-major
    // document carries the marker on the line instead.
    for (const key of ['load', 'ACWR', 'strain z', 'wellness']) {
      expect(Object.keys(derivedOf(out, '2026-07-19')), key).toContain(key)
    }
    expect(out).toContain('**Derived** *(computed by Onyx, not measured)*')
  })

  it('grows no table this week has no grid for', () => {
    const out = buildWeeklyExport(input)
    // v4 allows four tables — the programme ledger, sets by muscle, body
    // composition and the weekly micronutrient average — and each appears only
    // when the week has rows for it. This fixture has no ledger, no body
    // composition and no micros, so the only grid it may grow is the muscle
    // one.
    expect(hasSubsection(out, 'Week over week')).toBe(false)
    expect(hasSubsection(out, 'Body composition')).toBe(false)
    expect(out.split('\n').filter((l) => /^\|[:-]/.test(l))).toHaveLength(1)
    // What is actually banned is Onyx's own opinions — never a measurement,
    // however Apple-shaped.
    expect(out).not.toMatch(/Battery/)
    // Apple's active energy is a measurement and rides on the day it was
    // measured on. This fixture logged none, so the row names it as unmeasured
    // rather than printing a zero.
    expect(notMeasured(out, '2026-07-19', 'Activity')).toContain('active energy')
  })

  /**
   * A day is a SECTION, not a row.
   *
   * v2 made it four grouped lines, then eight; v3 collapsed all eight into one
   * forty-column line and moved the grouping onto a legend. Both were readable
   * only against something else — a header, or a count of dots.
   *
   * v4 gives the day its own heading and one LABELLED row per group, in the
   * order the day happens: the night, what the body reported, the body itself,
   * how it felt, what was eaten, what was taken, what was moved, what it was
   * shaped for, and finally the work. A reader wanting Sunday's protein reads
   * the word "Intake" rather than counting to the twenty-eighth field.
   */
  it('renders each day as labelled rows, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    const all = dayLines(out, '2026-07-19')
    const end = all.findIndex((l) => l.startsWith('### '))
    const rows = all.slice(0, end < 0 ? all.length : end)
      .filter((l) => /^\*\*[A-Z]/.test(l))
      .map((l) => /^\*\*(.+?)\*\*/.exec(l)![1])
    // Asserted as one list, because what is under test is the ORDER and the
    // completeness — nine independent `toContain` calls would pass on a
    // shuffled day.
    expect(rows).toEqual([
      'Sleep', 'Vitals', 'Body', 'Readiness', 'Head',
      'Intake', 'Stack', 'Activity', 'Shape',
    ])
    // The work comes after them, and the day's computed figures close it —
    // below the session, because they are arithmetic over the whole day.
    expect(all.findIndex((l) => l.startsWith('### Session'))).toBe(end)
    const last = all.filter((l) => l.trim() && l !== '---').at(-1)!
    expect(last).toMatch(/^\*Not recorded:|^\*\*Derived\*\*/)
    expect(dayFieldOrNull(out, '2026-07-19', 'Derived')).not.toBeNull()

    expect(dayHeadings(out)[0]).toBe('DAY 1 · Sun · 2026-07-19 · TRAIN — Upper A')
    expect(dayField(out, '2026-07-19', 'Sleep')).toContain('9 h 11 m')
    expect(dayField(out, '2026-07-19', 'Vitals')).toContain('HRV 62.0 ms')
    expect(dayField(out, '2026-07-19', 'Vitals')).toContain('RHR 48')
    const activity = dayField(out, '2026-07-19', 'Activity')
    expect(activity).toContain('9,200 steps')
    expect(activity).toContain('7.10 km')
    expect(activity).toContain('training 68 min')
    const intake = dayField(out, '2026-07-19', 'Intake')
    expect(intake).toContain('1,940 / 1,955 kcal')
    expect(intake).toContain('172 / 170 P')
    expect(intake).toContain('190 C')
    expect(intake).toContain('54 F')
    expect(intake).toContain('water 3.00')
    // The denominator is NOT assumed: this fixture says three were taken and
    // never says how many were asked for, and "3 of 3" would be an invented
    // claim of perfect adherence.
    expect(dayField(out, '2026-07-19', 'Stack')).toBe(`3 taken — **taken** no per-item log — **skipped** none logged`)
    expect(dayField(out, '2026-07-19', 'Body')).toContain('65.3 kg')
    // A training day asks the training questions; every unanswered slot says
    // so, and the slot is NAMED so a rest day's triple cannot be confused
    // with it.
    expect(readiness(out, '2026-07-19').fatigue)
      .toBe(`waking ${NO_DATA} · before training ${NO_DATA} · after training ${NO_DATA}`)
    // Apple's stand ring is two numbers rather than one `12h58` token: the
    // composite assumed minutes-WITHIN-the-hour, and a caller handing it a
    // day's total minutes produced a cell nothing could parse. Absent here, so
    // the row names it as unmeasured rather than printing a malformed one.
    expect(activity).not.toMatch(/stand \d+h\d+/)
    // One section per day, and the whole day is inside it.
    expect(dayDates(out)).toEqual(['2026-07-19', '2026-07-20'])
  })

  // A blank weight can mean "not weighed", "the sync dropped it", or "skipped on
  // purpose" — and only the last is safe to leave out of a trend.
  it('states WHY a weigh-in is missing, defaulting to the protocol reason', () => {
    // No reason stored → "As Planned", not "no reason recorded". Skipping the
    // scale before a bowel movement IS the protocol, and reporting it as a
    // logging gap reads a deliberate week as a sloppy one.
    const out = buildWeeklyExport(input)
    expect(dayField(out, '2026-07-20', 'Body')).toBe('no weigh-in — As Planned')

    const withReason = buildWeeklyExport({
      ...input,
      days: input.days.map((d) => (d.date === '2026-07-20' ? { ...d, weighInSkipReason: 'Travel' } : d)),
    })
    // Read DYNAMICALLY off the day — change the reason and the export follows.
    expect(dayField(withReason, '2026-07-20', 'Body')).toBe('no weigh-in — Travel')
    expect(withReason).not.toMatch(/As Planned/)
    // A day that WAS weighed never carries a skip marker.
    expect(dayField(withReason, '2026-07-19', 'Body')).not.toMatch(/no weigh-in/)
  })

  it('tags a declared exception on the intake it explains, and changes no total', () => {
    const dateNight = input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210, nutritionException: 'Event' } : d))
    const raw = buildWeeklyExport({ ...input, days: input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210 } : d)) })
    const tagged = buildWeeklyExport({ ...input, days: dateNight })

    // The tag rides the day the intake was eaten on, on its `Shape` row — and
    // the intake itself is stated in full, undiscounted.
    expect(dayField(tagged, '2026-07-19', 'Intake')).toContain('3,210 / 1,955 kcal')
    expect(shape(tagged, '2026-07-19')).toEqual(['Event — excepted from grading'])
    // An ordinary day is never annotated with one.
    expect(shape(tagged, '2026-07-20')).not.toContain('Event — excepted from grading')

    // A PR set on a declared day is still a PR, printed exactly as any other:
    // "he hit a record on the night out" is the interesting fact, and the day's
    // own tag is what says which Sunday it was.
    expect(sessionBlock(tagged, '2026-07-19').prs)
      .toEqual(sessionBlock(raw, '2026-07-19').prs)

    // THE INVARIANT: forgiving the grade must not move a single aggregate. The
    // ONLY difference between these two documents is the one clause.
    expect(tagged.replace('**Shape** Event — excepted from grading', '**Shape** standard day'))
      .toBe(raw)
  })

  it('names WHICH axis each PR was set on, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(sessionBlock(out, '2026-07-19').prs[0]).toContain('Weight, 1RM')

    // A movement with no ledger row still lists — without inventing an axis.
    const noAxes = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, prs: s.prs.map((p) => ({ ...p, axes: [] })) })),
    })
    const [pr] = sessionBlock(noAxes, '2026-07-19').prs
    // No axis to name, so the line states the lift and its figures and stops —
    // rather than printing an empty slot a reader has to interpret.
    expect(pr).toBe('Chest Press 60 kg × 12 · 720 kg volume · e1RM 84 kg')
  })

  // Volume is a sum of quarter-kg microloads; 0 dp made the export disagree with
  // the Session Report about the same session.
  it('prints session volume at full precision, never rounded to a whole kg', () => {
    const precise = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8329.25 })),
    })
    expect(sessionBlock(precise, '2026-07-19').counts).toContain('8,329.25 kg tonnage')
    expect(weekTotals(precise).tonnageKg).toBe(8329.25)
    // A whole number stays whole — no cosmetic ".00".
    const whole = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8240 })),
    })
    expect(sessionBlock(whole, '2026-07-19').counts).toContain('8,240 kg tonnage')
    expect(weekTotals(whole).tonnageKg).toBe(8240)
  })

  it('renders ONE chronological supplements list, only when supplied', () => {
    expect(headings(buildWeeklyExport(input))).not.toContain('## SUPPS')
    const withProtocol = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '3 g' },
        { time: '10:30', name: 'Vitamin D3 + K2', dose: '125 mcg' },
      ],
    })
    expect(hasSubsection(withProtocol, 'The stack')).toBe(true)
    // The stack is nearly identical on both kinds of day. Two headed lists
    // duplicated a dozen identical lines to express one differing dose; v3 has
    // one row per item, with the training/rest split as two of its columns.
    expect(withProtocol).not.toMatch(/Training days/)
    expect(withProtocol).not.toMatch(/Rest days/)
    // One line per item, with the training/rest split stated as the rule it is
    // rather than as two columns a reader has to reconcile.
    expect(stackProtocol(withProtocol).every((r) => r.time && r.name && r.dose)).toBe(true)
    // Chronological, so the list is read in the order the day happens in.
    expect(stackProtocol(withProtocol).map((r) => r.name))
      .toEqual(['Vitamin D3 + K2', 'L-Citrulline'])
    expect(stackProtocol(withProtocol).find((r) => r.time === '11:45')!.dose).toBe('3 g')
  })

  it('prints the dose it is GIVEN, with nothing memorised about any supplement', () => {
    // The regression this whole change exists for: the renderer used to hold a
    // verbatim multivitamin line and a /citrulline|caffeine/i regex, so a dose
    // corrected in the app still exported as the constant in this file.
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '6 g', trainingOnly: true },
        { time: '10:30', name: 'Two Per Day Multivitamin', dose: '1 tab' },
      ],
    })
    const cit = stackProtocol(out).find((r) => r.name === 'L-Citrulline')!
    expect(cit.dose).toBe('6 g')
    expect(cit.trainingOnly).toBe(true)
    expect(out).not.toMatch(/3 g/)
    // No asserted multivitamin sentence any more — every field comes from the
    // row, and a row that says nothing extra says nothing rather than a rule.
    const mv = stackProtocol(out).find((r) => r.name === 'Two Per Day Multivitamin')!
    expect(mv).toEqual({
      time: '10:30', name: 'Two Per Day Multivitamin', dose: '1 tab',
      trainingOnly: false, notes: null,
    })
  })

  it('carries a rule from the row’s notes, verbatim', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '09:00', name: 'Two Per Day Multivitamin', dose: '1 tab', notes: '2 tabs on Monday & Friday (Leg Days)' },
        { time: '15:00', name: 'Creatine Monohydrate', dose: '5 g' },
      ],
    })
    const byTime = (t: string) => stackProtocol(out).find((r) => r.time === t)!
    expect(byTime('09:00').notes).toBe('2 tabs on Monday & Friday (Leg Days)')
    // A supplement with no rule gets no invented one.
    expect(byTime('15:00').notes).toBeNull()
    expect(byTime('15:00').dose).toBe('5 g')
  })

  it('states a split dose as the rule it is, rather than picking a column', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '09:00', name: 'Multivitamin', dose: '1 tab', trainingDose: '2 tabs', restDose: '1 tab' },
      ],
    })
    // A dose that differs by day is stated as the RULE it is, rather than
    // arbitrarily picking one of the two figures.
    const mv = stackProtocol(out).find((r) => r.time === '09:00')!
    expect(mv.dose).toBe('2 tabs on training days / 1 tab on rest days')
    expect(subsectionLines(out, 'The stack').join('\n').match(/Multivitamin/g)).toHaveLength(1)
  })

  it('marks a training-only item as one, and nothing else', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '6 g', trainingOnly: true },
        { time: '11:45', name: 'Nutricost Caffeine', dose: '200 mg', trainingOnly: true },
        { time: '15:00', name: 'Creatine Monohydrate', dose: '5 g' },
      ],
    })
    // Creatine is taken every day; tagging it would state a rule that isn't one.
    expect(stackProtocol(out).find((r) => r.time === '15:00')!.trainingOnly).toBe(false)
    expect(stackProtocol(out).filter((r) => r.trainingOnly)).toHaveLength(2)
  })

  it('deduplicates by supplement, so one row can never print twice', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '08:00', name: 'Creatine', dose: '5 g' },
        { time: '08:00', name: 'creatine', dose: '5 g' },
        { time: '11:45', name: 'L-Citrulline', dose: '6 g' },
      ],
    })
    expect(subsectionLines(out, 'The stack').join('\n').match(/reatine/g)).toHaveLength(1)
    expect(stackProtocol(out).find((r) => r.time === '11:45')!.name).toBe('L-Citrulline')
  })

  // Warm-ups used to be filtered out upstream, so the export read as if every
  // session started at its top load.
  it('emits warm-up sets, tagged, without merging them into the working group', () => {
    const out = buildWeeklyExport({
      ...input,
      sessions: [{
        ...input.sessions[0],
        exercises: [{
          name: 'Leg Press', topKg: 70, repWindow: '8-12',
          sets: [
            { weightKg: 40, reps: 10, rpe: null, side: null, failure: false, warmup: true, pairId: null },
            { weightKg: 70, reps: 12, rpe: null, side: null, failure: false, pairId: null },
          ],
        }],
      }],
    })
    // Flagged rather than numbered — `W` takes no set number, and the working
    // set beside it keeps the `S1` the warm-up would otherwise have consumed.
    expect(setsOf(out, '2026-07-19', 'Leg Press'))
      .toEqual(['`W` 40 kg × 10 — warm-up', '`S1` 70 kg × 12'])
  })

  it('states a missing session effort rather than omitting the segment', () => {
    const out = buildWeeklyExport({
      ...input,
      sessions: [{ ...input.sessions[0], sessionRpe: null }],
    })
    // "not reported" is a claim about the LOG; a 0 would be a claim about how
    // hard the session was, and they are different facts.
    expect(sessionBlock(out, '2026-07-19').meta).toContain('sRPE not reported')
  })

  it('includes soreness', () => {
    expect(readiness(buildWeeklyExport(input), '2026-07-20').doms).toBe('Quads 2')
  })

  // The old free-floating "vs previous week" prose block stays gone — the
  // comparison now lives in ONE place, the closing trends table, and a second
  // rendering of the same six numbers is how two surfaces start disagreeing.
  it('emits no loose "vs previous week" block', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/vs previous week/i)
  })
})

/**
 * The four week-level facts that are NOT a sum of the daily lines. The export
 * refuses derived aggregates on principle; these earn their place because
 * reconstructing them by hand costs the reader real work.
 */
describe('weeklySummary', () => {
  const sumDay = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })
  const day = sumDay

  it('averages only the days that HAVE a reading', () => {
    // Four nights of sleep is a 7.2h average over four nights, not 4.1h over
    // seven. Counting a missing night as zero is the classic version of this bug.
    const s = weeklySummary(base({
      days: [day({ sleepMin: 420 }), day({ sleepMin: 480 }), day({ sleepMin: null })],
    }))
    expect(s.avgSleepMin).toBe(450)
  })

  it('returns null, never 0, when nothing was recorded', () => {
    const s = weeklySummary(base({ days: [day({}), day({})] }))
    expect(s.avgSleepMin).toBeNull()
    expect(s.avgRestingHr).toBeNull()
    expect(s.avgHrvMs).toBeNull()
    expect(s.cardioMinutes).toBeNull()
  })

  it('totals cardio duration and active calories across the week', () => {
    const s = weeklySummary(base({
      cardio: [
        { date: '2026-07-19', kind: 'walk', distanceM: 3000, durationMin: 30, kcal: 150, totalKcal: null, avgHr: null, effort: null, startedAt: null, elevationM: null, source: 'manual' },
        { date: '2026-07-21', kind: 'run', distanceM: 5000, durationMin: 25, kcal: 320, totalKcal: null, avgHr: null, effort: null, startedAt: null, elevationM: null, source: 'manual' },
      ],
    }))
    expect(s.cardioMinutes).toBe(55)
    expect(s.cardioActiveKcal).toBe(470)
    expect(s.cardioSessions).toBe(2)
  })

  it('reports the single worst DOMS reading of the week', () => {
    const s = weeklySummary(base({
      doms: [
        { date: '2026-07-19', muscle: 'Chest', severity: 1 },
        { date: '2026-07-21', muscle: 'Quads', severity: 3 },
        { date: '2026-07-22', muscle: 'Glutes', severity: 2 },
      ],
    }))
    expect(s.peakDoms).toEqual({ muscle: 'Quads', severity: 3, date: '2026-07-21' })
  })

  it('keeps the FIRST day a peak was reached when two tie', () => {
    const s = weeklySummary(base({
      doms: [
        { date: '2026-07-21', muscle: 'Quads', severity: 3 },
        { date: '2026-07-22', muscle: 'Calves', severity: 3 },
      ],
    }))
    expect(s.peakDoms?.date).toBe('2026-07-21')
  })

  it('ignores severity-0 rows — "rated, not sore" is not soreness', () => {
    const s = weeklySummary(base({ doms: [{ date: '2026-07-19', muscle: 'Chest', severity: 0 }] }))
    expect(s.peakDoms).toBeNull()
  })

  /**
   * v2 opened with a `## Weekly summary` block, above the daily log, whose four
   * lines included the week's worst soreness reading. v3 has no summary block:
   * the week's sums live in `## WEEK`, BELOW the evidence they are drawn from,
   * and the peak DOMS figure is computed but not rendered anywhere. What the
   * document shows instead is every day's own reading, which is strictly more
   * than the peak was.
   */
  it('prints the summary above the daily log, and says so when nothing is sore', () => {
    const in_ = base({ days: [day({ sleepMin: 450 })] })
    const out = buildWeeklyExport(in_)
    // Nothing sore, and the day says "none" rather than going silent.
    expect(weeklySummary(in_).peakDoms).toBeNull()
    expect(dayDates(out).every((d) => readiness(out, d).doms === NONE)).toBe(true)
    // The aggregates sit ABOVE the days now, which is the one ordering rule v4
    // inverts: a reader opening a weekly report wants the week, and can scroll
    // for a Tuesday.
    expect(out.indexOf('## THE WEEK')).toBeLessThan(out.indexOf('## DAY 1'))
  })

  it('names the worst muscle in the printed line', () => {
    const in_ = base({
      days: [day({})],
      doms: [{ date: '2026-07-21', muscle: 'Quads', severity: 3 }],
    })
    // The peak is still computed for whoever wants it…
    expect(weeklySummary(in_).peakDoms)
      .toEqual({ muscle: 'Quads', severity: 3, date: '2026-07-21' })
    // …and the document names the muscle, the severity AND the day it was felt
    // on, which is what the single "worst" line could never say.
    const out = buildWeeklyExport({ ...in_, days: [day({ date: '2026-07-21' })] })
    expect(readiness(out, '2026-07-21').doms).toBe('Quads 3')
  })
})

/**
 * The closing CUMULATIVE LEDGER — one row per week, oldest first. Deliberately
 * the ONE table in a file whose whole design rule is "no tables": a programme's
 * trajectory is a column read downwards, which is exactly what a table is for.
 */
describe('week-over-week ledger', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (volumeKg: number | null): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [],
  })
  const walk = (durationMin: number | null): ExportCardio => ({
    date: '2026-07-19', kind: 'walk', distanceM: null, durationMin,
    kcal: null, totalKcal: null, avgHr: null, effort: null,
    startedAt: null, elevationM: null, source: 'manual',
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-08-02', weekEnd: '2026-08-08', weekLabel: 'Week 3',
    programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })
  /** A ledger row from one week's worth of days/sessions/cardio. */
  const week = (
    label: string, weekStart: string,
    days: ExportDay[] = [], sessions: ExportSession[] = [], cardio: ExportCardio[] = [],
  ): LedgerWeek => ({ label, weekStart, totals: trendTotals(days, sessions, cardio) })

  describe('trendTotals', () => {
    it('averages only the days that HAVE a reading, and totals the work', () => {
      const t = trendTotals(
        [day({ calories: 1800, steps: 9000, weightKg: 64.2, waterMl: 3000 }),
          day({ calories: 2000, steps: null, weightKg: null, waterMl: 2000 }),
          day({})],
        [session(8000), session(4000)],
        [walk(30), walk(20)],
      )
      // Two logged intakes → their mean. The third day is unknown, not 0 kcal.
      expect(t.avgKcal).toBe(1900)
      expect(t.avgSteps).toBe(9000)
      expect(t.avgWeightKg).toBe(64.2)
      expect(t.avgWaterMl).toBe(2500)
      // Volume and cardio minutes are work that happened — honest sums.
      expect(t.totalVolumeKg).toBe(12000)
      expect(t.cardioMinutes).toBe(50)
    })

    it('returns null rather than 0 when a measure was never recorded', () => {
      const t = trendTotals([day({}), day({})], [], [])
      expect(t.avgKcal).toBeNull()
      expect(t.avgWeightKg).toBeNull()
      expect(t.totalVolumeKg).toBeNull()
      expect(t.cardioMinutes).toBeNull()
    })
  })

  it('is skipped entirely when there is no ledger to print', () => {
    expect(headings(buildWeeklyExport(base({ days: [day({ calories: 1800 })] }))))
      .not.toContain('## LEDGER')
  })

  it('heads the block with the program and the app’s own week number', () => {
    const out = buildWeeklyExport(base({
      ledger: [week('Week 2', '2026-07-26'), week('Week 3', '2026-08-02')],
    }))
    // The programme and the week number identify the DOCUMENT, so they are
    // stated once on the header rather than again over the table.
    expect(title(out)).toBe('# ONYX · WEEK 3')
    expect(metaCells(out)[1]).toBe('Helix Cut')
    expect(hasSubsection(out, 'Week over week')).toBe(true)
  })

  /**
   * THE POINT OF THE PIVOT. Two columns answer "what changed since Sunday";
   * a programme is a trajectory, and every week has to be on it.
   */
  it('gives EVERY week its own row, oldest first', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 0', '2026-07-12', [day({ calories: 2100 })]),
        week('Week 1', '2026-07-19', [day({ calories: 2000 })]),
        week('Week 2', '2026-07-26', [day({ calories: 1900 })]),
        week('Week 3', '2026-08-02', [day({ calories: 1800 })]),
      ],
    }))
    const rows = out.split('\n').filter((l) => l.startsWith('|'))
    // Header, alignment rule, four weeks.
    expect(rows).toHaveLength(6)
    expect(rows[2]).toMatch(/^\| Week 0 /)
    expect(rows[5]).toMatch(/^\| Week 3 /)
    // Chronological, not reverse — the trend is read downwards.
    expect(out.indexOf('| Week 0')).toBeLessThan(out.indexOf('| Week 3'))
  })

  it('closes the week block — the trend is read after the totals', () => {
    const out = buildWeeklyExport(base({
      sessions: [session(8000)],
      ledger: [week('Week 3', '2026-08-02')],
    }))
    // v3 put the ledger below every measurement. v4 keeps it inside `## THE
    // WEEK`, after the totals it compares against and before the days — a
    // programme's trajectory belongs with the week's own numbers, and a reader
    // who wants a Tuesday scrolls past both.
    expect(out.indexOf('**Training**')).toBeLessThan(out.indexOf('### Week over week'))
    expect(out.indexOf('### Week over week')).toBeLessThan(out.indexOf('## LEGEND'))
  })

  it('carries one column per metric', () => {
    const out = buildWeeklyExport(base({
      ledger: [week('Week 3', '2026-08-02',
        [day({ calories: 1800, steps: 9000, weightKg: 64.0, waterMl: 3000 })],
        [session(8000)], [walk(30)])],
    }))
    for (const c of ['Week', 'Kcal/day', 'Volume kg', 'Steps/day', 'Cardio min', 'Water L/day', 'Weight kg']) {
      expect(out).toContain(c)
    }
    expect(out).toMatch(/\| +1800 \| +8000 \| +9000 \| +30 \| +3\.00 \| +64\.0 \|/)
  })

  /**
   * ONE delta column, on bodyweight. A delta beside every metric doubles the
   * table and buries the series in its own first differences — the trajectory
   * IS the table now.
   */
  it('quotes the bodyweight delta against the row above, to two places', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 65.0 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64.55 })]),
      ],
    }))
    // A true minus sign, not a hyphen. 0.45 must not round to 0.5 — a third of
    // the week's whole loss.
    expect(out).toMatch(/−0\.45/)
    // The first row has nothing above it, so it has no delta. (`| Week ` alone
    // would also catch the header, whose own first cell is the word "Week".)
    const rows = out.split('\n').filter((l) => /^\| Week \d/.test(l))
    expect(rows[0]).toMatch(/\| +— \| — \|$/)
  })

  it('prints a flat week as 0.00, never as a blank', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 64.2 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64.2 })]),
      ],
    }))
    expect(out).toMatch(/0\.00/)
    expect(out).toMatch(/→/)
  })

  it('leaves a cell blank when the measure was never recorded — never 0', () => {
    const out = buildWeeklyExport(base({ ledger: [week('Week 3', '2026-08-02', [day({})])] }))
    const row = out.split('\n').find((l) => l.startsWith('| Week 3'))!
    expect(row).not.toMatch(/\b0\b/)
    expect(row).toMatch(/—/)
  })

  /**
   * DIRECTION, NOT VERDICT. Whether falling weight is progress or a problem
   * depends on the phase; this file exports raw data and lets the reader judge.
   */
  it('uses neutral arrows and never labels a move good or bad', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 65 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64 })]),
      ],
    }))
    expect(out).toMatch(/↓/)
    expect(out).not.toMatch(/\b(good|bad|on track|great)\b/i)
  })

  it('lays the table out so the RAW markdown lines up too', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ calories: 1900, weightKg: 65 })]),
        week('Week 3', '2026-08-02', [day({ calories: 1800, weightKg: 64 })]),
      ],
    }))
    const rows = out.split('\n').filter((l) => l.startsWith('|'))
    // Every row is the same width — the padding's whole job. Arrows and minus
    // signs are single code points, so they must not skew it.
    expect(new Set(rows.map((r) => [...r].length)).size).toBe(1)
    // The week name left, numbers right — the alignment row says so.
    expect(rows[1]).toMatch(/^\|:-+-\|-+:\|/)
  })
})

/**
 * The weekly aggregates, the appended previous week and the provenance note —
 * the three things added so a model reading the payload does not have to
 * recompute the week or guess how good the instrument was.
 */
describe('weekly aggregates · previous-week reference · disclaimer', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (o: Partial<ExportSession> = {}): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg: 1000, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [], ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })

  // ── Tonnage per muscle ──
  it('breaks the week down by muscle group in kilograms', () => {
    const out = buildWeeklyExport(base({
      sessions: [session({ volumeKg: 3571.25 })],
      tonnageByMuscle: [{ muscle: 'Quads', volumeKg: 22000 }, { muscle: 'Chest', volumeKg: 15000 }],
    }))
    // v2 split the two units into sections six headings apart — sets under
    // "Sets Targets", kilograms under "Volume by muscle group" — which asked
    // the reader to hold one to compare it with the other. They are the same
    // question about the same muscle, so v3 puts them on ONE row.
    expect(hasSubsection(out, 'Sets by muscle')).toBe(true)
    expect(table(out, 'Sets by muscle').columns)
      .toEqual(['Muscle', 'Sets', 'Target', 'Δ', 'Direct', 'Indirect', 'Tonnage kg'])
    expect(muscleRow(out, 'Quads')['Tonnage kg']).toBe('22,000')
    expect(muscleRow(out, 'Chest')['Tonnage kg']).toBe('15,000')
    // It sits with the rest of the week's aggregates, above the days.
    expect(out.indexOf('**Training**')).toBeLessThan(out.indexOf('### Sets by muscle'))
  })

  it('prints the week total at full precision, matching the Session page', () => {
    // 3571.25 is the Aug 5 session exactly. `n()` would have rounded it to 3571
    // and the export would disagree with the screen about the same workout.
    const out = buildWeeklyExport(base({ sessions: [session({ volumeKg: 3571.25 })] }))
    expect(weekTotals(out).tonnageKg).toBe(3571.25)
    expect(weekTotals(out).sessions).toBe(1)
  })

  it('warns that per-muscle rows deliberately over-sum', () => {
    const out = buildWeeklyExport(base({
      sessions: [session()],
      tonnageByMuscle: [{ muscle: 'Quads', volumeKg: 900 }, { muscle: 'Glutes', volumeKg: 900 }],
    }))
    // v2 printed the caveat as a sentence. v3 states no caveats it can show
    // instead: the two rows total 1800 against a week's 1000, and they sit
    // directly under the total, so the over-sum is visible rather than warned
    // about. One set credits every muscle it trains, which is the whole reason.
    const perMuscle = table(out, 'Sets by muscle').rows
      .reduce((n, r) => n + Number(r[6].replace(/,/g, '')), 0)
    expect(perMuscle).toBe(1800)
    expect(weekTotals(out).tonnageKg).toBe(1000)
    expect(perMuscle).toBeGreaterThan(weekTotals(out).tonnageKg!)
    // The week's own total is stated above the table, so the over-sum is
    // visible rather than warned about — and the legend says why.
    expect(out.indexOf('**Training**')).toBeLessThan(out.indexOf('### Sets by muscle'))
    expect(legendText(out)).toContain('does NOT sum to the week')
  })

  // ── Energy balance ──
  it('estimates the weekly deficit from BMR + active + TEF vs intake', () => {
    // 1900 in; out = 1500 BMR + 600 active + 199.5 TEF = 2299.5. Twice.
    const days = [
      day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
    ]
    const out = buildWeeklyExport(base({ days }))
    const balance = energy(out)
    // The SIGN is the word: negative is a deficit, and the figure is never
    // restated as an absolute value beside a shouted noun.
    expect(balance.balanceKcal).toBe(-799)
    expect(balance.perDayKcal).toBe(-399)
    expect(balance.daysCounted).toBe(2)
    expect(balance.tdeeAvg).toBe(2300)       // 4599 kcal out over the two days
    // Each term of that 2300 is stated beside it, so the estimate can be
    // audited rather than taken: 1500 + 600 + 199.5.
    expect([balance.bmrAvg, balance.activeAvg, balance.tefAvg])
      .toEqual([1500, 600, 200])
    // The intake side is a MEASUREMENT and stays above the fence.
    expect(weekTotals(out).kcalAvg).toBe(1900)
  })

  it('names TEF in the breakdown, and states the rate it used', () => {
    // The whole point of the term is that it is visible. A TDEE that silently
    // grew by 200 kcal/day would look like a data error, not a correction.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 2000, bmrKcal: 1500, activeKcal: 600 })],
    }))
    // 1500 + 600 + 210 = 2310, stated per day under the fence and averaged on
    // the `## WEEK` row — the two must be the same arithmetic.
    expect(derivedOf(out, '2026-07-19').TDEE).toBe('2,310 kcal')
    expect(energy(out).tdeeAvg).toBe(2310)
    // The term has its own column, so it can never be folded invisibly into
    // the total…
    expect(energy(out).tefAvg).toBe(210)
    // …and it is NAMED, with the rate it used, so a TDEE that silently grew by
    // 200 kcal/day reads as a correction rather than a data error.
    expect(legendText(out)).toContain('intake × 0.105')
  })

  it('counts no TEF on a day with no intake — that day is not counted at all', () => {
    // TEF rides on the intake, so it can never be carried across a gap the way
    // BMR is. A day with no food logged has no thermic effect to add, and is
    // already excluded for having no intake side.
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 2000, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: null, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(energy(out).daysCounted).toBe(1)
    expect(energy(out).excluded).toEqual(['2026-07-20'])
    expect(energy(out).tdeeAvg).toBe(2310)
    // 210, not 315: the TEF is the counted day's own, never the week's.
    expect(energy(out).tefAvg).toBe(210)
    // The uncounted day still has a tdee of its own — BMR and active energy
    // are both there — but no TEF to add, and no intake to balance it against.
    expect(derivedOf(out, '2026-07-19').TDEE).toBe('2,310 kcal')
    // …and that day's computed row is dropped entirely rather than printing a
    // column of gaps: it is named in the day's own closing line instead.
    expect(derivedOf(out, '2026-07-20').TDEE).toBeUndefined()
    expect(notRecorded(out, '2026-07-20')).toContain('derived figures')
  })

  it('names a surplus a surplus', () => {
    // 3000 in; out = 1500 + 500 + 315 TEF = 2315.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 3000, bmrKcal: 1500, activeKcal: 500 })],
    }))
    // A surplus is a POSITIVE balance. The same column says both, which is why
    // the sign can never disagree with the noun.
    expect(energy(out).balanceKcal).toBe(685)
    expect(energy(out).perDayKcal).toBe(685)
  })

  it('carries BMR across the days the scale was skipped, and says so', () => {
    // BMR is a scale reading — three weigh-ins in a week is normal. Dropping the
    // other four would discard the week; zeroing them would invent a surplus.
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: null, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(energy(out).daysCounted).toBe(2)   // the un-weighed day counts
    expect(energy(out).excluded).toEqual([])
    // …and it SAYS SO in its own column, rather than leaving the reader to
    // notice that a day with no scale reading was counted anyway.
    expect(energy(out).bmrCarried).toBe(true)
    // A week where every day was weighed says 0, so the flag means something.
    const weighed = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(energy(weighed).bmrCarried).toBe(false)
    // And the document states the rule on the line that explains tdee.
    expect(legendText(out)).toContain('BMR (from the scale, carried across gaps)')
  })

  it('counts only days holding BOTH an intake and an expenditure', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: null, activeKcal: null }),
        day({ date: '2026-07-21', calories: null, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    // Day 2 inherits a BMR but has no active energy; day 3 logged no food.
    expect(energy(out).daysCounted).toBe(1)
    expect(energy(out).excluded).toEqual(['2026-07-20', '2026-07-21'])
  })

  it('skips the balance entirely rather than reporting half a week as zero', () => {
    const out = buildWeeklyExport(base({ days: [day({ calories: 1900 })] }))
    // No expenditure side at all, so the cell is `—` rather than 0 — and the
    // day it could not use is named.
    const balance = energy(out)
    expect(balance.stated).toBe(false)
    expect(weekField(out, 'Energy balance'))
      .toBe(`${NO_DATA} — no day carried both an intake and an expenditure.`)
    expect(balance.balanceKcal).toBeNull()
    expect(balance.tdeeAvg).toBeNull()
  })

  it('flags the balance as an estimate wherever it appears', () => {
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1900, bmrKcal: 1500, activeKcal: 600 })],
    }))
    // The expenditure the balance is struck against is Onyx's own arithmetic
    // over three estimates, so the WHOLE balance is labelled as computed. v3
    // put it below a document-level fence; a day-major document has none, so
    // the marker travels with the figure instead.
    expect(weekField(out, 'Energy balance')).toContain('*computed by Onyx, an estimate*')
    // …and the line under it names every term.
    const terms = sectionLines(out, 'THE WEEK').find((l) => l.startsWith('TDEE '))!
    expect(terms).toContain('BMR')
    expect(terms).toContain('Apple Watch active')
    expect(terms).toContain('TEF')
    expect(legendText(out)).toContain('tdee = BMR')
    expect(out).toContain('sourced from the Apple Watch')
    // The averaged figure is that same tdee, so a reader who checks one
    // against the other cannot find two numbers.
    expect(energy(out).tdeeAvg).toBe(2300)
    expect(derivedOf(out, '2026-07-19').TDEE).toBe('2,300 kcal')
  })

  // ── Steps ──
  it('averages steps over every day that logged a count, cardio or not', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', steps: 10000 }),
        day({ date: '2026-07-20', steps: 12000 }),
        day({ date: '2026-07-21', steps: null }),
      ],
      // No cardio logged all week — it must not gate the step average.
      cardio: [],
    }))
    // The mean SKIPS the day with no count rather than averaging it in as 0,
    // and no cardio row is needed to make a step count real.
    expect(weekTotals(out).stepsAvg).toBe(11000)
    expect(weekField(out, 'Cardio')).toBe(NONE)
    const [a, b, c] = dayDates(out)
    expect(dayField(out, a, 'Activity')).toContain('10,000 steps')
    expect(dayField(out, b, 'Activity')).toContain('12,000 steps')
    expect(notRecorded(out, c)).toContain('activity')
  })

  // ── The week NAMES ITSELF, or says WEEK — never "Week undefined" ──
  //
  // The three closing notes this block used to pin — the prior-report pointer,
  // the Epley caveat and the Apple Watch caveat — were retired with v2. The two
  // that qualify a printed number now ride on the legend of the section that
  // prints it, and that move is pinned once, in `export-layout.test.ts`.
  it('falls back to unnumbered wording rather than printing "Week undefined"', () => {
    expect(title(buildWeeklyExport(base({ weekLabel: 'Week 5' }))))
      .toBe('# ONYX · WEEK 5')
    const out = buildWeeklyExport(base())
    expect(title(out)).toBe('# ONYX · WEEK')
    expect(out).not.toMatch(/undefined/)
    // A label of pure whitespace is a missing label, not a name.
    expect(title(buildWeeklyExport(base({ weekLabel: '  ' })))).toBe('# ONYX · WEEK')
  })

  it('does not carry a second week of line-by-line data by default', () => {
    const out = buildWeeklyExport(base({ sessions: [session()] }))
    expect(out).not.toMatch(/PREVIOUS WEEK REFERENCE/)
  })

  it('has no second-week block at all — the field is gone, not merely unset', () => {
    // `previousWeekMarkdown` was deprecated on 2026-08-19 when the export
    // dropped to ONE week, and nothing has passed it since. The render branch
    // outlived the caller by three months; it is deleted here so the document
    // has exactly one shape.
    expect(buildWeeklyExport(base({ sessions: [session()] })))
      .not.toMatch(/PREVIOUS WEEK REFERENCE/)
  })

  // ── Swap-day attribution in the daily log ──
  it('calls a day with a logged session a training day, whatever the template says', () => {
    const out = buildWeeklyExport(base({
      // Wednesday: a scheduled rest day that received the swapped workout.
      days: [day({ date: '2026-08-05', weekdayLabel: 'Wed', isTrainingDay: false })],
      sessions: [session({ date: '2026-08-05', label: 'Delts & Arms' })],
    }))
    // v2 relabelled the day "Workout (off-plan / swapped)". The heading reports
    // the PLAN and nothing else, and the swap is visible structurally: a
    // session sits inside a day the template called a rest day.
    expect(trained(out, '2026-08-05')).toBe(false)
    const swapped = sessionBlock(out, '2026-08-05')
    expect(swapped.heading).toContain('Delts & Arms')
    expect(dayHeadings(out).find((h) => h.includes('2026-08-05'))).toContain('· Wed ·')
    // The work is attributed to the day it happened on, which is the fact the
    // relabelling existed to carry.
    expect(weekSessions(out).map((x) => x.date)).toEqual(['2026-08-05'])
  })

  it('leaves an ordinary training day unmarked', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-07-20', weekdayLabel: 'Mon', isTrainingDay: true })],
      sessions: [session({ date: '2026-07-20', label: 'Legs & Core A' })],
    }))
    expect(trained(out, '2026-07-20')).toBe(true)
    expect(sessionBlock(out, '2026-07-20').heading).toContain('Legs & Core A')
    expect(out).not.toMatch(/off-plan/)
  })

  it('keeps calling an unworked rest day a rest day', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-04', weekdayLabel: 'Tue', isTrainingDay: false })],
    }))
    // One word on the heading, and it is a FACT about the day rather than a
    // verdict on it: v2 used to read "Rest · rest", the word twice.
    expect(trained(out, '2026-08-04')).toBe(false)
    expect(dayHeadings(out)[0]).toContain('· REST')
    expect(weekSessions(out)).toHaveLength(0)
    // Scoped to the day block itself: "rest" is a legend word elsewhere and is
    // not a verdict about a day.
    expect(dayLines(out, '2026-08-04').join('|')).not.toMatch(/rest/i)
  })
})

/**
 * The InBody / Mass suppression, the effort line and the daily-shape
 * sparklines — everything added 2026-08-06 so the export neither prints a
 * fragment as a reading nor makes the reader rebuild a week's shape by hand.
 */
describe('body rows, effort and sparklines', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (o: Partial<ExportSession> = {}): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg: 1000, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [], ...o,
  })
  const body = (o: Partial<ExportBodyComp>): ExportBodyComp => ({
    date: '2026-07-19', weightKg: null, bmi: null, bodyFatPct: null, musclePercent: null,
    waterPercent: null, visceralFat: null, bmr: null, boneMineral: null,
    muscleMassKg: null, fatFreeMassKg: null, fatMassKg: null, proteinMassKg: null,
    boneMineralKg: null, waterMassKg: null, skeletalMuscleMassKg: null,
    estimatedWaistToHipRatio: null, ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-08-02', weekEnd: '2026-08-08', weekLabel: 'Week 3',
    programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })

  // ── §1 · no weight, no reading ──
  it('suppresses InBody/Mass for a body row that has lost its weight', () => {
    // 2026-08-02 live: a skeletal-muscle figure and a waist:hip ratio, no
    // weight. Every mass is derived from a bodyweight, so the rest of the row
    // is a fragment — and in v2 it printed as two lines of twenty em-dashes,
    // which is why they were suppressed wholesale.
    //
    // v3 does not suppress it, because it no longer costs two lines: the row is
    // ONE line, the two real readings are in their own columns, and every
    // compartment that cannot be computed answers `—`, which is this document's
    // word for exactly that. Nothing is invented and nothing is hidden.
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-02', weekdayLabel: 'Sun' })],
      bodyComp: [body({ date: '2026-08-02', skeletalMuscleMassKg: 26.8, estimatedWaistToHipRatio: 0.8 })],
    }))
    expect(table(out, 'Body composition').rows).toHaveLength(1)
    const row = bodyRow(out, '2026-08-02')
    expect([row.SMM, row.WHR]).toEqual(['26.8', '0.80'])
    for (const k of ['Weight', 'Fat %', 'Fat kg', 'Muscle kg', 'FFM']) {
      expect(row[k], `${k} without a weight`).toBe('—')
    }
    // The day still tells the whole truth about the day: what it DID measure,
    // and why there was no weigh-in.
    expect(dayField(out, '2026-08-02', 'Body')).toContain('SMM 26.8 kg')
    expect(notMeasured(out, '2026-08-02', 'Body')).toContain('weight')
  })

  it('still prints the reading the moment a weight is present', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-02', weekdayLabel: 'Sun', weightKg: 64.2 })],
      bodyComp: [body({ date: '2026-08-02', weightKg: 64.2, bodyFatPct: 17.3, skeletalMuscleMassKg: 26.8 })],
    }))
    const row = bodyRow(out, '2026-08-02')
    expect(row.Weight).toBe('64.2')
    expect(row['Fat %']).toBe('17.3')
    expect(row.SMM).toBe('26.8')
    // The absent compartments dash rather than vanish — an omitted column is
    // indistinguishable from a zero to whoever reads this.
    expect(row['Muscle kg']).toBe('—')
  })

  it('does not suppress a genuine reading just because some fields are absent', () => {
    // 2026-07-27 after the manual re-entry: weighed, so it prints — the missing
    // fields inside it are em-dashes, which is what an em-dash is for.
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-07-27', weekdayLabel: 'Mon', weightKg: 64.5 })],
      bodyComp: [body({
        date: '2026-07-27', weightKg: 64.5, bmi: 22.3, bodyFatPct: 17.6, musclePercent: 78,
        muscleMassKg: 50.31, fatFreeMassKg: 53.15, skeletalMuscleMassKg: 26.6,
      })],
    }))
    const row = bodyRow(out, '2026-07-27')
    expect([row.Weight, row.BMI, row['Fat %']]).toEqual(['64.5', '22.3', '17.6'])
    expect([row['Muscle %'], row['Muscle kg']]).toEqual(['78.0', '50.3'])
    expect([row.FFM, row.SMM]).toEqual(['53.1', '26.6'])
    // The ones the scale did not report stay dashed on the same line.
    expect(row['Water %']).toBe('—')
  })

  // ── §5b · effort ──
  //
  // v2 printed a "Average workout effort: 8.5/10 CR10 across 2 rated sessions"
  // line. v3 renders no session-level mean at all: `## SESSIONS` states each
  // session's own `srpe`, and an unrated one answers `—`, so the mean is the
  // reader's to take and the DENOMINATOR is visible rather than asserted.
  // `weeklySummary` still computes it for the surfaces that want the number.
  it('averages session effort over the RATED sessions and says how many', () => {
    const in_ = base({
      sessions: [session({ sessionRpe: 8 }), session({ sessionRpe: 9 }), session({ sessionRpe: null })],
    })
    const s = weeklySummary(in_)
    expect(s.avgSessionRpe).toBe(8.5)
    expect(s.ratedSessions).toBe(2)
    // And the document shows the three ratings the mean was taken over.
    expect(weekSessions(buildWeeklyExport(in_)).map(sessionRpe))
      .toEqual(['8', '9', null])
  })

  it('says "not rated" rather than scoring an unrated week 0', () => {
    const in_ = base({ sessions: [session({ sessionRpe: null })] })
    // Null, never 0 — an unrated week is unmeasured, not effortless.
    expect(weeklySummary(in_).avgSessionRpe).toBeNull()
    expect(weeklySummary(in_).ratedSessions).toBe(0)
    expect(sessionRpe(weekSessions(buildWeeklyExport(in_))[0])).toBeNull()
    expect(weekSessions(buildWeeklyExport(in_))[0].meta).toContain('sRPE not reported')
  })

  it('does not let an unrated session drag the mean down', () => {
    const in_ = base({ sessions: [session({ sessionRpe: 9 }), session({ sessionRpe: null })] })
    expect(weeklySummary(in_).avgSessionRpe).toBe(9)
    expect(weeklySummary(in_).ratedSessions).toBe(1)
    // Two sessions, one rating — the document says so rather than implying the
    // rating covered both.
    expect(weekSessions(buildWeeklyExport(in_)).map(sessionRpe)).toEqual(['9', null])
  })

  // ── §5a · sparklines ──
  describe('sparkline', () => {
    it('scales from ZERO so a flat week looks flat', () => {
      // 11.2k/11.4k/11.7k steps is a flat week. Scaled from the minimum it
      // would read ▁▄█ — the classic way a sparkline lies.
      const s = sparkline([11200, 11400, 11700])
      expect(new Set(s).size).toBe(1)
      expect(s).toBe('███')
    })

    it('renders a real range across the full eight levels', () => {
      expect(sparkline([0, 100])).toBe('▁█')
    })

    it('marks a missing day distinctly from a small one', () => {
      const s = sparkline([1000, null, 0])
      expect(s[1]).toBe('·')
      expect(s[2]).toBe('▁')
      expect(s[1]).not.toBe(s[2])
    })

    it('is empty when nothing was logged at all', () => {
      expect(sparkline([null, null])).toBe('')
    })

    it('survives an all-zero week without dividing by zero', () => {
      expect(sparkline([0, 0, 0])).toBe('▁▁▁')
    })

    it('emits exactly one glyph per input day', () => {
      expect([...sparkline([1, null, 3, 4, null, 6, 7])]).toHaveLength(7)
    })
  })

  /**
   * v2 drew the week's shape as three sparklines beside the totals. v3 draws no
   * pictures — `sparkline` survives, and is pinned directly above — but the
   * SERIES each bar was drawn from is in the document, one value per day, in
   * `## DAYS` order. What the bars could not do, and the columns do, is
   * distinguish a real zero from a gap without a legend.
   */
  it('draws the week’s shape beside the totals it summarises', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-08-02', weekdayLabel: 'Sun', steps: 12000 }),
        day({ date: '2026-08-03', weekdayLabel: 'Mon', steps: 6000 }),
        day({ date: '2026-08-04', weekdayLabel: 'Tue', steps: null }),
      ],
      sessions: [session({ date: '2026-08-02', volumeKg: 4000 })],
    }))
    // A missing step count is a GAP: the day may well have been walked, so it
    // is `—` and not a bar at the floor.
    const steps = dayDates(out).map((d) => {
      const m = /^([\d,]+) steps/.exec(dayFieldOrNull(out, d, 'Activity') ?? '')
      return m ? m[1].replace(/,/g, '') : null
    })
    expect(steps).toEqual(['12000', '6000', null])
    // A rest day is a REAL zero for volume — no training happened — and it
    // shows as the absence of a session rather than as an invented 0.
    expect(weekSessions(out).map((x) => x.date)).toEqual(['2026-08-02'])
    expect(weekTotals(out).tonnageKg).toBe(4000)
    // The series the bars were drawn from is still exactly one glyph per day.
    expect(sparkline(steps.map((v) => (v == null ? null : Number(v))))).toBe('█▅·')
  })

  it('sums a double-session day into ONE volume bar', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-08-02', weekdayLabel: 'Sun' }),
        day({ date: '2026-08-03', weekdayLabel: 'Mon' }),
      ],
      sessions: [
        session({ date: '2026-08-02', volumeKg: 1000 }),
        session({ date: '2026-08-02', volumeKg: 1000 }),
        session({ date: '2026-08-03', volumeKg: 2000 }),
      ],
    }))
    // Both days did 2000 kg. The document prints each session under its own
    // day — that is the evidence — and the per-day sum has to come out equal,
    // or any reading of the week is a lie.
    const byDate = new Map<string, number>()
    for (const r of weekSessions(out)) {
      const kg = Number(/([\d,.]+) kg tonnage/.exec(r.counts)![1].replace(/,/g, ''))
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + kg)
    }
    expect([...byDate.values()]).toEqual([2000, 2000])
    // And the week's own total counts each session once, not each day once.
    expect(weekTotals(out).tonnageKg).toBe(4000)
    expect(weekTotals(out).sessions).toBe(3)
  })
})
