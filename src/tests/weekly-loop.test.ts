import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, weeklySummary, trendTotals,
  type WeeklyExportInput, type ExportDay, type ExportSession, type ExportCardio,
  type LedgerWeek, type ExportBodyComp, sparkline,
} from '@/lib/reports/weeklyExport'
import { stallProtocol, rollingAverage, type DayPoint, type SessionPoint } from '@/lib/coach/insights'
import {
  dayRow, rowsOf, rowFor, weekRow, bodyRow, cardioRows, sessionBlock, setsOf, exercise,
  legendOf, sectionLines, sectionText, dataLines, headings, headerCells,
  derivedRow, derivedWeekRow, howLine, assertAligned, DASH,
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
    // The precondition for every other assertion in this file. A row one field
    // wider than its legend reads the neighbouring column, and every field test
    // then passes on the wrong number.
    assertAligned(buildWeeklyExport(input))
  })

  it('marks missing data as "—" instead of dropping the row or implying zero', () => {
    const out = buildWeeklyExport(input)
    // The empty day is still PRESENT, and every column on it answers `—`.
    const mon = dayRow(out, '2026-07-20')
    expect(mon.day).toBe('Mon')
    expect(mon.train).toBe('0')
    for (const k of ['sleep_min', 'hrv_ms', 'rhr', 'steps', 'kcal', 'P', 'C', 'F',
      'water_l', 'weight_kg', 'active_kcal', 'bmr_kcal']) {
      expect(mon[k], `${k} on the empty day`).toBe(DASH)
    }
    // The two vitals that were fetched-and-dropped (blood oxygen) or never
    // fetched at all (wrist temperature) are columns on every day now, dashed
    // when absent — the whole point of adding them.
    expect(mon.wrist_temp_c).toBe(DASH)
    expect(mon.spo2_pct).toBe(DASH)
    // Never a fabricated 0: the empty day carries no numeric cell at all.
    expect(Object.values(mon).some((v) => v === '0' && v !== mon.train)).toBe(false)
  })

  it('is DRY DATA — no coaching prompt or instruction header', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/elite physique coach/)
    expect(out).not.toMatch(/Never invent data/)
    expect(out).not.toMatch(/highest-leverage/)
    // Starts straight at the week heading — the identity of the week, and
    // nothing telling the reader what to think about it.
    expect(headerCells(out)[0]).toBe('# ONYX WEEK')
    expect(headerCells(out)[1]).toBe('2026-07-19→2026-07-25')
  })

  it('carries the program, sessions, and volume targets', () => {
    const out = buildWeeklyExport(input)
    expect(headerCells(out)[2]).toBe('Helix Cut')
    expect(sessionBlock(out, '2026-07-19').row.label).toBe('Upper A')
    // The dose and the target, side by side. v2 graded it with a ZONE word
    // ("building"); v3 prints no verdicts at all, so the comparison is the
    // reader's to make — 4 against 8 says everything the word did.
    const biceps = rowFor(out, 'WEEK.MUSCLE', 'Biceps')
    expect(biceps.sets).toBe('4.0')
    expect(biceps.target).toBe('8.0')
    expect(sectionText(out, 'WEEK.MUSCLE')).not.toMatch(/building/)
  })

  it('nests body composition under the weigh-in day only when supplied', () => {
    expect(headings(buildWeeklyExport(input))).not.toContain('## BODY')
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
    expect([body.weight_kg, body.bmi, body.fat_pct, body.fat_mass_kg])
      .toEqual(['65.3', '22.4', '13.2', '8.6'])
    expect([body.muscle_pct, body.muscle_mass_kg]).toEqual(['46.1', '30.1'])
    expect([body.protein_pct, body.protein_kg]).toEqual(['19.7', '12.9'])
    expect([body.smm_kg, body.visceral, body.bmr_kcal]).toEqual(['27.0', '6.0', '1620'])
    expect([body.whr, body.ffm_kg]).toEqual(['0.80', '56.7'])
    // THREE numbers here could answer to "muscle mass" and they are ~23 kg
    // apart. v2 spent a parenthetical gloss on each; v3 gives each its own
    // NAMED column on the legend, which is the same disambiguation for free.
    expect(legendOf(withBody, 'BODY'))
      .toEqual(expect.arrayContaining(['smm_kg', 'muscle_mass_kg', 'ffm_kg']))
    // The day's own row carries the two figures a reader wants without leaving
    // the daily log, and they agree with the scale's row.
    expect(dayRow(withBody, '2026-07-19').smm_kg).toBe(body.smm_kg)
    expect(dayRow(withBody, '2026-07-19').fat_pct).toBe(body.fat_pct)
  })

  it('nests walks/cardio under their day, flagged as already counted', () => {
    expect(headings(buildWeeklyExport(input))).not.toContain('## CARDIO')
    const withCardio = buildWeeklyExport({
      ...input,
      cardio: [{
        date: '2026-07-19', kind: 'walk', distanceM: 4200, durationMin: 45,
        kcal: 210, totalKcal: 265, avgHr: 112, effort: 4,
      }],
    })
    // Every requested metric, named on the legend, in a fixed order. Pace is
    // DERIVED (45 min ÷ 4.2 km = 10:43 /km), never a stored column.
    const [walk] = cardioRows(withCardio, '2026-07-19')
    expect(walk.day).toBe('Sun')
    expect([walk.kind, walk.duration_min, walk.dist_km, walk.pace_min_km])
      .toEqual(['Walk', '45.0', '4.20', '10:43 /km'])
    expect([walk.avg_hr, walk.effort_cr10]).toEqual(['112', '4'])
    // v2 shouted the double-count warning in bold on every walk line. v3 states
    // it structurally instead: `active_kcal` is the share ALREADY inside the
    // day's own active energy, and `total_kcal` sits BESIDE it rather than
    // replacing it — two columns a reader cannot add together by accident.
    expect(walk.active_kcal).toBe('210')
    expect(walk.total_kcal).toBe('265')
    expect(legendOf(withCardio, 'CARDIO'))
      .toEqual(expect.arrayContaining(['active_kcal', 'total_kcal']))
  })

  it('names every cardio metric even when it was never entered — and never invents a zero', () => {
    const sparse = buildWeeklyExport({
      ...input,
      cardio: [{ date: '2026-07-19', kind: 'run', distanceM: null, durationMin: 30, kcal: null, totalKcal: null, avgHr: null, effort: null }],
    })
    // Dropping absent fields made two walks incomparable: one showed "avg HR
    // 112" and one showed nothing, with no way to tell missing data from a
    // missing export. Each field is a column and is explicitly unknown.
    const [run] = cardioRows(sparse, '2026-07-19')
    expect(run.kind).toBe('Run')
    expect(run.duration_min).toBe('30.0')
    for (const k of ['dist_km', 'pace_min_km', 'active_kcal', 'total_kcal', 'avg_hr', 'effort_cr10']) {
      expect(run[k], `${k} on a sparse bout`).toBe(DASH)
    }
    // The invariant that mattered in the original test: no fabricated zeros.
    // Scoped to the cardio row — the day rows legitimately carry numbers
    // ending in 0 (calorie targets, step counts).
    expect(Object.values(run)).not.toContain('0')
  })

  it('carries the Borg CR10 session effort onto the session line', () => {
    // `srpe` is the Borg CR10 rating, stated as given — the scale is named on
    // the legend rather than repeated as a suffix on every row.
    expect(sessionBlock(buildWeeklyExport(input), '2026-07-19').row.srpe).toBe('8')
    expect(legendOf(buildWeeklyExport(input), 'SESSIONS')).toContain('srpe')
  })

  it('lists EVERY working set, one per numbered line — not just the top set', () => {
    // v3 numbers nothing: a set is a `load×reps` token in position, and every
    // one of them is printed. The pin is that none is collapsed away.
    const out = buildWeeklyExport(input)
    expect(setsOf(out, '2026-07-19', 'Chest Press')).toEqual(['60×12', '60×11', '57.5×10F'])
    // The rep window the sets are read against rides on the same line.
    expect(exercise(out, '2026-07-19', 'Chest Press')[1]).toBe('[10–12]')
  })

  it('carries per-workout volume, failures, time and kcal burned', () => {
    const row = sessionBlock(buildWeeklyExport(input), '2026-07-19').row
    expect(row.duration_min).toBe('68')
    expect(row.tonnage_kg).toBe('8240')
    expect(row.sets).toBe('24')
    expect(row.failure_sets).toBe('1')
    expect(row.kcal).toBe('512')
    expect(row.avg_bpm).toBe('118')
    expect(row.session_no).toBe('#9')
  })

  it('marks a set taken to failure and NEVER emits an estimated 1RM', () => {
    const out = buildWeeklyExport(input)
    // `F` is the flag, named on the legend rather than spelled out per set.
    expect(setsOf(out, '2026-07-19', 'Chest Press')[2]).toBe('57.5×10F')
    expect(sectionLines(out, 'SESSIONS').find((l) => l.startsWith('##   exercise')))
      .toContain('[W|G|D|F]')
    // A SET line never grows an estimate. The only e1rm in the document is the
    // PR row's own column, and its legend says in as many words that it is an
    // estimate rather than a lift that happened.
    for (const cells of sessionBlock(out, '2026-07-19').exercises) {
      for (const token of cells.slice(4)) expect(token).not.toMatch(/e1rm/i)
    }
    expect(sectionLines(out, 'SESSIONS').find((l) => l.startsWith('##   PR')))
      .toContain('an ESTIMATE, not a lift that happened')
  })

  it('splits unilateral work per side (L/R weight · reps · failure)', () => {
    const out = buildWeeklyExport(input)
    // ONE token for the pair, both sides inside it — decided per SET by
    // `pairId`, so the two arms can never drift into two separate sets.
    expect(setsOf(out, '2026-07-19', 'Single Arm Cable Crossover'))
      .toEqual(['L7.5×15|R7.5×13F'])
  })

  it('names the PRs, and each axis carries its own value', () => {
    // The axis names ARE the labels: a Weight record's value is the lift
    // already printed to its left and stands alone, while the 1RM axis carries
    // the estimate a reader would otherwise have to compute.
    const out = buildWeeklyExport(input)
    const [pr] = sessionBlock(out, '2026-07-19').prs
    expect(pr).toEqual(['Chest Press', '60×12', 'Weight;1RM', '720', '84'])
    // ONE row per record — the axis list and the values are columns of the
    // same line, so neither can be printed twice.
    expect(sessionBlock(out, '2026-07-19').prs).toHaveLength(1)
    expect(sessionBlock(out, '2026-07-19').row.prs).toBe('1')
  })

  it('carries steps and recovery signals per day', () => {
    const sun = dayRow(buildWeeklyExport(input), '2026-07-19')
    expect(sun.steps).toBe('9200')
    expect(sun.hrv_ms).toBe('62.0')
    expect(sun.rhr).toBe('48')
  })

  /**
   * Score and Battery are Onyx's own derived OPINIONS and belong under the
   * fence or nowhere. Apple's active energy is not one of them: it is a
   * measurement, it always rode on the cardio line, and v3 gives it a named
   * `active_kcal` column on every day. What must never appear above the fence
   * is a verdict.
   */
  const rawBody = (out: string) => {
    const i = out.indexOf('\n## DERIVED')
    expect(i, 'no ## DERIVED fence').toBeGreaterThan(-1)
    return out.slice(0, i)
  }

  it('never emits Active Energy, Day Score or Battery', () => {
    const out = buildWeeklyExport(input)
    const raw = rawBody(out)
    expect(raw).not.toMatch(/battery/i)
    expect(raw).not.toMatch(/\bscore\b/i)
    expect(raw).not.toMatch(/readiness/i)
    // Below the fence, and only there, the battery's own inputs are stated —
    // each as one key with a value per day, in `## DAYS` order.
    for (const key of ['load', 'acwr', 'strainZ', 'wellness']) {
      expect(derivedRow(out, key)).toHaveLength(input.days.length)
    }
    // And the fence says out loud what it is.
    expect(sectionLines(out, 'DERIVED')[0]).toContain('computed by Onyx — not measured')
  })

  it('renders line-by-line TEXT with NO markdown tables', () => {
    const out = buildWeeklyExport(input)
    // `## LEDGER` is the one deliberate table and this fixture has no ledger,
    // so nothing in this document may be one.
    expect(headings(out)).not.toContain('## LEDGER')
    expect(out).not.toMatch(/^\|/m)
    expect(out).not.toMatch(/\|---/)
    // What is actually banned above the fence is Onyx's own opinions — never a
    // measured column, however Apple-shaped.
    expect(rawBody(out)).not.toMatch(/Battery/)
    expect(legendOf(out, 'DAYS')).toContain('active_kcal')
  })

  /**
   * A day is FOUR GROUPED LINES, not one long one. It used to be a single
   * ~300-character run of eleven `·`-separated fields, which is correct data and
   * an unreadable row: nothing marked where nutrition stopped and vitals began.
   *
   * The order is fixed and the groups are: identity → what was eaten → what was
   * moved → what the body reported.
   */
  it('renders each day as EIGHT grouped lines, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(headings(out)).toContain('## DAYS')
    // v3 collapses the eight grouped lines into ONE line per day, and moves the
    // grouping onto the legend: the columns still run identity → the night →
    // what was moved → what was eaten → the stack → the body → the subjective,
    // in that order, and every field keeps its place in it. Asserted as one
    // list, because what is under test is the ORDER and the completeness —
    // thirty-nine independent `toBe` calls would pass on a shuffled legend.
    //
    // It was four lines, then five, then eight, and the groups that joined are
    // each one the old shape had no room for: the night's ARCHITECTURE
    // (distinct from its duration), the day's MICROS (which the export omitted
    // entirely while the app measured eight of them daily) and supplement
    // COMPLIANCE (distinct from the protocol at the foot of the document,
    // which is a prescription). Micros outgrew the row and are their own
    // section now; the other two are columns here.
    expect(legendOf(out, 'DAYS')).toEqual([
      'date', 'day', 'train',
      'sleep_min', 'deep_min', 'rem_min', 'core_min', 'awake_min',
      'bed', 'wake', 'onset',
      'hrv_ms', 'rhr', 'avg_hr', 'spo2_pct', 'resp_bpm', 'wrist_temp_c', 'vo2max',
      'daylight_min', 'exercise_min', 'stand_hours', 'stand_min',
      'steps', 'dist_km', 'training_min', 'active_kcal',
      'kcal', 'P', 'C', 'F', 'water_l',
      'supp', 'supp_log', 'supp_skipped',
      'weight_kg', 'fat_pct', 'smm_kg', 'bmr_kcal',
      'fatigue', 'doms', 'joints', 'tags',
    ])

    const sun = dayRow(out, '2026-07-19')
    expect([sun.date, sun.day, sun.train]).toEqual(['2026-07-19', 'Sun', '1'])
    expect(sun.sleep_min).toBe('551')                          // the night
    expect([sun.hrv_ms, sun.rhr]).toEqual(['62.0', '48'])      // what the body reported
    expect([sun.steps, sun.dist_km, sun.training_min])
      .toEqual(['9200', '7.10', '68'])                         // what was moved
    expect([sun.kcal, sun.P, sun.C, sun.F, sun.water_l])
      .toEqual(['1940', '172', '190', '54', '3.00'])           // what was eaten
    // The denominator is em-dashed rather than assumed: this fixture states
    // that three were taken and never says how many were asked for, and "3/3"
    // would be an invented claim of perfect adherence.
    expect(sun.supp).toBe(`3/${DASH}`)
    expect(sun.weight_kg).toBe('65.3')
    // A training day asks the training questions; every unanswered slot is a
    // dash, and the slot is NAMED so a rest day's triple cannot be confused
    // with it.
    expect(sun.fatigue).toBe('Waking:—;Before training:—;After training:—')
    // Apple's stand ring is two plain numbers rather than one `12h58` token:
    // the composite assumed minutes-WITHIN-the-hour, and a caller handing it a
    // day's total minutes produced a cell nothing could parse.
    expect([sun.stand_hours, sun.stand_min]).toEqual([DASH, DASH])
    // One line, and the whole day is on it.
    expect(dataLines(out, 'DAYS')).toHaveLength(2)
  })

  // A blank weight can mean "not weighed", "the sync dropped it", or "skipped on
  // purpose" — and only the last is safe to leave out of a trend.
  it('states WHY a weigh-in is missing, defaulting to the protocol reason', () => {
    // No reason stored → "As Planned", not "no reason recorded". Skipping the
    // scale before a bowel movement IS the protocol, and reporting it as a
    // logging gap reads a deliberate week as a sloppy one.
    const out = buildWeeklyExport(input)
    expect(dayRow(out, '2026-07-20').weight_kg).toBe(DASH)
    expect(dayRow(out, '2026-07-20').tags).toBe('skip:As Planned')

    const withReason = buildWeeklyExport({
      ...input,
      days: input.days.map((d) => (d.date === '2026-07-20' ? { ...d, weighInSkipReason: 'Travel' } : d)),
    })
    // Read DYNAMICALLY off the day — change the reason and the export follows.
    expect(dayRow(withReason, '2026-07-20').tags).toBe('skip:Travel')
    expect(withReason).not.toMatch(/As Planned/)
    // A day that WAS weighed never carries a skip marker.
    expect(dayRow(withReason, '2026-07-19').tags).not.toMatch(/skip:/)
  })

  it('tags a declared exception on the intake it explains, and changes no total', () => {
    const dateNight = input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210, nutritionException: 'Event' } : d))
    const raw = buildWeeklyExport({ ...input, days: input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210 } : d)) })
    const tagged = buildWeeklyExport({ ...input, days: dateNight })

    // The tag rides the day the intake was eaten on, in the `tags` column —
    // and the intake itself is stated in full, undiscounted.
    expect(dayRow(tagged, '2026-07-19').kcal).toBe('3210')
    expect(dayRow(tagged, '2026-07-19').tags).toBe('except:Event')
    // An ordinary day is never annotated with one.
    expect(dayRow(tagged, '2026-07-20').tags).not.toMatch(/except:/)

    // A PR set on a declared day is still a PR, printed exactly as any other:
    // "he hit a record on the night out" is the interesting fact, and the day's
    // own tag is what says which Sunday it was.
    expect(sessionBlock(tagged, '2026-07-19').prs)
      .toEqual(sessionBlock(raw, '2026-07-19').prs)

    // THE INVARIANT: forgiving the grade must not move a single aggregate. The
    // ONLY difference between these two documents is the one tag.
    expect(tagged.replace('· except:Event', `· ${DASH}`)).toBe(raw)
  })

  it('names WHICH axis each PR was set on, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(sessionBlock(out, '2026-07-19').prs[0][2]).toBe('Weight;1RM')

    // A movement with no ledger row still lists — without inventing an axis.
    const noAxes = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, prs: s.prs.map((p) => ({ ...p, axes: [] })) })),
    })
    const [pr] = sessionBlock(noAxes, '2026-07-19').prs
    expect(pr[0]).toBe('Chest Press')
    expect(pr[1]).toBe('60×12')
    expect(pr[2]).toBe(DASH)
  })

  // Volume is a sum of quarter-kg microloads; 0 dp made the export disagree with
  // the Session Report about the same session.
  it('prints session volume at full precision, never rounded to a whole kg', () => {
    const precise = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8329.25 })),
    })
    expect(sessionBlock(precise, '2026-07-19').row.tonnage_kg).toBe('8329.25')
    expect(weekRow(precise).tonnage_kg).toBe('8329.25')
    // A whole number stays whole — no cosmetic ".00".
    const whole = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8240 })),
    })
    expect(sessionBlock(whole, '2026-07-19').row.tonnage_kg).toBe('8240')
    expect(weekRow(whole).tonnage_kg).toBe('8240')
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
    expect(headings(withProtocol)).toContain('## SUPPS')
    // The stack is nearly identical on both kinds of day. Two headed lists
    // duplicated a dozen identical lines to express one differing dose; v3 has
    // one row per item, with the training/rest split as two of its columns.
    expect(withProtocol).not.toMatch(/Training days/)
    expect(withProtocol).not.toMatch(/Rest days/)
    expect(legendOf(withProtocol, 'SUPPS'))
      .toEqual(['time', 'name', 'dose', 'training_dose', 'rest_dose', 'training_only', 'notes'])
    // Chronological, so the list is read in the order the day happens in.
    expect(rowsOf(withProtocol, 'SUPPS').map((r) => r.name))
      .toEqual(['Vitamin D3 + K2', 'L-Citrulline'])
    expect(rowFor(withProtocol, 'SUPPS', '11:45').dose).toBe('3 g')
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
    const cit = rowsOf(out, 'SUPPS').find((r) => r.name === 'L-Citrulline')!
    expect(cit.dose).toBe('6 g')
    expect(cit.training_only).toBe('1')
    expect(out).not.toMatch(/3 g/)
    // No asserted multivitamin sentence any more — every field comes from the
    // row, and a row that says nothing extra prints dashes rather than a rule.
    const mv = rowsOf(out, 'SUPPS').find((r) => r.name === 'Two Per Day Multivitamin')!
    expect(mv).toEqual({
      time: '10:30', name: 'Two Per Day Multivitamin', dose: '1 tab',
      training_dose: DASH, rest_dose: DASH, training_only: '0', notes: DASH,
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
    expect(rowFor(out, 'SUPPS', '09:00').notes).toBe('2 tabs on Monday & Friday (Leg Days)')
    // A supplement with no rule gets no invented one.
    expect(rowFor(out, 'SUPPS', '15:00').notes).toBe(DASH)
    expect(rowFor(out, 'SUPPS', '15:00').dose).toBe('5 g')
  })

  it('states a split dose as the rule it is, rather than picking a column', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '09:00', name: 'Multivitamin', dose: '1 tab', trainingDose: '2 tabs', restDose: '1 tab' },
      ],
    })
    // v2 folded the split into one sentence; v3 states it as the two columns it
    // is, which is the same rule without a clause to parse.
    const mv = rowFor(out, 'SUPPS', '09:00')
    expect([mv.dose, mv.training_dose, mv.rest_dose]).toEqual(['1 tab', '2 tabs', '1 tab'])
    expect(sectionText(out, 'SUPPS').match(/Multivitamin/g)).toHaveLength(1)
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
    expect(rowFor(out, 'SUPPS', '15:00').training_only).toBe('0')
    expect(rowsOf(out, 'SUPPS').filter((r) => r.training_only === '1')).toHaveLength(2)
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
    expect(sectionText(out, 'SUPPS').match(/reatine/g)).toHaveLength(1)
    expect(rowFor(out, 'SUPPS', '11:45').name).toBe('L-Citrulline')
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
    // Flagged rather than numbered — `W` says which token was the warm-up, and
    // the working set beside it is untouched.
    expect(setsOf(out, '2026-07-19', 'Leg Press')).toEqual(['40×10W', '70×12'])
  })

  it('states a missing session effort rather than omitting the segment', () => {
    const out = buildWeeklyExport({
      ...input,
      sessions: [{ ...input.sessions[0], sessionRpe: null }],
    })
    // `—` is this document's word for "not reported", and it is never a 0.
    expect(sessionBlock(out, '2026-07-19').row.srpe).toBe(DASH)
  })

  it('includes soreness', () => {
    expect(dayRow(buildWeeklyExport(input), '2026-07-20').doms).toBe('Quads:2')
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
        { date: '2026-07-19', kind: 'walk', distanceM: 3000, durationMin: 30, kcal: 150, totalKcal: null, avgHr: null, effort: null },
        { date: '2026-07-21', kind: 'run', distanceM: 5000, durationMin: 25, kcal: 320, totalKcal: null, avgHr: null, effort: null },
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
    // Nothing sore, and the day says so with a dash rather than by omission.
    expect(weeklySummary(in_).peakDoms).toBeNull()
    expect(rowsOf(out, 'DAYS').every((r) => r.doms === DASH)).toBe(true)
    // And the aggregates sit BELOW the log they summarise, not above it.
    expect(out.indexOf('\n## DAYS')).toBeLessThan(out.indexOf('\n## WEEK'))
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
    expect(dayRow(out, '2026-07-21').doms).toBe('Quads:3')
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
    // The programme and the week number identify the DOCUMENT, so v3 states
    // them once on the header rather than again over the table.
    expect(headerCells(out)[0]).toBe('# ONYX Week 3')
    expect(headerCells(out)[2]).toBe('Helix Cut')
    expect(sectionLines(out, 'LEDGER')[0])
      .toBe('## LEDGER · every week of the programme, oldest first')
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

  it('closes the export — the evidence is read before the trend', () => {
    const out = buildWeeklyExport(base({
      sessions: [session(8000)],
      ledger: [week('Week 3', '2026-08-02')],
    }))
    expect(out.indexOf('\n## DAYS')).toBeLessThan(out.indexOf('\n## LEDGER'))
    expect(out.indexOf('\n## SESSIONS')).toBeLessThan(out.indexOf('\n## LEDGER'))
    expect(out.indexOf('\n## WEEK')).toBeLessThan(out.indexOf('\n## LEDGER'))
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
    expect(headings(out)).toContain('## WEEK.MUSCLE')
    expect(legendOf(out, 'WEEK.MUSCLE'))
      .toEqual(['muscle', 'sets', 'target', 'direct', 'indirect', 'tonnage_kg', 'direct_kg'])
    expect(rowFor(out, 'WEEK.MUSCLE', 'Quads').tonnage_kg).toBe('22000')
    expect(rowFor(out, 'WEEK.MUSCLE', 'Chest').tonnage_kg).toBe('15000')
    // And it sits below the daily evidence, with the rest of the aggregates.
    expect(out.indexOf('\n## DAYS')).toBeLessThan(out.indexOf('\n## WEEK.MUSCLE'))
  })

  it('prints the week total at full precision, matching the Session page', () => {
    // 3571.25 is the Aug 5 session exactly. `n()` would have rounded it to 3571
    // and the export would disagree with the screen about the same workout.
    const out = buildWeeklyExport(base({ sessions: [session({ volumeKg: 3571.25 })] }))
    expect(weekRow(out).tonnage_kg).toBe('3571.25')
    expect(weekRow(out).sessions).toBe('1')
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
    const perMuscle = rowsOf(out, 'WEEK.MUSCLE')
      .reduce((n, r) => n + Number(r.tonnage_kg), 0)
    expect(perMuscle).toBe(1800)
    expect(Number(weekRow(out).tonnage_kg)).toBe(1000)
    expect(perMuscle).toBeGreaterThan(Number(weekRow(out).tonnage_kg))
    expect(out.indexOf('\n## WEEK ')).toBeLessThan(out.indexOf('\n## WEEK.MUSCLE'))
  })

  // ── Energy balance ──
  it('estimates the weekly deficit from BMR + active + TEF vs intake', () => {
    // 1900 in; out = 1500 BMR + 600 active + 199.5 TEF = 2299.5. Twice.
    const days = [
      day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
    ]
    const out = buildWeeklyExport(base({ days }))
    const energy = derivedWeekRow(out)
    // The SIGN is the word: negative is a deficit, and the figure is never
    // restated as an absolute value beside a shouted noun.
    expect(energy.balance_kcal).toBe('-799')
    expect(energy.balance_kcal_day).toBe('-399')
    expect(energy.energy_days).toBe('2')
    expect(energy.tdee_avg).toBe('2300')     // 4599 kcal out over the two days
    // Each term of that 2300 is stated beside it, so the estimate can be
    // audited rather than taken: 1500 + 600 + 199.5.
    expect([energy.bmr_avg, energy.active_avg, energy.tef_avg])
      .toEqual(['1500', '600', '200'])
    // The intake side is a MEASUREMENT and stays above the fence.
    expect(weekRow(out).kcal_avg).toBe('1900')
  })

  it('names TEF in the breakdown, and states the rate it used', () => {
    // The whole point of the term is that it is visible. A TDEE that silently
    // grew by 200 kcal/day would look like a data error, not a correction.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 2000, bmrKcal: 1500, activeKcal: 600 })],
    }))
    // 1500 + 600 + 210 = 2310, stated per day under the fence and averaged on
    // the `## WEEK` row — the two must be the same arithmetic.
    expect(derivedRow(out, 'tdee')).toEqual(['2310'])
    expect(derivedWeekRow(out).tdee_avg).toBe('2310')
    // The term has its own column, so it can never be folded invisibly into
    // the total…
    expect(derivedWeekRow(out).tef_avg).toBe('210')
    // …and it is NAMED, with the rate it used, so a TDEE that silently grew by
    // 200 kcal/day reads as a correction rather than a data error.
    expect(howLine(out)).toContain('intake × 0.105')
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
    expect(derivedWeekRow(out).energy_days).toBe('1')
    expect(derivedWeekRow(out).energy_excluded).toBe('2026-07-20')
    expect(derivedWeekRow(out).tdee_avg).toBe('2310')
    // 210, not 315: the TEF is the counted day's own, never the week's.
    expect(derivedWeekRow(out).tef_avg).toBe('210')
    // The uncounted day still has a tdee of its own — BMR and active energy
    // are both there — but no TEF to add, and no intake to balance it against.
    expect(derivedRow(out, 'tdee')).toEqual(['2310', DASH])
  })

  it('names a surplus a surplus', () => {
    // 3000 in; out = 1500 + 500 + 315 TEF = 2315.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 3000, bmrKcal: 1500, activeKcal: 500 })],
    }))
    // A surplus is a POSITIVE balance. The same column says both, which is why
    // the sign can never disagree with the noun.
    expect(derivedWeekRow(out).balance_kcal).toBe('685')
    expect(derivedWeekRow(out).balance_kcal_day).toBe('685')
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
    expect(derivedWeekRow(out).energy_days).toBe('2')   // the un-weighed day counts
    expect(derivedWeekRow(out).energy_excluded).toBe(DASH)
    // …and it SAYS SO in its own column, rather than leaving the reader to
    // notice that a day with no scale reading was counted anyway.
    expect(derivedWeekRow(out).bmr_carried).toBe('1')
    // A week where every day was weighed says 0, so the flag means something.
    const weighed = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(derivedWeekRow(weighed).bmr_carried).toBe('0')
    // And the document states the rule on the line that explains tdee.
    expect(howLine(out)).toContain('BMR (from the scale, carried across gaps)')
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
    expect(derivedWeekRow(out).energy_days).toBe('1')
    expect(derivedWeekRow(out).energy_excluded).toBe('2026-07-20;2026-07-21')
  })

  it('skips the balance entirely rather than reporting half a week as zero', () => {
    const out = buildWeeklyExport(base({ days: [day({ calories: 1900 })] }))
    // No expenditure side at all, so the cell is `—` rather than 0 — and the
    // day it could not use is named.
    const energy = derivedWeekRow(out)
    expect(energy.balance_kcal).toBe(DASH)
    expect(energy.tdee_avg).toBe(DASH)
    for (const k of ['bmr_avg', 'active_avg', 'tef_avg']) expect(energy[k]).toBe(DASH)
    expect(energy.energy_days).toBe('0')
    expect(energy.energy_excluded).toBe('2026-07-19')
  })

  it('flags the balance as an estimate wherever it appears', () => {
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1900, bmrKcal: 1500, activeKcal: 600 })],
    }))
    // The expenditure the balance is struck against is Onyx's own arithmetic
    // over three estimates, so the WHOLE balance sits under the fence — not
    // beside the measured intake on `## WEEK`, which is where it spent one
    // draft. The heading says what everything below it is.
    expect(sectionLines(out, 'DERIVED')[0]).toContain('computed by Onyx — not measured')
    expect(out.indexOf('\n## DERIVED')).toBeLessThan(out.indexOf('\n## DERIVED.WEEK'))
    expect(weekRow(out).balance_kcal).toBeUndefined()
    // …and the `##   how` line names every term of it.
    expect(howLine(out)).toContain('tdee = BMR')
    expect(howLine(out)).toContain('heart rate, calories and steps come off the Apple Watch and are estimates')
    // The averaged figure is that same tdee, so a reader who checks one
    // against the other cannot find two numbers.
    expect(derivedWeekRow(out).tdee_avg).toBe(derivedRow(out, 'tdee')[0])
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
    expect(weekRow(out).steps_avg).toBe('11000')
    expect(headings(out)).not.toContain('## CARDIO')
    expect(rowsOf(out, 'DAYS').map((r) => r.steps)).toEqual(['10000', '12000', DASH])
  })

  // ── The week NAMES ITSELF, or says WEEK — never "Week undefined" ──
  //
  // The three closing notes this block used to pin — the prior-report pointer,
  // the Epley caveat and the Apple Watch caveat — were retired with v2. The two
  // that qualify a printed number now ride on the legend of the section that
  // prints it, and that move is pinned once, in `export-layout.test.ts`.
  it('falls back to unnumbered wording rather than printing "Week undefined"', () => {
    expect(headerCells(buildWeeklyExport(base({ weekLabel: 'Week 5' })))[0])
      .toBe('# ONYX Week 5')
    const out = buildWeeklyExport(base())
    expect(headerCells(out)[0]).toBe('# ONYX WEEK')
    expect(out).not.toMatch(/undefined/)
    // A label of pure whitespace is a missing label, not a name.
    expect(headerCells(buildWeeklyExport(base({ weekLabel: '  ' })))[0]).toBe('# ONYX WEEK')
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
    // v2 relabelled the day "Workout (off-plan / swapped)". v3's `train` column
    // reports the PLAN and nothing else, and the swap is visible as the join:
    // a session row exists on a day the template called a rest day.
    expect(dayRow(out, '2026-08-05').train).toBe('0')
    const swapped = sessionBlock(out, '2026-08-05')
    expect(swapped.row.label).toBe('Delts & Arms')
    expect(swapped.row.day).toBe('Wed')
    // The work is attributed to the day it happened on, which is the fact the
    // relabelling existed to carry.
    expect(rowsOf(out, 'SESSIONS').map((r) => r.date)).toEqual(['2026-08-05'])
  })

  it('leaves an ordinary training day unmarked', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-07-20', weekdayLabel: 'Mon', isTrainingDay: true })],
      sessions: [session({ date: '2026-07-20', label: 'Legs & Core A' })],
    }))
    expect(dayRow(out, '2026-07-20').train).toBe('1')
    expect(sessionBlock(out, '2026-07-20').row.label).toBe('Legs & Core A')
    expect(out).not.toMatch(/off-plan/)
  })

  it('keeps calling an unworked rest day a rest day', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-04', weekdayLabel: 'Tue', isTrainingDay: false })],
    }))
    // `0` and nothing else — v2 used to read "Rest · rest", the word twice, and
    // v3 states the fact once, in one character, in a named column.
    expect(dayRow(out, '2026-08-04').train).toBe('0')
    expect(headings(out)).not.toContain('## SESSIONS')
    // Scoped to the log itself: `rest_dose` and `rest_target` are legend words
    // in other sections and are not verdicts about a day.
    expect(sectionText(out, 'DAYS')).not.toMatch(/rest/i)
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
    expect(dataLines(out, 'BODY')).toHaveLength(1)
    const row = bodyRow(out, '2026-08-02')
    expect([row.smm_kg, row.whr]).toEqual(['26.8', '0.80'])
    for (const k of ['weight_kg', 'fat_pct', 'fat_mass_kg', 'muscle_mass_kg', 'ffm_kg']) {
      expect(row[k], `${k} without a weight`).toBe(DASH)
    }
    // The day line still tells the whole truth about the day.
    expect(dayRow(out, '2026-08-02').tags).toBe('skip:As Planned')
  })

  it('still prints the reading the moment a weight is present', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-02', weekdayLabel: 'Sun', weightKg: 64.2 })],
      bodyComp: [body({ date: '2026-08-02', weightKg: 64.2, bodyFatPct: 17.3, skeletalMuscleMassKg: 26.8 })],
    }))
    const row = bodyRow(out, '2026-08-02')
    expect(row.weight_kg).toBe('64.2')
    expect(row.fat_pct).toBe('17.3')
    expect(row.smm_kg).toBe('26.8')
    // The absent compartments dash rather than vanish — an omitted field is
    // indistinguishable from a zero to whoever reads this.
    expect(row.muscle_mass_kg).toBe(DASH)
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
    expect([row.weight_kg, row.bmi, row.fat_pct]).toEqual(['64.5', '22.3', '17.6'])
    expect([row.muscle_pct, row.muscle_mass_kg]).toEqual(['78.0', '50.3'])
    expect([row.ffm_kg, row.smm_kg]).toEqual(['53.1', '26.6'])
    // The ones the scale did not report stay dashed on the same line.
    expect(row.water_pct).toBe(DASH)
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
    expect(rowsOf(buildWeeklyExport(in_), 'SESSIONS').map((r) => r.srpe))
      .toEqual(['8', '9', DASH])
  })

  it('says "not rated" rather than scoring an unrated week 0', () => {
    const in_ = base({ sessions: [session({ sessionRpe: null })] })
    // Null, never 0 — an unrated week is unmeasured, not effortless.
    expect(weeklySummary(in_).avgSessionRpe).toBeNull()
    expect(weeklySummary(in_).ratedSessions).toBe(0)
    expect(rowsOf(buildWeeklyExport(in_), 'SESSIONS')[0].srpe).toBe(DASH)
  })

  it('does not let an unrated session drag the mean down', () => {
    const in_ = base({ sessions: [session({ sessionRpe: 9 }), session({ sessionRpe: null })] })
    expect(weeklySummary(in_).avgSessionRpe).toBe(9)
    expect(weeklySummary(in_).ratedSessions).toBe(1)
    // Two sessions, one rating — the document says so rather than implying the
    // rating covered both.
    expect(rowsOf(buildWeeklyExport(in_), 'SESSIONS').map((r) => r.srpe)).toEqual(['9', DASH])
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
    const steps = rowsOf(out, 'DAYS').map((r) => r.steps)
    expect(steps).toEqual(['12000', '6000', DASH])
    // A rest day is a REAL zero for volume — no training happened — and it
    // shows as the absence of a session row rather than as an invented 0.
    expect(rowsOf(out, 'SESSIONS').map((r) => r.date)).toEqual(['2026-08-02'])
    expect(weekRow(out).tonnage_kg).toBe('4000')
    // The series the bars were drawn from is still exactly one glyph per day.
    expect(sparkline(steps.map((v) => (v === DASH ? null : Number(v))))).toBe('█▅·')
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
    // Both days did 2000 kg. v3 prints each session on its own row — that is
    // the evidence — and the per-day sum has to come out equal, or any reading
    // of the week is a lie.
    const byDate = new Map<string, number>()
    for (const r of rowsOf(out, 'SESSIONS')) {
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.tonnage_kg))
    }
    expect([...byDate.values()]).toEqual([2000, 2000])
    // And the week's own total counts each session once, not each day once.
    expect(weekRow(out).tonnage_kg).toBe('4000')
    expect(weekRow(out).sessions).toBe('3')
  })
})
