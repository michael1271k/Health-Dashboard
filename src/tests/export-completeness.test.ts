/**
 * THE FIVE THINGS THE EXPORT CLAIMED TO CARRY AND DID NOT.
 *
 * Every case in this file is a regression pin for a fact that existed in the
 * database, had a field on the export's own interfaces, had a renderer ready to
 * print it — and never arrived, because one assignment was missing somewhere
 * between the SELECT and the page. That failure mode is silent by construction:
 * the export renders, every test passes, and the document is simply quieter
 * than the week it describes.
 *
 * They are grouped by the shape of the failure rather than by module:
 *
 *  1. SET METADATA the payload builder dropped (quality, ghost, drop set).
 *  2. GAPS that were invisible because the row was omitted (fatigue, soreness).
 *  3. MEASUREMENTS the export never asked for (micros, vitals, sleep stages).
 *
 * The `weekPayload` half is pinned in `export-week-payload.test.ts`; this file
 * pins the RENDERER, which is where a reader would notice.
 *
 * ── READ AGAINST v4 ──────────────────────────────────────────────────────────
 * The document is day-major and labelled now, so every assertion here is scoped
 * to a DAY and then to a labelled ROW of it, rather than grepping the whole
 * string: a date appears in a heading, in an excluded-days list, in a soreness
 * attribution and in a table, and a bare `toContain` would pass on whichever it
 * met first. The facts pinned are unchanged — only the shape they are read in.
 */
import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, nutrientLine, FATIGUE_SLOT_LABELS,
  type WeeklyExportInput, type ExportDay, type ExportSession,
} from '@/lib/reports/weeklyExport'
import { derivedWeek } from '@/lib/reports/derived'
import { SLOT_LABEL, FATIGUE_SLOTS } from '@/lib/hooks/useFatigue'
import {
  dayField, dayFieldOrNull, dayHeadings, setsOf, subsectionLines, tableRow,
  readiness, head, stack, legendText, notRecorded, notMeasured, NO_DATA, NONE,
} from './exportGrammar'

const emptyDay = (date: string, weekdayLabel: string): ExportDay => ({
  date, weekdayLabel, isTrainingDay: false,
  weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
  steps: null, distanceM: null, trainingMin: null,
  sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
  wristTempDeltaC: null, bloodOxygenPct: null,
  waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
  weighInSkipReason: null, nutritionException: null, nutritionEstimated: false,
})

const week = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const days = week.map((wd, i) => emptyDay(`2026-08-2${3 + i}`, wd))

const base: WeeklyExportInput = {
  weekStart: '2026-08-23', weekEnd: '2026-08-29', programLabel: 'Helix Cut',
  calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
  days, sessions: [], volumeByMuscle: [], doms: [],
}

const session = (over: Partial<ExportSession> = {}): ExportSession => ({
  date: '2026-08-27', label: 'Chest & Back B', volumeKg: 1000, setCount: 2,
  failureSets: 0, durationMin: 60, avgBpm: null, caloriesBurned: null,
  sessionRpe: null, exercises: [], prs: [], ...over,
})

describe('set metadata the payload used to drop on the floor', () => {
  /**
   * THE TEST CASE THAT STARTED THIS.
   *
   * `workout_sets.quality` was in the SELECT, on the `RawSet` type, and read by
   * `setDetail` through `SET_QUALITY` — and `toSessions` never assigned it, so
   * the renderer was handed `undefined` every time. Identical in shape to the
   * `blood_oxygen` bug the export's own header documents: the column, the query
   * and the reader all existed, and only the assignment was missing.
   *
   * v3 stated the flag as `Q:<key>` — the stored key, read against a legend.
   * v4 goes back to the reader's own words, because there is no legend to read
   * it against any more: the person holding this document is a coach, not a
   * database. What the pin is for is unchanged — the flag has to ARRIVE, and it
   * has to be readable.
   */
  it('prints a technique flag in the reader’s words, not the stored key', () => {
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{
          name: 'Neutral-Grip Lat Pulldown', topKg: 49.5, repWindow: '10–12',
          sets: [
            { weightKg: 47, reps: 12, rpe: 8.5, side: null, failure: false, pairId: null },
            { weightKg: 49.5, reps: 11, rpe: 9.5, side: null, failure: false, pairId: null, quality: 'momentum' },
          ],
        }],
      })],
    })
    expect(setsOf(out, '2026-08-27', 'Neutral-Grip Lat Pulldown')).toEqual([
      '`S1` 47 kg × 12 @ 8.5 Hard',
      '`S2` 49.5 kg × 11 @ 9.5 Max Effort — momentum',
    ])
    // The word, not the stored key. `Q:momentum` needed a legend to be read at
    // all, and this document does not hand the reader one.
    expect(out).not.toContain('Q:momentum')
  })

  it('says nothing at all about a set nobody flagged', () => {
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{
          name: 'Chest Press', topKg: 40, repWindow: null,
          sets: [{ weightKg: 40, reps: 12, rpe: 9, side: null, failure: false, pairId: null }],
        }],
      })],
    })
    // Absent means the question was never asked, NOT that the set was clean —
    // so the line simply ends, rather than carrying a word that reads as an
    // answer.
    expect(setsOf(out, '2026-08-27', 'Chest Press')).toEqual(['`S1` 40 kg × 12 @ 9 Very Hard'])
    expect(out).not.toMatch(/Q:/)
  })

  /**
   * A ghost is a set that did NOT happen. Unmapped, it took a numbered `Set N:`
   * line as work — which is precisely what `ExportSet.ghost` was added to
   * prevent, in the one document that exists to say what the week actually was.
   *
   * v4 numbers the WORKING sets and nothing else: a ghost carries the ordinal
   * `G`, and the set after it keeps the number the ghost would have taken.
   */
  it('never gives a ghost set a working set number', () => {
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{
          name: 'Chest Press', topKg: 40, repWindow: null,
          sets: [
            { weightKg: 40, reps: 12, rpe: 9, side: null, failure: false, pairId: null },
            { weightKg: 40, reps: 10, rpe: null, side: null, failure: false, pairId: null, ghost: true },
            { weightKg: 40, reps: 10, rpe: 9, side: null, failure: false, pairId: null },
          ],
        }],
      })],
    })
    const sets = setsOf(out, '2026-08-27', 'Chest Press')
    expect(sets).toEqual([
      '`S1` 40 kg × 12 @ 9 Very Hard',
      '`G` 40 kg × 10 — ghost',
      '`S2` 40 kg × 10 @ 9 Very Hard',
    ])
    // The ghost consumed no set number: the real second set is `S2`, not `S3`.
    expect(sets.filter((s) => s.startsWith('`G`'))).toHaveLength(1)
    // A ghost was never rated, and the document never prints an empty effort:
    // the ABSENCE of an `@` is what says "not reported", which is a different
    // fact from an easy set.
    expect(sets[1]).not.toContain('@')
  })

  it('marks a drop set, which used to read as an ordinary lighter set', () => {
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{
          name: 'Preacher Curl', topKg: 18.75, repWindow: null,
          sets: [
            { weightKg: 18.75, reps: 12, rpe: 9.5, side: null, failure: false, pairId: null },
            { weightKg: 12.5, reps: 8, rpe: 10, side: null, failure: false, pairId: null, dropset: true },
          ],
        }],
      })],
    })
    expect(setsOf(out, '2026-08-27', 'Preacher Curl')).toEqual([
      '`S1` 18.75 kg × 12 @ 9.5 Max Effort',
      '`S2` 12.5 kg × 8 @ 10 Failure — drop set',
    ])
  })

  it('says "no sets logged" rather than leaving an exercise out', () => {
    // An exercise that was programmed and not performed is a fact about the
    // session. Omitting it lets a reader conclude it was never on the card.
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{ name: 'Calf Press', topKg: null, repWindow: null, sets: [] }],
      })],
    })
    expect(setsOf(out, '2026-08-27', 'Calf Press')).toEqual([])
    expect(out).toContain('**Calf Press**')
    expect(out).toContain('**no sets logged**')
  })
})

describe('gaps that used to be invisible because the row was simply omitted', () => {
  /**
   * The section printed only the readings that existed, on only the days that
   * had one. A week holding five readings printed two lines, and a Saturday
   * rated once in the morning printed a single cheerful "Morning fresh" that
   * read as the whole day.
   *
   * In v4 the whole grid is the `fatigue` clause of each day's readiness row:
   * every slot named, every unanswered slot "no data", on all seven days.
   */
  it('prints seven days and three slots regardless of what was answered', () => {
    // Every fixture day is a REST day (`emptyDay` sets isTrainingDay: false),
    // so every line asks Waking / Midday / Night.
    const out = buildWeeklyExport({
      ...base,
      fatigue: [
        { date: '2026-08-28', slot: 'Waking', level: 2, label: 'Fine' },
        { date: '2026-08-28', slot: 'Midday', level: 3, label: 'Worn' },
        { date: '2026-08-29', slot: 'Waking', level: 1, label: 'Fresh' },
      ],
    })
    expect(dayHeadings(out)).toHaveLength(7)
    expect(readiness(out, '2026-08-28').fatigue)
      .toBe(`waking 2 Fine · midday 3 Worn · night ${NO_DATA}`)
    // The Saturday that used to print as one confident reading.
    expect(readiness(out, '2026-08-29').fatigue)
      .toBe(`waking 1 Fresh · midday ${NO_DATA} · night ${NO_DATA}`)
    // And the days nobody answered at all, which used to print nothing.
    expect(readiness(out, '2026-08-23').fatigue)
      .toBe(`waking ${NO_DATA} · midday ${NO_DATA} · night ${NO_DATA}`)
  })

  /**
   * The slot VOCABULARY is per day, not per week — a rest day and a training day
   * ask different questions in the middle slots, and a bare triple cannot say
   * which pair was answered.
   *
   * The session COST v2 printed — the After-minus-Before delta — is rendered
   * nowhere. Both readings it was taken from are on this line, so the
   * subtraction is still available to the reader; the document no longer does
   * it for them.
   */
  it('asks a training day the training slots, and prints the session’s cost', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-26' ? { ...d, isTrainingDay: true } : d)),
      fatigue: [
        { date: '2026-08-26', slot: 'Waking', level: 1, label: 'Fresh' },
        { date: '2026-08-26', slot: 'Before training', level: 2, label: 'Fine' },
        { date: '2026-08-26', slot: 'After training', level: 4, label: 'Heavy' },
      ],
    })
    expect(readiness(out, '2026-08-26').fatigue)
      .toBe('waking 1 Fresh · before training 2 Fine · after training 4 Heavy')
    // The rest days around it keep the rest vocabulary — the grid is per DAY,
    // not per week.
    expect(readiness(out, '2026-08-27').fatigue)
      .toBe(`waking ${NO_DATA} · midday ${NO_DATA} · night ${NO_DATA}`)
  })

  it('prints no cost when either end of the pair is missing', () => {
    // A delta computed against an absent reading looks like a measurement and
    // is not one. The unanswered ends say so, and nothing is inferred from the
    // single reading that does exist.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-26' ? { ...d, isTrainingDay: true } : d)),
      fatigue: [{ date: '2026-08-26', slot: 'Before training', level: 2, label: 'Fine' }],
    })
    expect(readiness(out, '2026-08-26').fatigue)
      .toBe(`waking ${NO_DATA} · before training 2 Fine · after training ${NO_DATA}`)
  })

  it('groups soreness by day, like fatigue, and says when a day was not logged', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [
        { date: '2026-08-23', muscle: 'Hamstrings', severity: 2 },
        { date: '2026-08-23', muscle: 'Quads', severity: 0 },
      ],
    })
    // ONE clause for the day carrying both muscles — not one row per muscle.
    // And a rated-not-sore reading is `0`, which is an answer, not an absence.
    expect(readiness(out, '2026-08-23').doms).toBe('Hamstrings 2 · Quads 0')
    expect(readiness(out, '2026-08-24').doms).toBe(NONE)
  })

  /**
   * Delayed onset is the entire content of the measurement. "Hamstrings 2" says
   * nothing a coach can use; "Hamstrings 2, from Legs B three days ago" is a
   * dose-response reading — and `doms_logs` has carried the attribution since
   * the columns shipped, unasked for.
   *
   * The document states the source DATE rather than "3 days out": the day it
   * sits under is itself dated, so the interval is a subtraction rather than a
   * clause the reader has to trust.
   */
  it('attributes soreness to the session that caused it, and says how long ago', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{
        date: '2026-08-23', muscle: 'Hamstrings', severity: 2,
        sourceLabel: 'Legs B', sourceDate: '2026-08-20',
      }],
    })
    expect(readiness(out, '2026-08-23').doms).toBe('Hamstrings 2 *(from Legs B, 20 Aug)*')
  })

  it('names the workout without claiming a date it cannot see', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{ date: '2026-08-23', muscle: 'Quads', severity: 1, sourceLabel: 'Legs A', sourceDate: null }],
    })
    // The missing date is simply not written: "(from Legs A)" is a complete
    // sentence, and "(from Legs A, no data)" states a gap nobody asked about.
    expect(readiness(out, '2026-08-23').doms).toBe('Quads 1 *(from Legs A)*')
  })

  /**
   * v2 of the soreness model — laterality and sub-regions.
   *
   * v3 spelled these as tokens — `Arms/Biceps@L` — because `@` could not be
   * confused with a separator and `Lats` begins with an L. v4 has no token
   * grammar to protect, so the side is spelled as the word it is. The
   * sub-region keeps its slash: it is a part OF the muscle, not a second one.
   */
  it('marks a side without touching the bilateral spelling', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [
        { date: '2026-08-23', muscle: 'Arms', severity: 3, subRegion: 'Biceps', side: 'left' },
        { date: '2026-08-23', muscle: 'Chest', severity: 1, side: 'both', subRegion: '' },
      ],
    })
    // A whole-muscle, both-sides rating is still the bare muscle name, so a
    // week of pre-migration rows reads exactly as it always did.
    expect(readiness(out, '2026-08-23').doms).toBe('Arms/Biceps left 3 · Chest 1')
  })

  it('carries a sub-region, a side and the attribution in one reading', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{
        date: '2026-08-23', muscle: 'Inner thighs', severity: 1,
        subRegion: 'Abductors', side: 'right',
        sourceLabel: 'Legs B', sourceDate: '2026-09-09',
      }],
    })
    expect(readiness(out, '2026-08-23').doms)
      .toBe('Inner thighs/Abductors right 1 *(from Legs B, 9 Sep)*')
  })

  it('does not let a sub-region beginning with L read as a left side', () => {
    // `Lats` starts with an L, which is why the side was never spelled as a
    // one-letter prefix here the way a unilateral SET is. Spelled in full it
    // cannot be ambiguous at all.
    const out = buildWeeklyExport({
      ...base,
      doms: [{ date: '2026-08-23', muscle: 'Back', severity: 2, subRegion: 'Lats', side: 'both' }],
    })
    expect(readiness(out, '2026-08-23').doms).toBe('Back/Lats 2')
  })

  it('keeps both sides of one muscle in the same clause', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [
        { date: '2026-08-23', muscle: 'Quads', severity: 3, side: 'left' },
        { date: '2026-08-23', muscle: 'Quads', severity: 1, side: 'right' },
      ],
    })
    expect(readiness(out, '2026-08-23').doms).toBe('Quads left 3 · Quads right 1')
  })

  it('flags a joint, with and without the wearer’s words', () => {
    const out = buildWeeklyExport({
      ...base,
      joints: [
        { date: '2026-08-23', joint: 'Knee', side: 'left' },
        { date: '2026-08-23', joint: 'Wrist', side: 'right', note: 'tight after pressing' },
      ],
    })
    expect(readiness(out, '2026-08-23').joints)
      .toBe('Knee left · Wrist right: tight after pressing')
    // A day with no flag says "none", exactly as `doms` does — and that is a
    // different fact from a day the app heard nothing about at all.
    expect(readiness(out, '2026-08-24').joints).toBe(NONE)
  })

  it('strips the field separator out of a note, and keeps the rest', () => {
    // ` · ` still divides the readings on a row, so a note carrying one would
    // split into things that look like data. `;` and `:` divide nothing any
    // more, and stripping them was the document editing the wearer's words:
    // "barely slept; deadline" came out as "barely slept deadline".
    const out = buildWeeklyExport({
      ...base,
      joints: [{
        date: '2026-08-23', joint: 'Elbow',
        note: 'sore · on; press: since Tuesday',
      }],
    })
    const clause = readiness(out, '2026-08-23').joints
    expect(clause).toBe('Elbow: sore on; press: since Tuesday')
    expect(clause).not.toContain('·')
  })

  it('keeps the export’s own slot vocabulary identical to the app’s', () => {
    // The labels are duplicated in `weeklyExport` on purpose — importing the
    // hook would drag React Query into a pure module — so the copy is pinned
    // here rather than trusted.
    expect([...FATIGUE_SLOT_LABELS]).toEqual(FATIGUE_SLOTS.map((s) => SLOT_LABEL[s]))
  })
})

describe('the Head row, which only the native app could write', () => {
  /**
   * `stress_logs` shipped with W4 and reached no report. It is not a second
   * fatigue scale: fatigue asks what the BODY could do and this asks what is on
   * the mind, and the two answer differently on the same day — a calm week of
   * heavy training and a light week in the middle of a house move both exist.
   */
  it('names the slot, the level, its word, and what it was about', () => {
    const out = buildWeeklyExport({
      ...base,
      stress: [
        { date: '2026-08-23', slot: 'morning', level: 2, label: 'Okay', tags: [] },
        {
          date: '2026-08-23', slot: 'evening', level: 4, label: 'Strained',
          tags: ['work', 'money'], note: 'deadline slipped',
        },
      ],
    })
    expect(head(out, '2026-08-23')).toEqual([
      'morning 2 Okay',
      'evening 4 Strained — work, money — “deadline slipped”',
    ])
  })

  it('says "no data" on a day nobody answered, rather than a calm one', () => {
    const out = buildWeeklyExport({ ...base, stress: [] })
    expect(dayField(out, '2026-08-23', 'Head')).toBe(NO_DATA)
    // And the legend explains the scale, which is 1–5 and not the 0–3 soreness
    // uses two clauses above it.
    expect(legendText(out)).toContain('1 Relaxed to 5 Swamped')
  })
})

describe('measurements the export never asked for', () => {
  /**
   * v2 named every target on every day, dashed. v3 printed a `## NUTRIENTS`
   * line per day with every logged key on it. v4 prints the EXCEPTIONS per day
   * — a floor missed, a ceiling exceeded, a reading the document doubts — and
   * moves the full picture to one weekly table, which is where an average
   * belongs. What is unchanged, and what this pin exists for, is the SPLIT.
   */
  it('keeps food and stack apart on every micronutrient', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, calories: 1943, nutrientsFood: { fiber: 18, vitaminC: 124 }, nutrientsStack: { vitaminC: 470 } }
        : d)),
    })
    // The split is the reading: 594 mg of vitamin C is a different fact about a
    // different week when a tablet supplied four fifths of it.
    const c = tableRow(out, 'Micronutrients — weekly average vs target', 'Vitamin C')
    expect(c.Food).toBe('124')
    expect(c.Stack).toBe('470')
    expect(c.Total).toBe('594')
    // Over the days that carried a reading, never over seven — dividing by
    // seven would report a deficiency the week does not have.
    expect(c.Days).toBe('1')
    // A key with no reading on either side is not in the table at all, and the
    // caption says so, so it can never be read as a measured zero.
    expect(() => tableRow(out, 'Micronutrients — weekly average vs target', 'Calcium')).toThrow()
    expect(subsectionLines(out, 'Micronutrients — weekly average vs target').join('\n'))
      .toContain('Averaged over the days that carried a reading, not over seven')
  })

  it('names a missed floor on the day it was missed, and nothing else', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, nutrientsFood: { fiber: 18, vitaminC: 124 }, nutrientsStack: { vitaminC: 470 } }
        : d)),
    })
    // Fibre missed its floor; vitamin C is four times over it and says nothing.
    expect(dayField(out, '2026-08-27', 'Micros')).toBe('Fiber 18 / 30 g')
    // A day with nothing logged has no micros row at all, and says so at the
    // foot rather than printing eighteen keys nobody measured.
    expect(dayFieldOrNull(out, '2026-08-26', 'Micros')).toBeNull()
    expect(notRecorded(out, '2026-08-26')).toContain('micronutrients')
  })

  it('marks a ceiling as one, because it inverts the reading of the same numbers', () => {
    // 200/400 mg of caffeine is on protocol; 200/400 mg of magnesium is half a
    // dose. Without the tag the two lines are indistinguishable.
    expect(nutrientLine({}, { caffeine: 200 })).toMatch(/Caffeine: 200\/400 mg \(ceiling, stack\)/)
    expect(nutrientLine({}, { magnesium: 200 })).toMatch(/Magnesium: 200\/400 mg(?! \(ceiling)/)
    // And in the document itself, on the row the reader meets it on.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27' ? { ...d, nutrientsFood: { sodium: 4000 } } : d)),
    })
    expect(dayField(out, '2026-08-27', 'Micros')).toBe('Sodium 4,000 / 3,000 mg (ceiling)')
  })

  it('carries the vitals the app measured daily and the export never printed', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? {
            ...d, restingHr: 52, avgHr: 82, respiratoryRate: 16.98, vo2max: 46.81,
            exerciseMin: 125, standHours: 3, standMin: 176, daylightMin: 59,
          }
        : d)),
    })
    const vitals = dayField(out, '2026-08-27', 'Vitals')
    // Resting HR and the DAYTIME average are different instruments pointed at
    // different questions, and each is named so neither can be read as the
    // other.
    expect(vitals).toContain('RHR 52')
    expect(vitals).toContain('avg HR 82')
    expect(vitals).toContain('resp 17.0 /min')
    expect(vitals).toContain('VO₂max 46.8')
    const activity = dayField(out, '2026-08-27', 'Activity')
    expect(activity).toContain('exercise 125 min')
    expect(activity).toContain('daylight 59 min')
    // Apple's stand ring is TWO measurements: hours that held a stand, and
    // total standing minutes. One composite token collapsed them and rendered
    // `3h176` for this very day, which is malformed under its own shape.
    expect(activity).toContain('stand 3 h (176 min)')
  })

  it('names the vitals it did NOT measure, once, rather than per field', () => {
    // Twelve consecutive "no data"s is not stating a gap — it is burying the
    // day's real readings in it.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27' ? { ...d, restingHr: 52 } : d)),
    })
    expect(dayField(out, '2026-08-27', 'Vitals')).toMatch(/^RHR 52 — not measured: /)
    expect(notMeasured(out, '2026-08-27', 'Vitals')).toEqual(
      ['HRV', 'avg HR', 'SpO₂', 'respiratory rate', 'wrist temp', 'VO₂max'],
    )
  })

  it('prints the night’s architecture, not just its length', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-29'
        ? {
            ...d, sleepMin: 587, deepMin: 39, remMin: 124, coreMin: 424, awakeMin: 12,
            bedTime: '2026-08-28T21:27:09+00:00', wakeTime: '2026-08-29T07:26:12+00:00',
          }
        : d)),
    })
    const sleep = dayField(out, '2026-08-29', 'Sleep')
    expect(sleep).toContain('9 h 47 m')
    expect(sleep).toContain('deep 39 m · REM 2 h 04 m · core 7 h 04 m · awake 12 m')
    // WHEN a night happened is a separate fact from how long it lasted, and the
    // only one that shows a drifting schedule. It is a CLOCK time, not the
    // timestamp the column stores.
    expect(sleep).toContain('21:27 → 07:26')
    expect(sleep).not.toContain('2026-08-28T')
  })

  it('reports supplement COMPLIANCE, which the protocol list cannot', () => {
    // Each logged item carries its own SCHEDULED slot, so two items due
    // together simply share a time. And it is named, not keyed: `d3k2@07:00`
    // is not a line a person reads.
    const out = buildWeeklyExport({
      ...base,
      supplementProtocol: [
        { time: '10:30', key: 'multivitamin', name: 'Multivitamin', dose: '1 tab' },
        { time: '11:45', key: 'citrulline', name: 'L-Citrulline', dose: '3 g' },
        { time: '11:45', key: 'caffeine', name: 'Caffeine', dose: '200 mg' },
      ],
      days: days.map((d) => (d.date === '2026-08-27'
        ? {
            ...d, supplementsTaken: 9, supplementsPlanned: 9,
            supplementsLog: [
              { key: 'multivitamin', time: '10:30' },
              { key: 'citrulline', time: '11:45' },
              { key: 'caffeine', time: '11:45' },
            ],
          }
        : d)),
    })
    const s = stack(out, '2026-08-27')
    expect(s.count).toBe('9 of 9')
    expect(s.taken).toEqual(['Multivitamin 10:30', 'L-Citrulline 11:45', 'Caffeine 11:45'])
  })

  it('falls back to the stored key when the protocol no longer names it', () => {
    // An item archived since, or renamed. The dose still happened, so it must
    // still appear — a name the reader half-recognises beats a silence.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, supplementsTaken: 1, supplementsPlanned: 1, supplementsLog: [{ key: 'theanine', time: null }] }
        : d)),
    })
    expect(stack(out, '2026-08-27').taken).toEqual(['theanine'])
  })

  /**
   * A miss has to be SAID. Absence of a row used to read as a skip, which made
   * the line a record of when the app was open rather than of what was taken —
   * eight days in August 2026 reported three bedtime doses missed that were
   * swallowed on time. Now only a deliberate skip writes anything, so the
   * export has to name it or the miss disappears entirely.
   */
  it('names a deliberately skipped dose rather than leaving it to be inferred', () => {
    const out = buildWeeklyExport({
      ...base,
      supplementProtocol: [{ time: '10:30', key: 'multivitamin', name: 'Multivitamin', dose: '1 tab' }],
      days: days.map((d) => (d.date === '2026-08-27'
        ? {
            ...d, supplementsTaken: 8, supplementsPlanned: 9,
            supplementsLog: [{ key: 'multivitamin', time: '10:30' }],
            supplementsSkipped: ['Caffeine'],
          }
        : d)),
    })
    const s = stack(out, '2026-08-27')
    expect(s.count).toBe('8 of 9')
    expect(s.taken).toEqual(['Multivitamin 10:30'])
    // Its own clause, so a skip is never something the reader has to infer from
    // a short log.
    expect(s.skipped).toEqual(['Caffeine'])
  })

  it('does not call an empty tick list "none taken"', () => {
    // A missing `supplement_log` row means TAKEN. An empty list therefore says
    // the per-item ticks were never written — the count beside it is the fact.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, supplementsTaken: 8, supplementsPlanned: 9 }
        : d)),
    })
    expect(stack(out, '2026-08-27').taken).toEqual(['no per-item log'])
    expect(stack(out, '2026-08-27').skipped).toEqual(['none logged'])
  })
})

describe('the computed figures are named as computed', () => {
  it('says so on the line, because there is no fence to put them behind', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, calories: 2000, bmrKcal: 1500, activeKcal: 500 }
        : d)),
    })
    expect(dayField(out, '2026-08-27', 'Derived')).toContain('TDEE')
    // The marker travels with the figure: these lines sit inches from measured
    // ones, and v3's document-level fence cannot exist in a day-major layout.
    expect(out).toContain('**Derived** *(computed by Onyx, not measured)*')
    expect(legendText(out)).toContain('computed by Onyx, not measured')
    expect(legendText(out)).toContain('load = session RPE × minutes')
  })

  /**
   * The comparison BASIS. The week-over-week line is computed from the ledger,
   * and the rule it is computed under is the one that was wrong: a re-export of
   * an older week must not compare itself against a week that had not happened
   * yet.
   */
  it('compares against the most recent EARLIER week, never a later one', () => {
    const input: WeeklyExportInput = {
      ...base,
      sessions: [session({ volumeKg: 26340 })],
      ledger: [
        { label: 'Week 4', weekStart: '2026-08-16', totals: {
          avgKcal: 1980, totalVolumeKg: 24180, avgSteps: 9000,
          cardioMinutes: 200, avgWaterMl: 3000, avgWeightKg: 65.4 } },
        // A later row exists — a re-export of an older week must not compare
        // itself against the future.
        { label: 'Week 6', weekStart: '2026-08-30', totals: {
          avgKcal: 2100, totalVolumeKg: 30000, avgSteps: 9500,
          cardioMinutes: 210, avgWaterMl: 3100, avgWeightKg: 65.0 } },
      ],
    }
    const volume = derivedWeek(input).deltas.find((d) => d.label === 'Total volume')!
    expect(volume.previous).toBe(24180)      // Week 4, not Week 6
    expect(volume.current).toBe(26340)
    expect(volume.delta).toBe(2160)
    expect(volume.pct).toBeCloseTo(8.93, 1)
    // The ledger still prints every week it was handed, later ones included:
    // the trajectory is the table, and the comparison is not.
    const out = buildWeeklyExport(input)
    expect(out).toContain('| Week 4 ')
    expect(out).toContain('| Week 6 ')
    expect(subsectionLines(out, 'Week over week').join('\n'))
      .toContain('**vs the previous week** — total volume +2,160 kg')
  })

  /**
   * `nutrition_entries.micros.calcium` on this account is bimodal: ~155–290 mg
   * on most days, ~3,070–3,383 mg on seventeen of them, with calories, sodium
   * and potassium normal throughout. The export was right every time — 3,074 is
   * what the column holds — but the column stores a daily AGGREGATE with no
   * item breakdown, so the contributor cannot be identified downstream. The
   * document can at least stop stating an impossible number in the same voice
   * as a measured one.
   */
  it('flags a micronutrient reading that cannot be true, and says why', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, nutrientsFood: { calcium: 3074 } }
        : d)),
    })
    // The reading is still stated exactly as stored — it is doubted, not
    // discounted — and the doubt names the day it was on.
    expect(dayField(out, '2026-08-27', 'Micros'))
      .toBe('Calcium ⚠ 3,074 / 1,000 mg — implausible')
    // The weekly average carries the mark too, so a reader who only reads the
    // table is not handed a clean-looking 3,074.
    expect(tableRow(out, 'Micronutrients — weekly average vs target', 'Calcium').Total)
      .toBe('⚠ 3,074')
  })

  it('leaves an ordinary reading, and an exceeded CEILING, unflagged', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        // 274 mg of calcium is a normal day here; sodium is a ceiling, and
        // exceeding a ceiling is the ordinary thing it exists to report.
        ? { ...d, nutrientsFood: { calcium: 274, sodium: 4000 } }
        : d)),
    })
    // The calcium floor was missed and says so; neither reading is DOUBTED.
    // The glyph is asserted where a reading would carry it, not document-wide:
    // the micronutrient table's caption explains what ⚠ means and prints every
    // week, so a bare search for it always matches.
    expect(dayField(out, '2026-08-27', 'Micros'))
      .toBe('Sodium 4,000 / 3,000 mg (ceiling) · Calcium 274 / 1,000 mg')
    expect(tableRow(out, 'Micronutrients — weekly average vs target', 'Calcium').Total)
      .toBe('274')
    expect(tableRow(out, 'Micronutrients — weekly average vs target', 'Sodium (ceiling)').Total)
      .toBe('4,000')
  })

  /**
   * The document used to be able to end with the whole payload serialised into
   * a json fence. Nothing ever read it: this export has one consumer and it is
   * a person pasting into a chat window, so the fence was a verbatim second
   * copy of every number already stated above it, several times longer than the
   * prose. The builder is gone with it.
   */
  it('does not append a second copy of itself as raw JSON', () => {
    const out = buildWeeklyExport(base)
    expect(out).not.toMatch(/## Machine-readable week/)
    expect(out).not.toMatch(/```json/)
    expect(out).not.toMatch(/"schema": "helix\.week\/1"/)
  })
})
