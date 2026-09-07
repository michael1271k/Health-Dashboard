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
 * ── READ AGAINST v3 ──────────────────────────────────────────────────────────
 * The document is a dense token grammar now, so every assertion here zips the
 * relevant ROW against the legend on its own heading rather than grepping the
 * whole string: a date opens a row in five different sections, and a bare
 * `toContain` would pass on whichever one it met first. The facts pinned are
 * unchanged — only the shape they are read in.
 */
import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, nutrientLine, FATIGUE_SLOT_LABELS,
  type WeeklyExportInput, type ExportDay, type ExportSession,
} from '@/lib/reports/weeklyExport'
import { derivedWeek } from '@/lib/reports/derived'
import { weekJsonBlock } from '@/lib/reports/weekJson'
import { SLOT_LABEL, FATIGUE_SLOTS } from '@/lib/hooks/useFatigue'
import {
  dayRow, rowsOf, setsOf, sectionLines, dataLines, nutrientsRow, headings,
  howLine, DASH,
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
   * v3 states the flag as `Q:<key>` — the stored key, guarded by `SET_QUALITY`
   * so an unknown one prints nothing at all. That inverts v2's "the reader's
   * words, never the key": this document is read against a stated grammar, and
   * one key per quality is one token where a prose gloss was a clause. What the
   * pin is for is unchanged — the flag has to ARRIVE, and it has to be readable.
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
    expect(setsOf(out, '2026-08-27', 'Neutral-Grip Lat Pulldown'))
      .toEqual(['47×12@8.5', '49.5×11@9.5Q:momentum'])
    // The legend above the rows is what makes `Q:` readable at all — a bare key
    // with nothing naming it is the failure the v2 gloss existed to avoid.
    expect(sectionLines(out, 'SESSIONS').find((l) => l.startsWith('##   exercise')))
      .toContain('[Q:key]')
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
    // so there is no `Q:` token, rather than a `Q:—` that reads as an answer.
    expect(setsOf(out, '2026-08-27', 'Chest Press')).toEqual(['40×12@9'])
    expect(dataLines(out, 'SESSIONS').join('\n')).not.toMatch(/Q:/)
  })

  /**
   * A ghost is a set that did NOT happen. Unmapped, it took a numbered `Set N:`
   * line as work — which is precisely what `ExportSet.ghost` was added to
   * prevent, in the one document that exists to say what the week actually was.
   *
   * v3 numbers nothing: a set is a token in position, and a ghost carries `G`.
   * The pin is that it stays DISTINGUISHABLE from the working sets around it and
   * takes none of their identity.
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
    expect(sets).toEqual(['40×12@9', '40×10G', '40×10@9'])
    // Exactly one token is flagged, and the two real sets carry nothing that
    // could be mistaken for a flag.
    expect(sets.filter((s) => s.includes('G'))).toHaveLength(1)
    // A ghost was never rated, and v3 never prints `@—`: the ABSENCE of an `@`
    // is what says "not reported", which is a different fact from an easy set.
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
    expect(setsOf(out, '2026-08-27', 'Preacher Curl'))
      .toEqual(['18.75×12@9.5', '12.5×8@10D'])
  })
})

describe('gaps that used to be invisible because the row was simply omitted', () => {
  /**
   * The section printed only the readings that existed, on only the days that
   * had one. A week holding five readings printed two lines, and a Saturday
   * rated once in the morning printed a single cheerful "Morning fresh" that
   * read as the whole day.
   *
   * In v3 the whole grid is ONE `fatigue` cell per day: every slot named, every
   * unanswered slot `—`, on all seven rows.
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
    expect(rowsOf(out, 'DAYS')).toHaveLength(7)
    expect(dayRow(out, '2026-08-28').fatigue).toBe('Waking:2;Midday:3;Night:—')
    // The Saturday that used to print as one confident reading.
    expect(dayRow(out, '2026-08-29').fatigue).toBe('Waking:1;Midday:—;Night:—')
    // And the days nobody answered at all, which used to print nothing.
    expect(dayRow(out, '2026-08-23').fatigue).toBe('Waking:—;Midday:—;Night:—')
  })

  /**
   * The slot VOCABULARY is per day, not per week — a rest day and a training day
   * ask different questions in the middle slots, and a bare triple cannot say
   * which pair was answered.
   *
   * The session COST v2 printed — the After-minus-Before delta — is not rendered
   * anywhere in v3. Both readings it was taken from are on this line, so the
   * subtraction is still available to the reader; the document no longer does it
   * for them.
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
    expect(dayRow(out, '2026-08-26').fatigue)
      .toBe('Waking:1;Before training:2;After training:4')
    // The rest days around it keep the rest vocabulary — the grid is per DAY,
    // not per week.
    expect(dayRow(out, '2026-08-27').fatigue).toBe('Waking:—;Midday:—;Night:—')
  })

  it('prints no cost when either end of the pair is missing', () => {
    // A delta computed against an absent reading looks like a measurement and
    // is not one. The unanswered ends dash, and nothing is inferred from the
    // single reading that does exist.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-26' ? { ...d, isTrainingDay: true } : d)),
      fatigue: [{ date: '2026-08-26', slot: 'Before training', level: 2, label: 'Fine' }],
    })
    expect(dayRow(out, '2026-08-26').fatigue)
      .toBe('Waking:—;Before training:2;After training:—')
  })

  it('groups soreness by day, like fatigue, and says when a day was not logged', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [
        { date: '2026-08-23', muscle: 'Hamstrings', severity: 2 },
        { date: '2026-08-23', muscle: 'Quads', severity: 0 },
      ],
    })
    // ONE cell for the day carrying both muscles — not one row per muscle. And
    // a rated-not-sore reading is `0`, which is an answer, not an absence.
    expect(dayRow(out, '2026-08-23').doms).toBe('Hamstrings:2;Quads:0')
    expect(dayRow(out, '2026-08-24').doms).toBe(DASH)
  })

  /**
   * Delayed onset is the entire content of the measurement. "Hamstrings 2" says
   * nothing a coach can use; "Hamstrings 2, from Legs B three days ago" is a
   * dose-response reading — and `doms_logs` has carried the attribution since
   * the columns shipped, unasked for.
   *
   * v3 states the source DATE rather than "3 days out": the row it sits on is
   * itself dated, so the interval is a subtraction rather than a clause.
   */
  it('attributes soreness to the session that caused it, and says how long ago', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{
        date: '2026-08-23', muscle: 'Hamstrings', severity: 2,
        sourceLabel: 'Legs B', sourceDate: '2026-08-20',
      }],
    })
    expect(dayRow(out, '2026-08-23').doms).toBe('Hamstrings:2:Legs B:2026-08-20')
  })

  it('names the workout without claiming a date it cannot see', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{ date: '2026-08-23', muscle: 'Quads', severity: 1, sourceLabel: 'Legs A', sourceDate: null }],
    })
    // The empty date is TRIMMED rather than dashed: a trailing `:—` would be a
    // fourth part a parser has to decide the meaning of.
    expect(dayRow(out, '2026-08-23').doms).toBe('Quads:1:Legs A')
  })

  it('keeps the export’s own slot vocabulary identical to the app’s', () => {
    // The labels are duplicated in `weeklyExport` on purpose — importing the
    // hook would drag React Query into a pure module — so the copy is pinned
    // here rather than trusted.
    expect([...FATIGUE_SLOT_LABELS]).toEqual(FATIGUE_SLOTS.map((s) => SLOT_LABEL[s]))
  })
})

describe('measurements the export never asked for', () => {
  /**
   * v2 named every target on every day, dashed. v3 prints a `## NUTRIENTS` line
   * only for the days that hold a reading, and leaves off a key with nothing on
   * either side — the legend states that rule, so an absent key reads as "no
   * reading" rather than "not tracked". What is unchanged, and what this pin
   * exists for, is the SPLIT.
   */
  it('names every micronutrient every day, measured or not', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, calories: 1943, nutrientsFood: { fiber: 18, vitaminC: 124 }, nutrientsStack: { vitaminC: 470 } }
        : d)),
    })
    const row = nutrientsRow(out, '2026-08-27')
    // The split is the reading: 594 mg of vitamin C is a different fact about a
    // different week when a tablet supplied four fifths of it.
    expect(row.vitaminC).toBe('124+470')
    expect(row.fiber).toBe('18+0')
    // A key with no reading on either side is left off — and the legend says so
    // in as many words, so it can never be read as a measured zero.
    expect(row.calcium).toBeUndefined()
    expect(sectionLines(out, 'NUTRIENTS')[0])
      .toContain('a key with no reading on either side is left off the line')
    // A day with nothing logged gets no line at all.
    expect(dataLines(out, 'NUTRIENTS').map((l) => l.split(' · ')[0])).toEqual(['2026-08-27'])
  })

  it('marks a ceiling as one, because it inverts the reading of the same numbers', () => {
    // 200/400 mg of caffeine is on protocol; 200/400 mg of magnesium is half a
    // dose. Without the tag the two lines are indistinguishable.
    expect(nutrientLine({}, { caffeine: 200 })).toMatch(/Caffeine: 200\/400 mg \(ceiling, stack\)/)
    expect(nutrientLine({}, { magnesium: 200 })).toMatch(/Magnesium: 200\/400 mg(?! \(ceiling)/)
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
    const row = dayRow(out, '2026-08-27')
    // Resting HR and the DAYTIME average are different instruments pointed at
    // different questions, and they sit in named columns so neither can be read
    // as the other.
    expect(row.rhr).toBe('52')
    expect(row.avg_hr).toBe('82')
    expect(row.resp_bpm).toBe('17.0')
    expect(row.vo2max).toBe('46.8')
    expect(row.exercise_min).toBe('125')
    expect(row.daylight_min).toBe('59')
    // Apple's stand ring is TWO columns, both plain minutes-or-hours numbers.
    // One composite token collapsed them and rendered `3h176` for this very
    // day, which is unreadable under a `<h>h<mm>` shape.
    expect(row.stand_hours).toBe('3')
    expect(row.stand_min).toBe('176')
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
    const row = dayRow(out, '2026-08-29')
    expect([row.sleep_min, row.deep_min, row.rem_min, row.core_min, row.awake_min])
      .toEqual(['587', '39', '124', '424', '12'])
    // WHEN a night happened is a separate fact from how long it lasted, and the
    // only one that shows a drifting schedule.
    expect(row.bed).toBe('21:27')
    expect(row.wake).toBe('07:26')
  })

  it('reports supplement COMPLIANCE, which the protocol list cannot', () => {
    // Each logged item carries its own SCHEDULED slot, so two items due together
    // simply share a time rather than being grouped into one phrase — which
    // keeps the cell exactly one item per `;` for whoever parses it.
    const out = buildWeeklyExport({
      ...base,
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
    const row = dayRow(out, '2026-08-27')
    expect(row.supp).toBe('9/9')
    expect(row.supp_log).toBe('multivitamin@10:30;citrulline@11:45;caffeine@11:45')
  })

  /**
   * A miss has to be SAID. Absence of a row used to read as a skip, which made
   * the line a record of when the app was open rather than of what was taken —
   * eight days in August 2026 reported three bedtime doses missed that were
   * swallowed on time. Now only a deliberate skip writes anything, so the export
   * has to name it or the miss disappears entirely.
   */
  it('names a deliberately skipped dose rather than leaving it to be inferred', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? {
            ...d, supplementsTaken: 8, supplementsPlanned: 9,
            supplementsLog: [{ key: 'multivitamin', time: '10:30' }],
            supplementsSkipped: ['Caffeine'],
          }
        : d)),
    })
    const row = dayRow(out, '2026-08-27')
    expect(row.supp).toBe('8/9')
    expect(row.supp_log).toBe('multivitamin@10:30')
    // Its own column, so a skip is never something the reader has to infer from
    // a short log.
    expect(row.supp_skipped).toBe('Caffeine')
    expect(dayRow(out, '2026-08-26').supp_skipped).toBe(DASH)
  })
})

describe('the derived section is fenced off from the measurements', () => {
  it('arrives AFTER every measurement it is built from', () => {
    const out = buildWeeklyExport(base)
    expect(out.indexOf('\n## DAYS')).toBeLessThan(out.indexOf('\n## DERIVED'))
    expect(out.indexOf('\n## WEEK')).toBeLessThan(out.indexOf('\n## DERIVED'))
    // The energy balance is arithmetic over those measurements and closes the
    // document, below every one of them.
    expect(headings(out).at(-1)).toBe('## DERIVED.WEEK')
  })

  it('says out loud that nothing under it is a measurement', () => {
    const out = buildWeeklyExport(base)
    expect(sectionLines(out, 'DERIVED')[0])
      .toContain('## DERIVED · computed by Onyx — not measured')
    // And it says how each key was arrived at, on the line that closes the
    // document.
    expect(howLine(out)).toContain('load = session RPE × minutes')
  })

  /**
   * The comparison BASIS. v3 renders no week-over-week prose — `## LEDGER`
   * carries every week and the reader reads the column downwards — but the
   * deltas are still computed, and the rule they are computed under is the one
   * that was wrong: a re-export of an older week must not compare itself against
   * a week that had not happened yet.
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
  })

  /**
   * `nutrition_entries.micros.calcium` on this account is bimodal: ~155–290 mg on
   * most days, ~3,070–3,383 mg on seventeen of them, with calories, sodium and
   * potassium normal throughout. The export was right every time — 3,074 is what
   * the column holds — but the column stores a daily AGGREGATE with no item
   * breakdown, so the contributor cannot be identified downstream. The document
   * can at least stop stating an impossible number in the same voice as a
   * measured one.
   */
  it('flags a micronutrient reading that cannot be true, and says why once', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, nutrientsFood: { calcium: 3074 } }
        : d)),
    })
    // The reading is still stated exactly as stored — it is doubted, not
    // discounted.
    expect(nutrientsRow(out, '2026-08-27').calcium).toBe('3074+0')
    // And the doubt is stated ONCE, under the section it qualifies, naming the
    // nutrient, the figure and the day.
    const flagged = sectionLines(out, 'NUTRIENTS').filter((l) => l.startsWith('##   implausible'))
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toContain('Calcium 3074 mg on 2026-08-27')
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
    const row = nutrientsRow(out, '2026-08-27')
    expect(row.calcium).toBe('274+0')
    expect(row.sodium).toBe('4000+0')
    expect(out).not.toMatch(/⚠/)
    expect(sectionLines(out, 'NUTRIENTS').filter((l) => l.startsWith('##   implausible')))
      .toHaveLength(0)
  })

  /**
   * The document used to end with the whole payload serialised into a json
   * fence. Nothing ever read it: this export has one consumer and it is a person
   * pasting into a chat window, so the fence was a verbatim second copy of every
   * number already stated above it, several times longer than the prose.
   */
  it('does not append a second copy of itself as raw JSON', () => {
    const out = buildWeeklyExport(base)
    expect(out).not.toMatch(/## Machine-readable week/)
    expect(out).not.toMatch(/```json/)
    expect(out).not.toMatch(/"schema": "helix\.week\/1"/)
  })

  /**
   * The BUILDER survives, and is still the right shape for a tool that wants it.
   * Deleting it because today's document does not print it would throw away the
   * part that was correct, so it is tested directly rather than through the
   * rendered string.
   */
  it('still serialises a week a consumer could parse, on demand', () => {
    const block = weekJsonBlock({ ...base, sessions: [session({ volumeKg: 1234.5 })] })
    expect(block[0]).toBe('```json')
    const parsed = JSON.parse(block.slice(1, -1).join('\n'))
    expect(parsed.schema).toBe('helix.week/1')
    expect(parsed.week.start).toBe('2026-08-23')
    expect(parsed.days).toHaveLength(7)
    // `null` means "not recorded" here exactly as `—` does in the document. A
    // missing key would let a consumer infer zero, which is the one failure mode
    // this whole export is built to prevent.
    expect(parsed.days[0].calories).toBeNull()
    expect(parsed.derived).toBeDefined()
  })
})
