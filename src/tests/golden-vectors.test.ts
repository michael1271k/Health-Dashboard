import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { epley1RM } from '@/lib/utils/epley'
import { tefKcal, tdeeKcal, TEF_FACTOR } from '@/lib/nutrition/energy'
import { computeReadiness } from '@/lib/scoring/readiness'
import {
  BATTERY, MAX_TOTAL_DRAIN, MAINTENANCE_DRAIN_FACTOR, MAINTENANCE_REL_MIN,
  workoutMaxFor, relMinFor, computeMorningCharge, computeSleepQuality,
  timeDrain, workoutDrain, computeBattery,
} from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'
import { derivePhase, resolveDayPhase, type Phase } from '@/lib/nutrition/phase'
import { exceptionReason, isExceptionDay, exceptionTag, estimatedTag } from '@/lib/nutrition/exceptionDay'

/**
 * THE GOLDEN VECTORS — the acceptance spec for the Swift port.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * The native migration reimplements this app's arithmetic in Swift. That
 * arithmetic is the part of HELIX that breaks silently: a formula that is 3%
 * wrong renders a number that looks completely normal, and this codebase has a
 * long record of exactly that failure — the unloaded-work `weight === 0` blind
 * spot that printed "1RM 0" for months, the TDEE that omitted TEF and made every
 * deficit ~200 kcal/day too small, the battery v6 whose drain budget exceeded
 * its charge budget so a leg day floored before bedtime.
 *
 * None of those were caught by looking at the screen. All of them would have
 * been caught by a fixture.
 *
 * So: this file runs the TypeScript implementation over a fixed set of inputs
 * and writes `{ input, expected }` pairs to the Swift test target's resources.
 * `swift test` replays them against the port. The TypeScript stays the
 * definition of correct; Swift has to agree with it, case by case, or the
 * native build fails.
 *
 * ── TWO MODES, AND WHY THE DEFAULT IS "CHECK" ────────────────────────────────
 * `npm test` runs this in CHECK mode: it regenerates the vectors in memory and
 * fails if they differ from what is checked in. That makes a silent change to a
 * formula impossible to land — you either intended it (and regenerate) or you
 * did not (and the suite tells you). `npm run golden` regenerates.
 *
 * This mirrors `atlas-parity.test.ts`, which already guards the generated Swift
 * body atlas the same way, for the same reason: one source of truth, mechanically
 * enforced, because two hand-maintained copies of the same thing both look right.
 *
 * ── ON CHOOSING CASES ────────────────────────────────────────────────────────
 * Grids for coverage, plus NAMED regression cases drawn from the incidents the
 * module comments describe. A grid alone would have missed every historical bug
 * in this file, because each of them lived at a specific, unremarkable-looking
 * input.
 */

const FIXTURES = join(
  process.cwd(),
  'native/Packages/HelixCore/Tests/HelixCoreTests/Fixtures',
)

const WRITE = process.env.GOLDEN_WRITE === '1'

interface Case<I, E> { name: string; input: I; expected: E }
interface Fixture<I, E> {
  module: string
  fn: string
  /** A note for whoever reads the JSON without this file open. */
  note: string
  cases: Case<I, E>[]
}

/**
 * Write in write-mode; otherwise assert the checked-in file already says this.
 *
 * The comparison is on the serialized string, not the parsed object, so a
 * reordering that would change what Swift decodes is still a failure.
 */
function emit<I, E>(fileName: string, fixture: Fixture<I, E>): void {
  const serialized = JSON.stringify(fixture, null, 2) + '\n'
  const path = join(FIXTURES, fileName)

  if (WRITE) {
    mkdirSync(FIXTURES, { recursive: true })
    writeFileSync(path, serialized, 'utf8')
    return
  }

  expect(existsSync(path), `${fileName} is missing — run \`npm run golden\``).toBe(true)
  const onDisk = readFileSync(path, 'utf8')
  // The message matters more than the diff here: a failure in CI reads as
  // "someone changed a formula", and the fix is either to regenerate or to
  // revert, never to edit the JSON by hand.
  expect(
    onDisk,
    `${fileName} is stale. A domain formula changed without regenerating the ` +
    `golden vectors. Run \`npm run golden\` and review the diff — it is the ` +
    `list of behaviours the Swift port must now match.`,
  ).toBe(serialized)
}

// ─────────────────────────────────────────────────────────────────────────────
// Epley
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — epley1RM', () => {
  it('exports the estimated-1RM vectors', () => {
    const cases: Case<{ weight: number; reps: number }, number | null>[] = []

    const weights = [0, -5, -0.1, 0.5, 1, 20, 60, 82.5, 100, 142.5, 1000]
    const reps = [1, 2, 3, 5, 8, 12, 17, 30, 100]
    for (const weight of weights) {
      for (const r of reps) {
        cases.push({
          name: `w=${weight} r=${r}`,
          input: { weight, reps: r },
          expected: epley1RM(weight, r),
        })
      }
    }

    // ── Named regressions ────────────────────────────────────────────────────
    cases.push({
      // The incident the module header describes: a bodyweight set rendered
      // "1RM 0" and flattened the whole movement's progress chart.
      name: 'regression: Reverse Crunch 0 kg × 17 has no 1RM to estimate',
      input: { weight: 0, reps: 17 },
      expected: epley1RM(0, 17),
    })
    cases.push({
      name: 'regression: a single rep returns the weight unrounded',
      input: { weight: 142.5, reps: 1 },
      expected: epley1RM(142.5, 1),
    })
    cases.push({
      name: 'regression: a negative load has no meaningful estimate',
      input: { weight: -12, reps: 5 },
      expected: epley1RM(-12, 5),
    })

    emit('epley.json', {
      module: 'utils/epley',
      fn: 'epley1RM',
      note: 'null means "no estimate exists", never 0. Every caller null-checks.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Energy — TEF and TDEE
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — energy', () => {
  it('exports the TEF vectors', () => {
    const intakes: (number | null)[] = [null, 0, 1, 1200, 1900, 2445, 3000, 5000.5]
    const cases = intakes.map((intakeKcal) => ({
      name: `intake=${intakeKcal}`,
      input: { intakeKcal },
      expected: tefKcal(intakeKcal),
    }))

    emit('tef.json', {
      module: 'nutrition/energy',
      fn: 'tefKcal',
      note: `TEF_FACTOR is ${TEF_FACTOR}. Null intake gives null — never 0.`,
      cases,
    })
  })

  it('exports the TDEE vectors', () => {
    const cases: Case<
      { bmr: number | null; active: number | null; intakeKcal: number | null },
      number | null
    >[] = []

    const bmrs: (number | null)[] = [null, 1500, 1720]
    const actives: (number | null)[] = [null, 0, 400, 890]
    const intakes: (number | null)[] = [null, 0, 1900, 2445]
    for (const bmr of bmrs) {
      for (const active of actives) {
        for (const intakeKcal of intakes) {
          cases.push({
            name: `bmr=${bmr} active=${active} intake=${intakeKcal}`,
            input: { bmr, active, intakeKcal },
            expected: tdeeKcal(bmr, active, intakeKcal),
          })
        }
      }
    }

    cases.push({
      // The all-or-nothing rule. A missing active-energy sync must NOT silently
      // report a 400 kcal larger deficit than the day earned.
      name: 'regression: a missing component yields null, not a partial total',
      input: { bmr: 1500, active: null, intakeKcal: 1900 },
      expected: tdeeKcal(1500, null, 1900),
    })

    emit('tdee.json', {
      module: 'nutrition/energy',
      fn: 'tdeeKcal',
      note: 'TDEE = BMR + active + TEF. All three required; a null propagates, a zero lies.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Battery — the module with the most history
// ─────────────────────────────────────────────────────────────────────────────

/** A full `ScoringInputs` with only the battery-relevant fields varied. */
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

describe('golden vectors — battery', () => {
  it('exports the constants the port must not drift from', () => {
    emit('battery-constants.json', {
      module: 'scoring/battery',
      fn: 'BATTERY',
      note:
        'The drain budget must stay strictly under the charge budget. v6 broke ' +
        'exactly this (104.2 against 100) and a leg day floored before bedtime.',
      cases: [{
        name: 'constants',
        input: {},
        expected: {
          floor: BATTERY.floor,
          wakeMin: BATTERY.wakeMin,
          wakeRange: BATTERY.wakeRange,
          timeMax: BATTERY.timeMax,
          activityCap: BATTERY.activityCap,
          workoutMax: BATTERY.workoutMax,
          defaultRpe: BATTERY.defaultRpe,
          relMin: BATTERY.relMin,
          relMax: BATTERY.relMax,
          maxAwake: BATTERY.maxAwake,
          maxTotalDrain: MAX_TOTAL_DRAIN,
          maintenanceDrainFactor: MAINTENANCE_DRAIN_FACTOR,
          maintenanceRelMin: MAINTENANCE_REL_MIN,
        },
      }],
    })
  })

  it('exports workoutMaxFor / relMinFor vectors', () => {
    const cases: Case<{ dayKey: string | null; maintenance: boolean }, number>[] = []
    const days: (string | null)[] = [null, 'legs_a', 'legs_b', 'cb_a', 'cb_b', 'arms', 'unknown_day']
    for (const dayKey of days) {
      for (const maintenance of [false, true]) {
        cases.push({
          name: `day=${dayKey} maintenance=${maintenance}`,
          input: { dayKey, maintenance },
          expected: workoutMaxFor(dayKey, maintenance),
        })
      }
    }
    emit('workout-max.json', {
      module: 'scoring/battery',
      fn: 'workoutMaxFor',
      note: 'Keyed on day_key (the programme day), never on split_day — splitDay does not drain.',
      cases,
    })

    emit('rel-min.json', {
      module: 'scoring/battery',
      fn: 'relMinFor',
      note: 'A LOWER floor can only ever lower a drain, which is what keeps MAX_TOTAL_DRAIN an upper bound.',
      cases: [false, true].map((maintenance) => ({
        name: `maintenance=${maintenance}`,
        input: { maintenance },
        expected: relMinFor(maintenance),
      })),
    })
  })

  it('exports sleep-quality and morning-charge vectors', () => {
    const cases: Case<ScoringInputs, { quality: number; morningCharge: number }>[] = []

    const grid: Partial<ScoringInputs>[] = [
      { sleepHours: 0, deepMinutes: 0, sleepGoalHours: 8 },
      { sleepHours: 4, deepMinutes: 20, sleepGoalHours: 8 },
      { sleepHours: 6.5, deepMinutes: 45, sleepGoalHours: 8 },
      { sleepHours: 8, deepMinutes: 75, sleepGoalHours: 8 },
      { sleepHours: 9.5, deepMinutes: 120, sleepGoalHours: 8 },
      // sleepGoalHours 0 takes the `? :` fallback branch (ratio = 1).
      { sleepHours: 3, deepMinutes: 10, sleepGoalHours: 0 },
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 52, baselineHR: 52 },
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 72, baselineHR: 52 },
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 82, baselineHR: 52 },
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 45, baselineHR: 52 },
      // A present-but-zero reading must take the same branch as an absent one:
      // the TypeScript guard is `if (inputs.restingHR && inputs.baselineHR)`.
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 0, baselineHR: 52 },
      { sleepHours: 7, deepMinutes: 60, sleepGoalHours: 8, restingHR: 60, baselineHR: 0 },
    ]

    for (const over of grid) {
      // The FULL inputs object, not the partial: Swift's synthesized `Decodable`
      // requires every non-optional key to be present, and a fixture the port
      // cannot decode is a fixture that tests nothing.
      const full = inputs(over)
      const quality = computeSleepQuality(full)
      cases.push({
        name: JSON.stringify(over),
        input: full,
        expected: { quality, morningCharge: computeMorningCharge(quality) },
      })
    }

    emit('sleep-quality.json', {
      module: 'scoring/battery',
      fn: 'computeSleepQuality + computeMorningCharge',
      note: '70% duration vs goal, 15% deep sleep, 15% resting HR vs baseline. Wake charge = 55 + 45·q.',
      cases,
    })
  })

  it('exports time-drain vectors', () => {
    const hours = [0, 0.5, 1, 3, 6, 8, 10, 12, 14, 16, 17.9, 18, 19, 24, -3]
    emit('time-drain.json', {
      module: 'scoring/battery',
      fn: 'timeDrain',
      note: 'A raised cosine, not a line: little before hour 6, most between 8 and 14, flat late. Monotonic.',
      cases: hours.map((hoursAwake) => ({
        name: `awake=${hoursAwake}`,
        input: { hoursAwake },
        expected: timeDrain(hoursAwake),
      })),
    })
  })

  it('exports workout-drain vectors', () => {
    const cases: Case<{
      sessionVolumeKg: number
      trailingAvgVolumeKg: number
      sessionRpe: number | null
      dayKey: string | null
      maintenance: boolean
    }, number>[] = []

    const volumes = [0, -100, 1000, 3400, 8000, 12712, 13072.5, 25000]
    const trailings = [0, 3400, 12712]
    const rpes: (number | null)[] = [null, 0, 3, 6, 7, 9, 10]
    const days: (string | null)[] = [null, 'legs_a', 'cb_a', 'arms']

    for (const sessionVolumeKg of volumes) {
      for (const trailingAvgVolumeKg of trailings) {
        for (const sessionRpe of rpes) {
          for (const dayKey of days) {
            for (const maintenance of [false, true]) {
              cases.push({
                name: `v=${sessionVolumeKg} t=${trailingAvgVolumeKg} rpe=${sessionRpe} day=${dayKey} m=${maintenance}`,
                input: { sessionVolumeKg, trailingAvgVolumeKg, sessionRpe, dayKey, maintenance },
                expected: workoutDrain(
                  sessionVolumeKg, trailingAvgVolumeKg, sessionRpe, dayKey, maintenance,
                ),
              })
            }
          }
        }
      }
    }

    // ── Named regressions, straight out of the module's own history ──────────
    cases.push({
      // 2026-08-10, legs_a, 13,072.5 kg against a 12,712 kg trailing average,
      // logged RPE 7. Under v6 this read 16% at 16:58 on a day that scored 98.
      name: 'regression: 2026-08-10 legs_a is a 1.03x TYPICAL leg day, not a maximal one',
      input: {
        sessionVolumeKg: 13072.5, trailingAvgVolumeKg: 12712,
        sessionRpe: 7, dayKey: 'legs_a', maintenance: false,
      },
      expected: workoutDrain(13072.5, 12712, 7, 'legs_a', false),
    })
    cases.push({
      // The worked case in MAINTENANCE_REL_MIN's comment: a legs day at 45% of
      // normal, RPE 6, which the old floor charged as though it were 60%.
      name: 'regression: maintenance legs day at 45% of normal, RPE 6',
      input: {
        sessionVolumeKg: 12712 * 0.45, trailingAvgVolumeKg: 12712,
        sessionRpe: 6, dayKey: 'legs_a', maintenance: true,
      },
      expected: workoutDrain(12712 * 0.45, 12712, 6, 'legs_a', true),
    })
    cases.push({
      // Absent RPE is not zero RPE: a session you forgot to rate still happened.
      name: 'regression: absent RPE falls back to defaultRpe, not to zero',
      input: {
        sessionVolumeKg: 8000, trailingAvgVolumeKg: 8000,
        sessionRpe: null, dayKey: 'cb_a', maintenance: false,
      },
      expected: workoutDrain(8000, 8000, null, 'cb_a', false),
    })
    cases.push({
      // No history to compare against means "assume typical", not "assume huge".
      name: 'regression: no trailing average assumes a typical session',
      input: {
        sessionVolumeKg: 25000, trailingAvgVolumeKg: 0,
        sessionRpe: 8, dayKey: 'legs_a', maintenance: false,
      },
      expected: workoutDrain(25000, 0, 8, 'legs_a', false),
    })

    emit('workout-drain.json', {
      module: 'scoring/battery',
      fn: 'workoutDrain',
      note: 'Relative to your own normal for this day type, scaled by logged RPE. Maintenance never scales the effort term.',
      cases,
    })
  })

  it('exports whole-battery vectors', () => {
    const cases: Case<
      { inputs: ScoringInputs; hoursAwakeArg: number | null },
      { morningCharge: number; currentPct: number }
    >[] = []

    const grid: (Partial<ScoringInputs> & { hoursAwakeArg?: number })[] = [
      {},
      { hoursAwake: 0 },
      { hoursAwake: 8 },
      { hoursAwake: 16 },
      { hoursAwake: 18 },
      { hoursAwake: 24 },
      { steps: 12000, activeCal: 700, hoursAwake: 12 },
      { steps: 30000, activeCal: 2000, hoursAwake: 12 },
      { sleepHours: 4, deepMinutes: 10, hoursAwake: 14 },
      { sleepHours: 9, deepMinutes: 100, hoursAwake: 6 },
      // The argument overrides the field — both paths must agree.
      { hoursAwake: 4, hoursAwakeArg: 15 },
      {
        sleepHours: 8, deepMinutes: 90, steps: 9000, activeCal: 600, hoursAwake: 11,
        sessionVolumeKg: 13072.5, trailingAvgVolumeKg: 12712, sessionRpe: 7,
        sessionDayKey: 'legs_a',
      },
      {
        sleepHours: 8, deepMinutes: 90, steps: 9000, activeCal: 600, hoursAwake: 11,
        sessionVolumeKg: 5720, trailingAvgVolumeKg: 12712, sessionRpe: 6,
        sessionDayKey: 'legs_a', isMaintenance: true,
      },
      // Floor and ceiling: nothing may leave the 5..100 band.
      {
        sleepHours: 0, deepMinutes: 0, steps: 40000, activeCal: 3000, hoursAwake: 18,
        sessionVolumeKg: 30000, trailingAvgVolumeKg: 10000, sessionRpe: 10,
        sessionDayKey: 'legs_a',
      },
      { sleepHours: 12, deepMinutes: 200, hoursAwake: 0 },
    ]

    for (const over of grid) {
      const { hoursAwakeArg, ...fields } = over
      const full = inputs(fields)
      const state = computeBattery(full, hoursAwakeArg)
      cases.push({
        name: JSON.stringify(over),
        // Full inputs plus the explicit argument, which overrides the field —
        // both paths into `hoursAwake` have to agree and both are exercised.
        input: { inputs: full, hoursAwakeArg: hoursAwakeArg ?? null },
        expected: state,
      })
    }

    emit('battery.json', {
      module: 'scoring/battery',
      fn: 'computeBattery',
      note: 'Drain-only. There is no recharge term, so eating breakfast can never make the battery jump.',
      cases,
    })
  })

  it('holds the invariant v6 broke', () => {
    // Asserted on BOTH sides. `Invariants.swift` in the Swift test target makes
    // the identical claim; if a constant is edited in one language only, the
    // fixture diff catches the drift and this catches the danger.
    expect(MAX_TOTAL_DRAIN).toBeLessThan(100 - BATTERY.floor)
    expect(MAINTENANCE_DRAIN_FACTOR).toBeLessThan(1)
    expect(MAINTENANCE_REL_MIN).toBeLessThan(BATTERY.relMin)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Readiness
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — readiness', () => {
  it('exports the readiness vectors', () => {
    const cases: Case<
      { sleepScore: number | null; recoveryScore: number | null; batteryPct: number },
      ReturnType<typeof computeReadiness>
    >[] = []

    const sleeps: (number | null)[] = [null, 0, 30, 45, 60, 70, 85, 100]
    const recoveries: (number | null)[] = [null, 0, 40, 70, 100]
    const batteries = [0, 5, 45, 55, 70, 88, 100]

    for (const sleepScore of sleeps) {
      for (const recoveryScore of recoveries) {
        for (const batteryPct of batteries) {
          cases.push({
            name: `s=${sleepScore} r=${recoveryScore} b=${batteryPct}`,
            input: { sleepScore, recoveryScore, batteryPct },
            expected: computeReadiness({ sleepScore, recoveryScore }, batteryPct),
          })
        }
      }
    }

    // The two thresholds, hit exactly. `>=` on both, so 70 is train_hard and 45
    // is train_light — an off-by-one here changes the advice the app gives.
    cases.push({
      name: 'boundary: exactly 70 is train_hard',
      input: { sleepScore: 70, recoveryScore: 70, batteryPct: 70 },
      expected: computeReadiness({ sleepScore: 70, recoveryScore: 70 }, 70),
    })
    cases.push({
      name: 'boundary: exactly 45 is train_light',
      input: { sleepScore: 45, recoveryScore: 45, batteryPct: 45 },
      expected: computeReadiness({ sleepScore: 45, recoveryScore: 45 }, 45),
    })
    cases.push({
      // A day with no sensor data must not crater into a false "Rest Today".
      name: 'regression: null sleep and recovery fall back to the battery',
      input: { sleepScore: null, recoveryScore: null, batteryPct: 88 },
      expected: computeReadiness({ sleepScore: null, recoveryScore: null }, 88),
    })

    emit('readiness.json', {
      module: 'scoring/readiness',
      fn: 'computeReadiness',
      note: 'Sleep 40%, battery 40%, recovery 20%. >=70 train hard, >=45 train light.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Nutrition phase — the calorie bands, and the flag that suspends them
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — nutrition phase', () => {
  it('exports the derived-phase vectors', () => {
    const cases: Case<{ calories: number | null }, Phase | null>[] = []

    // Every band, and every boundary of every band. The thresholds are `<=` and
    // `<`, which is the kind of asymmetry a port silently normalizes.
    const calories = [
      null, 0, -1, -2400, 0.5, 1, 1200, 1900, 2049, 2049.9, 2050, 2050.1,
      2051, 2200, 2449, 2449.9, 2450, 2450.1, 3200, 10000,
    ]
    for (const c of calories) {
      cases.push({ name: `kcal=${c}`, input: { calories: c }, expected: derivePhase(c) })
    }

    cases.push({
      // Untracked is not a cut. A row with no intake recorded says nothing
      // about the block you are in, and calling it `cut` would put an empty
      // day on the cut curve.
      name: 'regression: zero calories is untracked, not a cut day',
      input: { calories: 0 },
      expected: derivePhase(0),
    })

    emit('nutrition-phase-derive.json', {
      module: 'nutrition/phase',
      fn: 'derivePhase',
      note: 'cut <= 2050 < maintenance < 2450 <= bulk. null means untracked.',
      cases,
    })
  })

  it('exports the resolved-phase vectors', () => {
    interface In {
      calories: number | null
      exception: string | null
      estimated: boolean | null
      activePhase: Phase | null
      stored: Phase | null
    }
    const cases: Case<In, Phase | null>[] = []

    const run = (name: string, i: In) => cases.push({
      name,
      input: i,
      expected: resolveDayPhase({
        calories: i.calories, exception: i.exception, estimated: i.estimated,
        activePhase: i.activePhase, stored: i.stored,
      }),
    })

    // The grid. Five axes, kept to the values that can change the answer.
    for (const calories of [null, 1800, 2150, 2600]) {
      for (const exception of [null, '', 'Social']) {
        for (const estimated of [null, false, true]) {
          for (const activePhase of [null, 'cut', 'bulk'] as (Phase | null)[]) {
            for (const stored of [null, 'maintenance'] as (Phase | null)[]) {
              run(
                `kcal=${calories} exc=${JSON.stringify(exception)} est=${estimated} active=${activePhase} stored=${stored}`,
                { calories, exception, estimated, activePhase, stored },
              )
            }
          }
        }
      }
    }

    // ── Named regressions ────────────────────────────────────────────────────
    run(
      // The incident in the module header. 2,150 kcal on a declared date night
      // in week four of a strict cut was banded `maintenance` by the threshold,
      // filing a cut day under a phase that had not started.
      'regression: 2026-08-11 date night keeps the cut it was eaten in',
      { calories: 2150, exception: 'Social', estimated: true, activePhase: 'cut', stored: null },
    )
    run(
      // A stored value is a cache of this function's own answer, so it wins for
      // an ordinary day — but never for a flagged one, because the rows written
      // before this rule existed carry the misclassification being corrected.
      'regression: a flagged day ignores the stored phase it was written with',
      { calories: 2150, exception: 'Refeed', estimated: null, activePhase: 'cut', stored: 'maintenance' },
    )
    run(
      // Estimated alone qualifies. Reclassifying the block on a guess is the
      // worse of the two directions.
      'regression: estimated alone is enough to hold the phase',
      { calories: 2600, exception: null, estimated: true, activePhase: 'cut', stored: null },
    )
    run(
      // Whitespace is not a reason, so this day is ordinary and bands normally.
      'regression: a whitespace exception does not flag the day',
      { calories: 2600, exception: '   ', estimated: false, activePhase: 'cut', stored: null },
    )
    run(
      // No active phase to hold, so a flagged day is no worse off than before.
      'regression: a flagged day with no active phase falls back to the band',
      { calories: 2600, exception: 'Travel', estimated: null, activePhase: null, stored: null },
    )

    emit('nutrition-phase-resolve.json', {
      module: 'nutrition/phase',
      fn: 'resolveDayPhase',
      note: 'A flagged day (exception OR estimated) keeps the active phase. Labels only — never a term in any score.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Exception day — the declaration, and what it does and does not forgive
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — exception day', () => {
  it('exports the declaration vectors', () => {
    interface Out {
      reason: string | null
      isException: boolean
      tag: string
    }
    const cases: Case<{ stored: string | null }, Out>[] = []

    const stored = [
      null, '', ' ', '   ', '\n', ' \n\t ', 'Event', 'Refeed', 'Travel',
      'Illness', 'Social', ' Social ', 'social', 'Wedding', '0',
    ]
    for (const s of stored) {
      cases.push({
        name: `stored=${JSON.stringify(s)}`,
        input: { stored: s },
        expected: { reason: exceptionReason(s), isException: isExceptionDay(s), tag: exceptionTag(s) },
      })
    }

    cases.push({
      // `stored?.trim() || null` — the falsy-or, not a length check. A day
      // whose reason is the string "0" is a real declaration, and an
      // implementation that reaches for truthiness drops it.
      name: 'regression: the string "0" is a reason, not an absence',
      input: { stored: '0' },
      expected: { reason: exceptionReason('0'), isException: isExceptionDay('0'), tag: exceptionTag('0') },
    })
    cases.push({
      // Anything non-empty is honoured even if it is not a preset: a value
      // written before the list changed must never silently stop counting.
      name: 'regression: an unlisted reason still counts',
      input: { stored: 'Wedding' },
      expected: { reason: exceptionReason('Wedding'), isException: isExceptionDay('Wedding'), tag: exceptionTag('Wedding') },
    })

    emit('exception-day.json', {
      module: 'nutrition/exceptionDay',
      fn: 'exceptionReason / isExceptionDay / exceptionTag',
      note: 'null means an ORDINARY day — the inverse of weighIn.ts, whose absent value means "As Planned".',
      cases,
    })
  })

  it('exports the estimated-tag vectors', () => {
    const cases: Case<{ estimated: boolean | null }, string>[] = []
    for (const e of [null, false, true]) {
      cases.push({ name: `estimated=${e}`, input: { estimated: e }, expected: estimatedTag(e) })
    }
    emit('estimated-tag.json', {
      module: 'nutrition/exceptionDay',
      fn: 'estimatedTag',
      note: 'Orthogonal to the exception. It forgives nothing — uncertainty is reported, never rewarded.',
      cases,
    })
  })
})
