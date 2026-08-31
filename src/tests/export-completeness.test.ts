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
 */
import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, nutrientLine, FATIGUE_SLOT_LABELS,
  type WeeklyExportInput, type ExportDay, type ExportSession,
} from '@/lib/reports/weeklyExport'
import { weekJsonBlock } from '@/lib/reports/weekJson'
import { SLOT_LABEL, FATIGUE_SLOTS } from '@/lib/hooks/useFatigue'

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

/** The prose half — the machine block repeats every string by design. */
const md = (out: string): string => {
  const i = out.indexOf('## Machine-readable week')
  return i < 0 ? out : out.slice(0, i)
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
    expect(out).toMatch(/Set 2: 49\.5 kg × 11 \(RPE 9\.5 — Max Effort, Set Quality: Momentum\)/)
    // The stored key never reaches the page — a coach reads this, not a database.
    expect(md(out)).not.toMatch(/partial_rom|form_breakdown|needed_warmup/)
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
    // Absent means the question was never asked, NOT that the set was clean.
    expect(out).toMatch(/Set 1: 40 kg × 12 \(RPE 9 — [^)]*\)/)
    expect(md(out)).not.toMatch(/Set Quality:/)
  })

  /**
   * A ghost is a set that did NOT happen. Unmapped, it took a numbered `Set N:`
   * line as work — which is precisely what `ExportSet.ghost` was added to
   * prevent, in the one document that exists to say what the week actually was.
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
    expect(out).toMatch(/Skipped: 40 kg × 10 \(planned\)/)
    // The set AFTER the ghost is Set 2, not Set 3 — the ghost consumed nothing.
    expect(out).toMatch(/Set 2: 40 kg × 10/)
    expect(md(out)).not.toMatch(/Set 3:/)
  })

  it('marks a drop set, which used to read as an ordinary lighter set', () => {
    const out = buildWeeklyExport({
      ...base,
      sessions: [session({
        exercises: [{
          name: 'Preacher Curl (Machine)', topKg: 18.75, repWindow: null,
          sets: [
            { weightKg: 18.75, reps: 12, rpe: 9.5, side: null, failure: false, pairId: null },
            { weightKg: 12.5, reps: 8, rpe: 10, side: null, failure: false, pairId: null, dropset: true },
          ],
        }],
      })],
    })
    expect(out).toMatch(/Set 2: 12\.5 kg × 8 \([^)]*drop set\)/)
  })
})

describe('gaps that used to be invisible because the row was simply omitted', () => {
  /**
   * The section printed only the readings that existed, on only the days that
   * had one. A week holding five readings printed two lines, and a Saturday
   * rated once in the morning printed a single cheerful "Morning fresh" that
   * read as the whole day.
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
    expect(out).toMatch(/- Fri 2026-08-28: Waking fine · Midday worn · Night —/)
    // The Saturday that used to print as one confident reading.
    expect(out).toMatch(/- Sat 2026-08-29: Waking fresh · Midday — · Night —/)
    // And the days nobody answered at all, which used to print nothing.
    expect(out).toMatch(/- Sun 2026-08-23: Waking — · Midday — · Night —/)
    // A rest day has no before/after pair, so it can never carry a cost.
    expect(out).not.toMatch(/- Fri 2026-08-28:.*cost/)
  })

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
    expect(out).toMatch(
      /- Wed 2026-08-26: Waking fresh · Before training fine · After training heavy · cost \+2/)
    // The rest days around it keep the rest vocabulary — the grid is per DAY,
    // not per week.
    expect(out).toMatch(/- Thu 2026-08-27: Waking — · Midday — · Night —/)
  })

  it('prints no cost when either end of the pair is missing', () => {
    // A delta computed against an absent reading looks like a measurement and
    // is not one.
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-26' ? { ...d, isTrainingDay: true } : d)),
      fatigue: [{ date: '2026-08-26', slot: 'Before training', level: 2, label: 'Fine' }],
    })
    expect(out).toMatch(/- Wed 2026-08-26: Waking — · Before training fine · After training —$/m)
  })

  it('groups soreness by day, like fatigue, and says when a day was not logged', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [
        { date: '2026-08-23', muscle: 'Hamstrings', severity: 2 },
        { date: '2026-08-23', muscle: 'Quads', severity: 0 },
      ],
    })
    // ONE line for the day carrying both muscles — not one line per muscle.
    expect(out).toMatch(/- Sun 2026-08-23: Hamstrings: 2 \(moderate\) · Quads: 0 \(none\)/)
    expect(out).toMatch(/- Mon 2026-08-24: not logged/)
  })

  /**
   * Delayed onset is the entire content of the measurement. "Hamstrings 2" says
   * nothing a coach can use; "Hamstrings 2, from Legs B three days ago" is a
   * dose-response reading — and `doms_logs` has carried the attribution since
   * the columns shipped, unasked for.
   */
  it('attributes soreness to the session that caused it, and says how long ago', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{
        date: '2026-08-23', muscle: 'Hamstrings', severity: 2,
        sourceLabel: 'Legs B', sourceDate: '2026-08-20',
      }],
    })
    expect(out).toMatch(/Hamstrings: 2 \(moderate\) — from Legs B/)
    expect(out).toMatch(/3 days out/)
  })

  it('names the workout without claiming a date it cannot see', () => {
    const out = buildWeeklyExport({
      ...base,
      doms: [{ date: '2026-08-23', muscle: 'Quads', severity: 1, sourceLabel: 'Legs A', sourceDate: null }],
    })
    expect(out).toMatch(/Quads: 1 \(mild\) — from Legs A$/m)
    expect(md(out)).not.toMatch(/days out/)
  })

  it('keeps the export’s own slot vocabulary identical to the app’s', () => {
    // The labels are duplicated in `weeklyExport` on purpose — importing the
    // hook would drag React Query into a pure module — so the copy is pinned
    // here rather than trusted.
    expect([...FATIGUE_SLOT_LABELS]).toEqual(FATIGUE_SLOTS.map((s) => SLOT_LABEL[s]))
  })
})

describe('measurements the export never asked for', () => {
  it('names every micronutrient every day, measured or not', () => {
    const out = buildWeeklyExport({
      ...base,
      days: days.map((d) => (d.date === '2026-08-27'
        ? { ...d, calories: 1943, nutrientsFood: { fiber: 18, vitaminC: 124 }, nutrientsStack: { vitaminC: 470 } }
        : d)),
    })
    // The split is the reading: 594 mg of vitamin C is a different fact about a
    // different week when a tablet supplied four fifths of it.
    expect(out).toMatch(/Vitamin C: 594\/90 mg \(124 food \+ 470 stack\)/)
    expect(out).toMatch(/Fiber: 18\/30 g/)
    // A day with no reading still names the nutrient rather than dropping it.
    expect(out).toMatch(/- Nutrients: Fiber: —\/30 g/)
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
    // Resting HR and the DAYTIME average are different instruments pointed at
    // different questions, and they sit on the same line so neither can be read
    // as the other.
    expect(out).toMatch(/Resting HR: 52 bpm .*Avg HR \(daytime\): 82 bpm/)
    expect(out).toMatch(/Respiratory Rate: 17\.0 br\/min/)
    expect(out).toMatch(/VO2 Max: 46\.8 ml\/kg\/min/)
    expect(out).toMatch(/Exercise: 125 min · Stand: 3 h \(176 min\) · Daylight: 59 min/)
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
    expect(out).toMatch(/Sleep Stages: Deep: 0h 39m · REM: 2h 04m · Core: 7h 04m · Awake: 0h 12m/)
    // WHEN a night happened is a separate fact from how long it lasted, and the
    // only one that shows a drifting schedule.
    expect(out).toMatch(/Bed: 21:27 · Wake: 07:26/)
  })

  it('reports supplement COMPLIANCE, which the protocol list cannot', () => {
    // The times are the SCHEDULED slots now, and items due together are named
    // together: citrulline and caffeine are both 11:45 items because they are
    // one trip to the cupboard.
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
    expect(out).toMatch(/- Supplements: 9 of 9 taken · 10:30 multivitamin · 11:45 citrulline, caffeine/)
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
    expect(out).toMatch(/- Supplements: 8 of 9 taken · 10:30 multivitamin · SKIPPED: Caffeine/)
  })
})

describe('the derived section is fenced off from the measurements', () => {
  it('arrives AFTER every measurement it is built from', () => {
    const out = buildWeeklyExport(base)
    expect(out.indexOf('## Days')).toBeLessThan(out.indexOf('## Derived'))
    expect(out.indexOf('## Weekly aggregates')).toBeLessThan(out.indexOf('## Derived'))
  })

  it('says out loud that nothing under it is a measurement', () => {
    const out = buildWeeklyExport(base)
    expect(out).toMatch(/## Derived \(computed by HELIX — not measured\)/)
    expect(out).toMatch(/Everything above this heading is a measurement/)
  })

  it('compares against the most recent EARLIER week, never a later one', () => {
    const out = buildWeeklyExport({
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
    })
    expect(out).toMatch(/Total volume: 24180 → 26340 kg \(\+2160, \+8\.9%\)/)
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
    expect(out).toMatch(/Calcium: ⚠ 3074\/1000 mg/)
    expect(out).toMatch(/Implausible micronutrient readings this week:\*\* Calcium 3074 mg on 2026-08-27/)
    expect(out).toMatch(/the duplicate is upstream, in the Health source/)
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
    expect(out).toMatch(/Calcium: 274\/1000 mg/)
    expect(out).not.toMatch(/⚠/)
    expect(out).not.toMatch(/Implausible micronutrient readings/)
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
