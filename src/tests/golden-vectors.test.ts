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
import {
  computeSleepScore, computeNutritionScore, computeActivityScore, computeWorkoutScore,
  computeHydrationScore, sleepRecoveryMultiplier, computeRecoveryScore,
  computeDailyScore, computeAlerts,
} from '@/lib/scoring/score'
import type { ScoreComponents, ScoringAlert } from '@/lib/scoring/types'
import { sessionVolumeKg, type VolumeSet } from '@/lib/sessions/volume'
import {
  WIDGET_IDS, WIDGET_SIZES, ALL_SIZES, defaultSizeFor, sizesFor, clampSize, defaultLayout,
  fromStored, serializeLayout, tileHeightPx, heightTier, bodyHeightPx,
  placedWidgets, hiddenWidgets, removeFace, addWidget, resizeSlot, moveSlot,
  canStack, stackSlots, unstackFace, reorderFace,
  type DashboardLayout, type DashboardSurface, type WidgetId, type WidgetSize, type StackSlot,
} from '@/lib/dashboard/layout'
import {
  volumeCredits, buildBaselines, detectSessionPrs, recordSets,
  e1rmEligible, isPrIneligible, repsAxisEligible, prAxisLabel, EMPTY_BASELINES,
  type BaselineSetRow, type PrCandidateSet, type PrBaselines, type PrAxis,
} from '@/lib/training/prEngine'
import { PR_TRUTH, PR_LOGGED, PR_TRUTH_AS_OF, prFloorFor, truthAxisValue } from '@/lib/training/prTruth'
import { SEEDED_PRS, SEED_CUTOFF, ASSERTED_DATES, seededAxesFor, isAssertedSession } from '@/lib/training/prSeed'
import { EXERCISE_ALIASES, canonicalExerciseName } from '@/lib/exercises/aliases'

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

// ─────────────────────────────────────────────────────────────────────────────
// Score — every component, the composite and the alerts
//
// The largest un-vectored arithmetic surface in the repo (§2.3 item 1). The
// component functions take a `Pick` of ScoringInputs, so their fixtures carry
// only the fields each one reads; the Swift test builds a full `ScoringInputs`
// through the memberwise initialiser. The composite and the alerts take the
// whole object and are exported whole.
// ─────────────────────────────────────────────────────────────────────────────

type Ctx = NonNullable<ScoringInputs['contextMode']> | null
const CTXS: Ctx[] = [null, 'normal', 'travel', 'illness', 'emergency']
/** The TypeScript reads `undefined`; the JSON carries `null`. Same branch. */
const ctxOf = (c: Ctx) => c ?? undefined
const orUndef = <T,>(v: T | null): T | undefined => (v == null ? undefined : v)

const PERFECT: ScoringInputs = {
  sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8,
  calories: 1955, proteinG: 170, carbsG: 195, fatG: 55,
  calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
  steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500,
  workoutLogged: true, isRestDay: false,
  newPRsToday: 2, sessionVolumeKg: 4000, trailingAvgVolumeKg: 3500,
  waterMl: 3000, waterGoalMl: 3000,
  contextMode: 'normal',
}

const ZERO: ScoringInputs = {
  sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8,
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
  calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
  steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
  workoutLogged: false, isRestDay: false,
  newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
  waterMl: 0, waterGoalMl: 3000,
  contextMode: 'normal',
}

describe('golden vectors — score components', () => {
  it('exports the sleep-score vectors', () => {
    interface In {
      sleepHours: number; deepMinutes: number; remMinutes: number
      sleepGoalHours: number; contextMode: Ctx
    }
    const cases: Case<In, number | null>[] = []
    const run = (name: string, input: In) => cases.push({
      name, input,
      expected: computeSleepScore({ ...input, contextMode: ctxOf(input.contextMode) }),
    })

    // Every band edge: the ±0.5h tolerance at 7.4 / 7.5 / 7.6, the 89/90 deep
    // bonus edge, the goal-0 short circuit, and the sub-zero guard.
    const hours = [0, -1, 0.25, 3, 3 + 14 / 60, 4, 5, 5.5, 6, 6.5, 7, 7.4, 7.5, 7.6, 8, 9, 12]
    for (const sleepHours of hours) {
      for (const deepMinutes of [0, 89, 90]) {
        for (const remMinutes of [0, 90]) {
          for (const sleepGoalHours of [0, 8]) {
            for (const contextMode of CTXS) {
              run(
                `h=${sleepHours} deep=${deepMinutes} rem=${remMinutes} goal=${sleepGoalHours} ctx=${contextMode}`,
                { sleepHours, deepMinutes, remMinutes, sleepGoalHours, contextMode },
              )
            }
          }
        }
      }
    }

    run('regression: no sleep data is null even when the goal is 0',
      { sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 0, contextMode: null })
    run('regression: 6h on an 8h goal, deep 90 — the +5 has headroom',
      { sleepHours: 6, deepMinutes: 90, remMinutes: 0, sleepGoalHours: 8, contextMode: null })
    run('regression: 6h on an 8h goal, deep 89 — one minute short of the bonus',
      { sleepHours: 6, deepMinutes: 89, remMinutes: 0, sleepGoalHours: 8, contextMode: null })
    run('regression: a 6h sleeper on a 6h goal is not short',
      { sleepHours: 6, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 6, contextMode: null })

    emit('sleep-score.json', {
      module: 'scoring/score',
      fn: 'computeSleepScore',
      note: 'Full credit within 0.5h of goal; quadratic penalty below; +5 deep>=90, +5 REM>=90. sleepHours<=0 is null. goal 0 is 100.',
      cases,
    })
  })

  it('exports the nutrition-score vectors', () => {
    interface In {
      calories: number; proteinG: number; carbsG: number; fatG: number
      calorieGoal: number; proteinGoalG: number; carbsGoalG: number; fatGoalG: number
      nutritionException: boolean | null; contextMode: Ctx
    }
    const cases: Case<In, number | null>[] = []
    const run = (name: string, input: In) => cases.push({
      name, input,
      expected: computeNutritionScore({
        ...input,
        nutritionException: orUndef(input.nutritionException),
        contextMode: ctxOf(input.contextMode),
      }),
    })

    const GOALS = [
      { calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55 },  // a cut: all four graded
      { calorieGoal: 2800, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0 },       // bulk/maintenance: calories only
      { calorieGoal: 2200, proteinGoalG: 160, carbsGoalG: 0, fatGoalG: 0 },     // calories + protein
      { calorieGoal: 0, proteinGoalG: 170, carbsGoalG: 0, fatGoalG: 0 },        // no calorie goal: the division-by-zero path
    ]
    for (const calories of [0, -1, 1500, 1955, 2500, 5000]) {
      for (const proteinG of [0, 90, 170, 250]) {
        for (const [carbsG, fatG] of [[0, 0], [195, 55], [300, 80]]) {
          for (const goals of GOALS) {
            for (const nutritionException of [null, true]) {
              for (const contextMode of [null, 'emergency'] as Ctx[]) {
                run(
                  `kcal=${calories} p=${proteinG} c=${carbsG} f=${fatG} goals=${goals.calorieGoal}/${goals.proteinGoalG}/${goals.carbsGoalG}/${goals.fatGoalG} exc=${nutritionException} ctx=${contextMode}`,
                  { calories, proteinG, carbsG, fatG, ...goals, nutritionException, contextMode },
                )
              }
            }
          }
        }
      }
    }

    const cut = GOALS[0]
    run('regression: exception false is an ordinary day, same as absent',
      { calories: 2500, proteinG: 120, carbsG: 300, fatG: 80, ...cut, nutritionException: false, contextMode: null })
    run('regression: a flagged day with no protein target is unknown, not perfect',
      { calories: 3200, proteinG: 200, carbsG: 300, fatG: 100, ...GOALS[1], nutritionException: true, contextMode: null })
    run('regression: a flagged day grades protein and only protein',
      { calories: 3200, proteinG: 170, carbsG: 400, fatG: 120, ...cut, nutritionException: true, contextMode: null })
    run('regression: over-eating on a cut is 1.5x harsher than under-eating',
      { calories: 2346, proteinG: 170, carbsG: 195, fatG: 55, ...cut, nutritionException: null, contextMode: null })
    run('regression: under-eating by the same margin',
      { calories: 1564, proteinG: 170, carbsG: 195, fatG: 55, ...cut, nutritionException: null, contextMode: null })
    run('regression: illness softens the penalty',
      { calories: 2500, proteinG: 120, carbsG: 300, fatG: 80, ...cut, nutritionException: null, contextMode: 'illness' })
    run('regression: travel softens the penalty less than illness',
      { calories: 2500, proteinG: 120, carbsG: 300, fatG: 80, ...cut, nutritionException: null, contextMode: 'travel' })

    emit('nutrition-score.json', {
      module: 'scoring/score',
      fn: 'computeNutritionScore',
      note: 'Protein counted twice; calories asymmetric (over x1.5); macros graded only with a goal > 0. A declared exception grades protein alone. calories<=0 is null.',
      cases,
    })
  })

  it('exports the activity-score vectors', () => {
    interface In { steps: number; activeCal: number; stepsGoal: number; activeCalGoal: number; contextMode: Ctx }
    const cases: Case<In, number | null>[] = []
    for (const steps of [0, -5, 3000, 10000, 15000, 40000]) {
      for (const activeCal of [0, 250, 500, 1000]) {
        for (const stepsGoal of [0, 10000]) {
          for (const activeCalGoal of [0, 500]) {
            for (const contextMode of CTXS) {
              const input = { steps, activeCal, stepsGoal, activeCalGoal, contextMode }
              cases.push({
                name: `steps=${steps}/${stepsGoal} cal=${activeCal}/${activeCalGoal} ctx=${contextMode}`,
                input,
                expected: computeActivityScore({ ...input, contextMode: ctxOf(contextMode) }),
              })
            }
          }
        }
      }
    }
    emit('activity-score.json', {
      module: 'scoring/score',
      fn: 'computeActivityScore',
      note: 'Half steps, half active kcal, each capped at 100. Illness/emergency are null (not asked); travel is NOT. Both zero is null. A zero goal scores 100.',
      cases,
    })
  })

  it('exports the workout-score vectors', () => {
    interface In {
      workoutLogged: boolean; isRestDay: boolean; newPRsToday: number
      sessionVolumeKg: number; trailingAvgVolumeKg: number
      contextMode: Ctx; isCurrentDay: boolean | null; localHour: number | null
      plannedExercises: number | null; loggedExercises: number | null
      plannedSets: number | null; sessionSets: number | null; failureSets: number | null
    }
    const cases: Case<In, number | null>[] = []
    const run = (name: string, input: In) => cases.push({
      name, input,
      expected: computeWorkoutScore({
        workoutLogged: input.workoutLogged, isRestDay: input.isRestDay, newPRsToday: input.newPRsToday,
        sessionVolumeKg: input.sessionVolumeKg, trailingAvgVolumeKg: input.trailingAvgVolumeKg,
        contextMode: ctxOf(input.contextMode),
        isCurrentDay: orUndef(input.isCurrentDay), localHour: orUndef(input.localHour),
        plannedExercises: orUndef(input.plannedExercises), loggedExercises: orUndef(input.loggedExercises),
        plannedSets: orUndef(input.plannedSets), sessionSets: orUndef(input.sessionSets),
        failureSets: orUndef(input.failureSets),
      }),
    })
    const NO_PLAN = { plannedExercises: null, loggedExercises: null, plannedSets: null, sessionSets: null, failureSets: null }

    // ── Not logged: pending vs missed vs neutral ─────────────────────────────
    for (const isRestDay of [false, true]) {
      for (const contextMode of [null, 'travel', 'illness'] as Ctx[]) {
        for (const isCurrentDay of [null, false, true]) {
          for (const localHour of [null, 0, 14, 20, 21, 23]) {
            run(
              `unlogged rest=${isRestDay} ctx=${contextMode} today=${isCurrentDay} hour=${localHour}`,
              {
                workoutLogged: false, isRestDay, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
                contextMode, isCurrentDay, localHour, ...NO_PLAN,
              },
            )
          }
        }
      }
    }

    // ── Logged: the weighted mean and its drop-and-renormalise rule ──────────
    const VOLUMES: [number, number][] = [
      [0, 0], [8945, 0], [8945, 8500], [10000, 10000], [9500, 10000], [9000, 10000],
      [8000, 10000], [7500, 10000], [6000, 10000], [3000, 10000], [0, 10000],
    ]
    const PLANS = [
      NO_PLAN,
      { plannedExercises: 7, loggedExercises: 7, plannedSets: 19, sessionSets: 19, failureSets: 3 },
      { plannedExercises: 7, loggedExercises: 3, plannedSets: 19, sessionSets: 8, failureSets: 0 },
      { plannedExercises: 7, loggedExercises: 7, plannedSets: 19, sessionSets: 19, failureSets: null },
      { plannedExercises: 0, loggedExercises: 5, plannedSets: 0, sessionSets: 5, failureSets: 1 },
      { plannedExercises: 7, loggedExercises: 9, plannedSets: 19, sessionSets: 25, failureSets: 2 },
      { plannedExercises: 7, loggedExercises: null, plannedSets: 19, sessionSets: null, failureSets: 1 },
      { plannedExercises: null, loggedExercises: null, plannedSets: null, sessionSets: null, failureSets: 0 },
    ]
    for (const newPRsToday of [0, 1, 3]) {
      for (const [sessionVolumeKg, trailingAvgVolumeKg] of VOLUMES) {
        for (const plan of PLANS) {
          run(
            `logged prs=${newPRsToday} v=${sessionVolumeKg}/${trailingAvgVolumeKg} plan=${JSON.stringify(plan)}`,
            {
              workoutLogged: true, isRestDay: false, newPRsToday, sessionVolumeKg, trailingAvgVolumeKg,
              contextMode: null, isCurrentDay: null, localHour: null, ...plan,
            },
          )
        }
      }
    }

    run('regression: a fully executed session is 100 with zero PRs (2026-07-24 Legs & Core B)',
      { workoutLogged: true, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 8945, trailingAvgVolumeKg: 8500,
        contextMode: null, isCurrentDay: null, localHour: null, ...PLANS[1] })
    run('regression: first session of its type drops the volume term instead of failing it',
      { workoutLogged: true, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 8945, trailingAvgVolumeKg: 0,
        contextMode: null, isCurrentDay: null, localHour: null, ...PLANS[1] })
    run('regression: a logged session on a travel day is still null',
      { workoutLogged: true, isRestDay: false, newPRsToday: 2, sessionVolumeKg: 8945, trailingAvgVolumeKg: 8500,
        contextMode: 'travel', isCurrentDay: null, localHour: null, ...PLANS[1] })
    run('regression: a logged session on a rest day is still null',
      { workoutLogged: true, isRestDay: true, newPRsToday: 2, sessionVolumeKg: 8945, trailingAvgVolumeKg: 8500,
        contextMode: null, isCurrentDay: null, localHour: null, ...PLANS[1] })
    run('regression: the PR bonus is capped at 10, never a gate',
      { workoutLogged: true, isRestDay: false, newPRsToday: 5, sessionVolumeKg: 6000, trailingAvgVolumeKg: 10000,
        contextMode: null, isCurrentDay: null, localHour: null, ...PLANS[1] })

    emit('workout-score.json', {
      module: 'scoring/score',
      fn: 'computeWorkoutScore',
      note: 'completion 55 / coverage 15 / volume 18 / effort 12, missing parts dropped and renormalised; PRs are +5 each capped at 10 on top. Unlogged: null if pending today before 21:00, else 0. Rest or travel: null.',
      cases,
    })
  })

  it('exports the hydration-score vectors', () => {
    const cases: Case<{ waterMl: number; waterGoalMl: number }, number | null>[] = []
    for (const waterMl of [0, -1, 1, 1500, 3000, 4000]) {
      for (const waterGoalMl of [0, -5, 3000]) {
        cases.push({
          name: `water=${waterMl}/${waterGoalMl}`,
          input: { waterMl, waterGoalMl },
          expected: computeHydrationScore({ waterMl, waterGoalMl }),
        })
      }
    }
    emit('hydration-score.json', {
      module: 'scoring/score',
      fn: 'computeHydrationScore',
      note: 'Ratio capped at 100. No goal, or nothing logged, is null — an unlogged morning is never penalised.',
      cases,
    })
  })

  it('exports the sleep-recovery-multiplier vectors', () => {
    interface In { sleepHours: number; sleepGoalHours: number | null; contextMode: Ctx }
    const cases: Case<In, number>[] = []
    const hours = [0, -2, 0.5, 1, 2, 3, 238 / 60, 4, 5, 5.5, 6, 6.5, 7, 8, 9.5]
    for (const sleepHours of hours) {
      for (const sleepGoalHours of [null, 0, 5, 6, 8, 9, 12]) {
        for (const contextMode of CTXS) {
          cases.push({
            name: `h=${sleepHours} goal=${sleepGoalHours} ctx=${contextMode}`,
            input: { sleepHours, sleepGoalHours, contextMode },
            expected: sleepRecoveryMultiplier(sleepHours, orUndef(sleepGoalHours), ctxOf(contextMode)),
          })
        }
      }
    }
    emit('sleep-recovery-multiplier.json', {
      module: 'scoring/score',
      fn: 'sleepRecoveryMultiplier',
      note: 'Threshold = clamp(goal-1, 5..7); goal absent or 0 reads as 8. Piecewise-linear on the deficit below it, floored at 0.10. No sleep data is 1.0, never 0. Context relaxes toward 1.',
      cases,
    })
  })

  it('exports the recovery-score vectors', () => {
    interface In {
      sleepHours: number; deepMinutes: number; sleepGoalHours: number
      restingHR: number | null; baselineHR: number | null
      hrvMs: number | null; hrvBaseline: number | null
      contextMode: Ctx
    }
    const cases: Case<In, number | null>[] = []
    const run = (name: string, input: In) => cases.push({
      name, input,
      expected: computeRecoveryScore({
        sleepHours: input.sleepHours, deepMinutes: input.deepMinutes, sleepGoalHours: input.sleepGoalHours,
        restingHR: orUndef(input.restingHR), baselineHR: orUndef(input.baselineHR),
        hrvMs: orUndef(input.hrvMs), hrvBaseline: orUndef(input.hrvBaseline),
        contextMode: ctxOf(input.contextMode),
      }),
    })
    const HRS: [number | null, number | null][] = [[null, null], [59, 65], [60, 58], [75, 58], [60, 0], [60, null]]
    const HRVS: [number | null, number | null][] = [[null, null], [63.39, 58.6], [120, 58], [40, 58], [60, 0], [null, 58]]
    for (const sleepHours of [0, 3, 238 / 60, 6, 8]) {
      for (const deepMinutes of [0, 68, 90]) {
        for (const sleepGoalHours of [0, 8]) {
          for (const [restingHR, baselineHR] of HRS) {
            for (const [hrvMs, hrvBaseline] of HRVS) {
              run(
                `h=${sleepHours} deep=${deepMinutes} goal=${sleepGoalHours} hr=${restingHR}/${baselineHR} hrv=${hrvMs}/${hrvBaseline}`,
                { sleepHours, deepMinutes, sleepGoalHours, restingHR, baselineHR, hrvMs, hrvBaseline, contextMode: null },
              )
            }
          }
        }
      }
    }
    for (const contextMode of ['illness', 'travel', 'emergency'] as Ctx[]) {
      run(`context ${contextMode}: the 2026-08-04 night`,
        { sleepHours: 238 / 60, deepMinutes: 68, sleepGoalHours: 8, restingHR: 59, baselineHR: 65, hrvMs: 63.39, hrvBaseline: 58.6, contextMode })
      run(`context ${contextMode}: elevated HR and low HRV`,
        { sleepHours: 8, deepMinutes: 90, sleepGoalHours: 8, restingHR: 75, baselineHR: 58, hrvMs: 40, hrvBaseline: 58, contextMode })
    }
    run('regression: 2026-08-04 — 3h58 with above-baseline HRV no longer reads as recovered (was 81)',
      { sleepHours: 238 / 60, deepMinutes: 68, sleepGoalHours: 8, restingHR: 59, baselineHR: 65, hrvMs: 63.39, hrvBaseline: 58.6, contextMode: 'normal' })
    run('regression: perfect autonomic data cannot rescue three hours of sleep',
      { sleepHours: 3, deepMinutes: 75, sleepGoalHours: 8, restingHR: 50, baselineHR: 65, hrvMs: 120, hrvBaseline: 58, contextMode: 'normal' })

    emit('recovery-score.json', {
      module: 'scoring/score',
      fn: 'computeRecoveryScore',
      note: 'Weighted mean (sleep 0.45, resting HR 0.30, HRV 0.25) over the parts with data, times the sleep multiplier. No parts at all is null. A zero baseline drops that part.',
      cases,
    })
  })
})

describe('golden vectors — daily score and alerts', () => {
  it('exports the composite vectors', () => {
    const cases: Case<ScoringInputs, ScoreComponents>[] = []
    const run = (name: string, input: ScoringInputs) =>
      cases.push({ name, input, expected: computeDailyScore(input) })

    // The sleep gate, band by band, against a perfect day — and the same bands
    // on a rest day, an unlogged day and in each context that relaxes the cap.
    for (const sleepHours of [0, 2, 3, 3 + 14 / 60, 4, 5, 5.5, 5.99, 6, 8]) {
      for (const contextMode of [null, 'illness', 'emergency'] as Ctx[]) {
        for (const isRestDay of [false, true]) {
          for (const workoutLogged of [false, true]) {
            run(
              `sleep=${sleepHours} ctx=${contextMode} rest=${isRestDay} logged=${workoutLogged}`,
              { ...PERFECT, sleepHours, deepMinutes: 20, remMinutes: 20, contextMode: ctxOf(contextMode), isRestDay, workoutLogged },
            )
          }
        }
      }
    }

    run('PERFECT', PERFECT)
    run('ZERO — an empty training day is 0, not null', ZERO)
    run('ZERO on travel — a blank day, not a fake 0', { ...ZERO, contextMode: 'travel' })
    run('rest day — workout null, total renormalised', { ...PERFECT, isRestDay: true, workoutLogged: false })
    run('regression: the July 15 bug — 3h14m can never total 81',
      { ...PERFECT, sleepHours: 3 + 14 / 60, deepMinutes: 20, remMinutes: 20 })
    run('awaiting sleep on the live day', { ...PERFECT, sleepHours: 0, deepMinutes: 0, remMinutes: 0, isCurrentDay: true })
    run('not awaiting sleep on a past day', { ...PERFECT, sleepHours: 0, deepMinutes: 0, remMinutes: 0, isCurrentDay: false })
    run('pending workout on the live day before 21:00',
      { ...PERFECT, workoutLogged: false, isCurrentDay: true, localHour: 14 })
    run('missed workout on the live day after 21:00',
      { ...PERFECT, workoutLogged: false, isCurrentDay: true, localHour: 21 })
    run('no water logged — hydration dropped', { ...PERFECT, waterMl: 0 })
    run('half water', { ...PERFECT, waterMl: 1500 })
    run('a declared exception day, protein on target', { ...PERFECT, calories: 3200, carbsG: 400, fatG: 120, nutritionException: true })
    run('a declared exception day, protein short', { ...PERFECT, calories: 3200, proteinG: 100, carbsG: 400, fatG: 120, nutritionException: true })
    run('full physiology', { ...PERFECT, restingHR: 58, baselineHR: 62, hrvMs: 60, hrvBaseline: 58 })
    run('the 2026-08-04 night with everything else perfect',
      { ...PERFECT, sleepHours: 238 / 60, deepMinutes: 68, remMinutes: 40, restingHR: 59, baselineHR: 65, hrvMs: 63.39, hrvBaseline: 58.6 })
    run('half a session', { ...PERFECT, newPRsToday: 0, sessionVolumeKg: 4000, trailingAvgVolumeKg: 8500,
      plannedExercises: 7, loggedExercises: 3, plannedSets: 19, sessionSets: 8, failureSets: 0 })
    run('no context key at all', { ...PERFECT, contextMode: undefined })
    run('a rounding half: 0.5 rounds up, not to even', { ...ZERO, sleepHours: 8, deepMinutes: 0, remMinutes: 0, waterMl: 1515, workoutLogged: true, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000 })

    emit('daily-score.json', {
      module: 'scoring/score',
      fn: 'computeDailyScore',
      note: 'Weights sleep .25 nutrition .30 activity .20 workout .15 recovery .10 hydration .08 over the non-null parts; then the sleep cap (<6h) relaxed by context; then Math.round. awaitingSleep = live day with sleepHours<=0.',
      cases,
    })
  })

  it('exports the alert vectors', () => {
    interface In {
      sleepHours: number; isRestDay: boolean; contextMode: Ctx
      restingHR: number | null; baselineHR: number | null
      proteinG: number; proteinGoalG: number
      battery: number; hour: number
    }
    const cases: Case<In, ScoringAlert[]>[] = []
    const run = (name: string, input: In) => cases.push({
      name, input,
      expected: computeAlerts({
        ...PERFECT,
        sleepHours: input.sleepHours, isRestDay: input.isRestDay, contextMode: ctxOf(input.contextMode),
        restingHR: orUndef(input.restingHR), baselineHR: orUndef(input.baselineHR),
        proteinG: input.proteinG, proteinGoalG: input.proteinGoalG,
      }, input.battery, input.hour),
    })
    const HRS: [number | null, number | null][] = [[null, null], [70, 60], [67, 60]]
    for (const sleepHours of [0, 4, 5.25, 5.5, 8]) {
      for (const isRestDay of [false, true]) {
        for (const contextMode of [null, 'emergency'] as Ctx[]) {
          for (const [restingHR, baselineHR] of HRS) {
            for (const battery of [15, 20]) {
              for (const proteinG of [50, 119, 170]) {
                for (const hour of [17, 18]) {
                  run(
                    `sleep=${sleepHours} rest=${isRestDay} ctx=${contextMode} hr=${restingHR}/${baselineHR} batt=${battery} p=${proteinG} hour=${hour}`,
                    { sleepHours, isRestDay, contextMode, restingHR, baselineHR, proteinG, proteinGoalG: 170, battery, hour },
                  )
                }
              }
            }
          }
        }
      }
    }
    run('illness still fires the training alert (only emergency suppresses it)',
      { sleepHours: 4, isRestDay: false, contextMode: 'illness', restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })
    run('resting HR exactly +7 is not elevated',
      { sleepHours: 8, isRestDay: false, contextMode: null, restingHR: 67, baselineHR: 60, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })
    run('battery 19.99 is low, 20 is not',
      { sleepHours: 8, isRestDay: false, contextMode: null, restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 19.99, hour: 12 })
    run('protein at exactly 70% of goal is not behind',
      { sleepHours: 8, isRestDay: false, contextMode: null, restingHR: null, baselineHR: null, proteinG: 119, proteinGoalG: 170, battery: 60, hour: 23 })
    run('protein remaining rounds half up (Math.round, not banker\'s)',
      { sleepHours: 8, isRestDay: false, contextMode: null, restingHR: null, baselineHR: null, proteinG: 100.5, proteinGoalG: 170, battery: 60, hour: 20 })
    run('sleep 5.25 prints as 5.3 — toFixed rounds the half up',
      { sleepHours: 5.25, isRestDay: true, contextMode: null, restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })
    run('sleep 5.45 prints as 5.5',
      { sleepHours: 5.45, isRestDay: true, contextMode: null, restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })
    run('sleep 4.05 prints as whatever the binary value says',
      { sleepHours: 4.05, isRestDay: true, contextMode: null, restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })
    run('sleep 3.2333 prints as 3.2',
      { sleepHours: 3 + 14 / 60, isRestDay: true, contextMode: null, restingHR: null, baselineHR: null, proteinG: 170, proteinGoalG: 170, battery: 60, hour: 12 })

    emit('alerts.json', {
      module: 'scoring/score',
      fn: 'computeAlerts',
      note: 'Ordered: train-day short sleep (danger), elevated HR (warn), battery < 20 (danger), protein behind after 18:00 (warn), < 5.5h sleep (warn). Emergency suppresses the training and sleep alerts.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Session volume — the ONE rule, the highest bug-per-line file in the repo
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — session volume', () => {
  it('exports the volume vectors', () => {
    const cases: Case<{ sets: VolumeSet[] }, number>[] = []
    const run = (name: string, sets: VolumeSet[]) =>
      cases.push({ name, input: { sets }, expected: sessionVolumeKg(sets) })

    run('no sets', [])
    run('bilateral sets', [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 11 }, { weightKg: 57.5, reps: 10 }])
    run('regression: L 5×10 / R 5×14 is 50 — the weaker side, once',
      [{ weightKg: 5, reps: 10, side: 'L', pairId: 'p1' }, { weightKg: 5, reps: 14, side: 'R', pairId: 'p1' }])
    run('regression: the lower weight too',
      [{ weightKg: 7.5, reps: 12, side: 'L', pairId: 'p1' }, { weightKg: 10, reps: 12, side: 'R', pairId: 'p1' }])
    run('regression: 2026-08-18 a split set weighs what the unsided set weighs',
      [{ weightKg: 3.75, reps: 15, side: 'L', pairId: 'p1' }, { weightKg: 3.75, reps: 15, side: 'R', pairId: 'p1' }])
    run('the same set unsided', [{ weightKg: 3.75, reps: 15 }])
    run('a lone logged side scores on its own', [{ weightKg: 20, reps: 10, side: 'L', pairId: 'p1' }])
    run('pairs stay independent and mix with bilateral work', [
      { weightKg: 60, reps: 10 },
      { weightKg: 5, reps: 10, side: 'L', pairId: 'p1' }, { weightKg: 5, reps: 14, side: 'R', pairId: 'p1' },
      { weightKg: 5, reps: 12, side: 'L', pairId: 'p2' }, { weightKg: 5, reps: 12, side: 'R', pairId: 'p2' },
    ])
    run('regression: quarter-kg microloads stay exact (22.25 × 9 = 200.25)', [{ weightKg: 22.25, reps: 9 }])
    run('regression: float representation error is snapped (0.1 × 3)', [{ weightKg: 0.1, reps: 3 }])
    run('a pairId with no side is an ordinary set',
      [{ weightKg: 40, reps: 8, pairId: 'p1' }, { weightKg: 40, reps: 6, pairId: 'p1' }])
    run('a side with no pairId is an ordinary set',
      [{ weightKg: 40, reps: 8, side: 'L' }, { weightKg: 40, reps: 6, side: 'R' }])
    run('an empty-string pairId is no pairId',
      [{ weightKg: 40, reps: 8, side: 'L', pairId: '' }, { weightKg: 40, reps: 6, side: 'R', pairId: '' }])
    run('a malformed bucket of three rows scores each as logged', [
      { weightKg: 10, reps: 10, side: 'L', pairId: 'p1' },
      { weightKg: 10, reps: 12, side: 'R', pairId: 'p1' },
      { weightKg: 10, reps: 8, side: 'L', pairId: 'p1' },
    ])
    run('two lefts and no right is not a pair',
      [{ weightKg: 10, reps: 10, side: 'L', pairId: 'p1' }, { weightKg: 10, reps: 12, side: 'L', pairId: 'p1' }])
    run('regression: a ghost weighs nothing', [{ weightKg: 40, reps: 10, setType: 'ghost' }])
    run('a warm-up still counts', [{ weightKg: 40, reps: 10, setType: 'warmup' }])
    run('a drop set counts', [{ weightKg: 40, reps: 10, setType: 'dropset' }])
    run('a failure set counts', [{ weightKg: 40, reps: 10, setType: 'failure' }])
    run('an unknown set type counts', [{ weightKg: 40, reps: 10, setType: 'whatever' }])
    run('a null set type counts', [{ weightKg: 40, reps: 10, setType: null }])
    run('regression: a ghosted pair does not leave a lone partner to score', [
      { weightKg: 10, reps: 10, side: 'L', pairId: 'p1', setType: 'ghost' },
      { weightKg: 10, reps: 12, side: 'R', pairId: 'p1', setType: 'ghost' },
    ])
    run('one ghosted side leaves the other as a lone side', [
      { weightKg: 10, reps: 10, side: 'L', pairId: 'p1', setType: 'ghost' },
      { weightKg: 10, reps: 12, side: 'R', pairId: 'p1' },
    ])
    run('unloaded work: 0 kg × 17 is 0 tonnage, not an error', [{ weightKg: 0, reps: 17 }])
    run('negative reps are arithmetic, not a guard', [{ weightKg: 10, reps: -2 }])
    run('order of sides does not matter',
      [{ weightKg: 5, reps: 14, side: 'R', pairId: 'p1' }, { weightKg: 5, reps: 10, side: 'L', pairId: 'p1' }])
    run('pairs interleaved with other pairs', [
      { weightKg: 5, reps: 14, side: 'R', pairId: 'a' },
      { weightKg: 7, reps: 9, side: 'L', pairId: 'b' },
      { weightKg: 5, reps: 10, side: 'L', pairId: 'a' },
      { weightKg: 7, reps: 11, side: 'R', pairId: 'b' },
    ])

    // A small grid over the microload ladder, so the two-decimal snap is
    // exercised on every plate a real bar can carry.
    for (const weightKg of [0, 0.25, 1.25, 2.5, 3.75, 11.25, 22.25, 82.5, 142.5]) {
      for (const reps of [1, 3, 7, 9, 13, 17]) {
        run(`grid ${weightKg} × ${reps}`, [{ weightKg, reps }])
      }
    }

    emit('session-volume.json', {
      module: 'sessions/volume',
      fn: 'sessionVolumeKg',
      note: 'A genuine L/R pair is ONE set at min(weight) × min(reps); a lone side, a pairId without a side, or a 3+ bucket scores each row as logged. Ghosts contribute nothing; warm-ups count. Rounded to 2 dp.',
      cases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard layout — the slot algebra
//
// Two things in this module are non-deterministic and are normalised on BOTH
// sides before comparison: a freshly minted slot id (`newSlotId` mixes the
// clock in) becomes `new-1`, `new-2`… in order of appearance, and an
// `updatedAt` that the operation stamped becomes -1. An operation that returns
// its input untouched keeps the input's stamp, and that difference — touched
// or not — is part of the contract.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLayout(known: ReadonlySet<string>, before: number, after: DashboardLayout): DashboardLayout {
  const minted = new Map<string, string>()
  const slots = after.slots.map((s) => {
    if (known.has(s.id)) return s
    if (!minted.has(s.id)) minted.set(s.id, `new-${minted.size + 1}`)
    return { ...s, id: minted.get(s.id)! }
  })
  return { slots, hidden: after.hidden, updatedAt: after.updatedAt === before ? before : -1 }
}

/** Ids a stored payload names, however deep — the set the normaliser keeps. */
function idsIn(stored: unknown): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.id === 'string' && o.id) out.add(o.id)
      Object.values(o).forEach(walk)
    }
  }
  walk(stored)
  // `sl-<widget>` ids are minted deterministically by reconcile, not by the clock.
  for (const id of WIDGET_IDS) out.add(`sl-${id}`)
  return out
}

describe('golden vectors — dashboard layout', () => {
  const PHONE = defaultLayout('phone')
  const DESKTOP = defaultLayout('desktop')
  /** A stack, a duplicate, and a hidden widget — the three shapes the defaults lack. */
  const ARRANGED: DashboardLayout = {
    slots: [
      { id: 'sl-sleep', size: 'm', items: ['sleep', 'train'] },
      ...PHONE.slots.filter((s) => !['sleep', 'train', 'cardio'].includes(s.items[0])),
      { id: 'sl-fuel2', size: 's', items: ['fuel'] },
    ],
    hidden: ['cardio'],
    updatedAt: 7,
  }
  const LAYOUTS = { PHONE, DESKTOP, ARRANGED }
  type LayoutName = keyof typeof LAYOUTS
  const withSize = (base: DashboardLayout, slotId: string, size: WidgetSize): DashboardLayout =>
    ({ ...base, slots: base.slots.map((s) => (s.id === slotId ? { ...s, size } : s)) })

  it('exports the catalogue and the size algebra', () => {
    emit('layout-catalogue.json', {
      module: 'dashboard/layout',
      fn: 'WIDGET_IDS / WIDGET_SIZES / defaultSizeFor',
      note: 'Catalogue order is first-run order. Sizes are the bodies each widget actually has; defaults differ per surface.',
      cases: [{
        name: 'catalogue',
        input: {},
        expected: {
          ids: WIDGET_IDS,
          sizes: WIDGET_SIZES,
          defaultPhone: Object.fromEntries(WIDGET_IDS.map((id) => [id, defaultSizeFor(id, 'phone')])),
          defaultDesktop: Object.fromEntries(WIDGET_IDS.map((id) => [id, defaultSizeFor(id, 'desktop')])),
        },
      }],
    })

    interface SizesIn { items: WidgetId[]; surface: DashboardSurface }
    const sizes: Case<SizesIn, WidgetSize[]>[] = []
    const groups: WidgetId[][] = [
      [], ...WIDGET_IDS.map((id) => [id]),
      ['sleep', 'cardio'], ['cardio', 'pr', 'stack'], ['recovery', 'water'], ['recovery', 'sleep'],
      ['body', 'sleep'], ['recovery', 'sleep', 'body'], ['fuel', 'fuel'], ['sleep', 'train'],
    ]
    for (const items of groups) {
      for (const surface of ['phone', 'desktop'] as const) {
        sizes.push({ name: `${items.join('+') || '(none)'} @${surface}`, input: { items, surface }, expected: sizesFor(items, surface) })
      }
    }
    emit('layout-sizes-for.json', {
      module: 'dashboard/layout',
      fn: 'sizesFor',
      note: 'The sizes every member can draw, in growing order; a phone never offers w/xl. Empty items → every size the surface has.',
      cases: sizes,
    })

    interface ClampIn { items: WidgetId[]; want: WidgetSize; surface: DashboardSurface }
    const clamps: Case<ClampIn, WidgetSize>[] = []
    for (const items of groups) {
      for (const want of ALL_SIZES) {
        for (const surface of ['phone', 'desktop'] as const) {
          clamps.push({
            name: `${items.join('+') || '(none)'} want=${want} @${surface}`,
            input: { items, want, surface },
            expected: clampSize(items, want, surface),
          })
        }
      }
    }
    emit('layout-clamp-size.json', {
      module: 'dashboard/layout',
      fn: 'clampSize',
      note: 'The nearest size the slot can draw, by rank distance, ties to the smaller. No sizes at all → s.',
      cases: clamps,
    })

    emit('layout-heights.json', {
      module: 'dashboard/layout',
      fn: 'tileHeightPx / heightTier / bodyHeightPx',
      note: '52px row unit, 8px gap; s=2 m=3 l=5 w=3 xl=5 rows. Body = tile − 18 − 18 − 6.',
      cases: ALL_SIZES.map((size) => ({
        name: size,
        input: { size },
        expected: { tile: tileHeightPx(size), tier: heightTier(size), body: bodyHeightPx(size) },
      })),
    })

    emit('layout-defaults.json', {
      module: 'dashboard/layout',
      fn: 'defaultLayout',
      note: 'One slot per catalogue widget, in catalogue order, id sl-<widget>, nothing hidden, updatedAt 0.',
      cases: (['phone', 'desktop'] as const).map((surface) => ({
        name: surface, input: { surface }, expected: defaultLayout(surface),
      })),
    })
  })

  it('exports the stored-payload reader', () => {
    interface In { stored: unknown; surface: DashboardSurface }
    const cases: Case<In, DashboardLayout>[] = []
    const both = (name: string, stored: unknown) => {
      for (const surface of ['phone', 'desktop'] as const) {
        const out = fromStored(stored as Parameters<typeof fromStored>[0], surface)
        cases.push({ name: `${name} @${surface}`, input: { stored, surface }, expected: normalizeLayout(idsIn(stored), 0, out) })
      }
    }

    both('empty object', {})
    both('a string', 'not a layout')
    both('a number', 5)
    both('an array', [])
    both('unknown version with a hidden list', { v: 99, hidden: ['steps'], updatedAt: 3 })
    both('v1 — order, sizes, hidden, and a deleted widget', {
      v: 1, order: ['fuel', 'sleep', 'steps', 'battery'], size: { fuel: 'l', sleep: 's', steps: 'm' }, hidden: ['steps'],
    })
    both('v1 — an invalid size and an unknown widget in the size map', {
      v: 1, order: ['pr', 'cardio'], size: { pr: 'l', cardio: 'huge', ghost: 'm' }, hidden: [],
    })
    both('v1 — order is not an array', { v: 1, order: 'fuel', size: {}, hidden: [] })
    both('v2 — ghosts in items and a slot that is then empty', {
      v: 2, slots: [{ id: 'a', size: 'm', items: ['fuel', 'ghost'] }, { id: 'b', size: 's', items: ['phantom'] }],
    })
    both('v2 — a size the widget no longer offers', { v: 2, slots: [{ id: 'a', size: 'l', items: ['pr'] }] })
    both('v2 — duplicate slot ids', {
      v: 2, slots: [{ id: 'dupe', size: 's', items: ['fuel'] }, { id: 'dupe', size: 's', items: ['sleep'] }],
    })
    both('v2 — hidden is read even though a v2 never wrote one', {
      v: 2, slots: [{ id: 'a', size: 'm', items: ['fuel'] }], hidden: ['steps'], updatedAt: 5,
    })
    both('v3 — hidden steps, water never seen', {
      v: 3, slots: [{ id: 'a', size: 'm', items: ['fuel'] }], hidden: ['steps'], updatedAt: 1,
    })
    both('v3 — a desktop-only size in a pre-split payload', {
      v: 3, slots: [{ id: 'a', size: 'xl', items: ['sleep'] }], hidden: [], updatedAt: 3,
    })
    both('v3 — a stack, a duplicate and a hidden widget', {
      v: 3,
      slots: [{ id: 'x', size: 'm', items: ['sleep', 'train'] }, { id: 'y', size: 's', items: ['fuel'] }, { id: 'z', size: 'm', items: ['fuel'] }],
      hidden: ['cardio', 'fuel', 'nonsense'],
      updatedAt: 7,
    })
    both('v3 — slot rows of every broken shape', {
      v: 3,
      slots: [
        null, 'row', 42,
        { size: 'm', items: ['fuel'] },
        { id: '', size: 'm', items: ['sleep'] },
        { id: 7, size: 'm', items: ['vitals'] },
        { id: 'ok', items: ['water'] },
        { id: 'bad-size', size: 'huge', items: ['micros'] },
        { id: 'no-items', size: 'm' },
        { id: 'items-string', size: 'm', items: 'deficit' },
        { id: 'stack-with-ghost', size: 'l', items: ['train', 'ghost', 'bar'] },
      ],
      hidden: 'steps',
      updatedAt: '99',
    })
    both('v3 — a negative and a fractional stamp survive', {
      v: 3, slots: [{ id: 'a', size: 's', items: ['pr'] }], hidden: [], updatedAt: -12.5,
    })
    both('v4 — both sides present', {
      v: 4,
      phone: { slots: [{ id: 'p', size: 's', items: ['sleep'] }], hidden: ['cardio'], updatedAt: 10 },
      desktop: { slots: [{ id: 'd', size: 'xl', items: ['sleep'] }], hidden: ['pr'], updatedAt: 20 },
    })
    both('v4 — only the phone side', {
      v: 4, phone: { slots: [{ id: 'p', size: 's', items: ['sleep'] }], hidden: [], updatedAt: 10 },
    })
    both('v4 — only the desktop side', {
      v: 4, desktop: { slots: [{ id: 'd', size: 'w', items: ['body'] }], hidden: [], updatedAt: 10 },
    })
    both('v4 — a side whose slots are not an array', {
      v: 4, phone: { slots: 'nope', hidden: ['steps'], updatedAt: 2 }, desktop: { slots: [], hidden: [], updatedAt: 3 },
    })
    both('v4 — a wide size on the phone side is clamped', {
      v: 4, phone: { slots: [{ id: 'p', size: 'w', items: ['recovery'] }], hidden: [], updatedAt: 1 },
    })
    both('v4 — the desktop keeps an inherited l and a w', {
      v: 4, desktop: { slots: [{ id: 'a', size: 'l', items: ['fuel'] }, { id: 'b', size: 'w', items: ['sleep'] }], hidden: [], updatedAt: 1 },
    })
    both('v4 — a side that is not an object', { v: 4, phone: 'nope', desktop: 12 })

    emit('layout-from-stored.json', {
      module: 'dashboard/layout',
      fn: 'fromStored',
      note: 'v1 upgrades order/size/hidden; v2/v3 read slots at top level; v4 reads the asked-for side (absent side → defaults). Then reconcile: unique ids, hidden narrowed by placed, missing catalogue widgets appended. Minted ids → new-N; a stamped updatedAt → -1. Never called with null.',
      cases,
    })
  })

  it('exports the arrangement operations', () => {
    type Op =
      | { kind: 'removeFace'; slotId: string; index: number }
      | { kind: 'addWidget'; id: WidgetId; surface: DashboardSurface }
      | { kind: 'resizeSlot'; slotId: string; surface: DashboardSurface }
      | { kind: 'moveSlot'; fromId: string; toId: string }
      | { kind: 'stackSlots'; fromId: string; ontoId: string; surface: DashboardSurface }
      | { kind: 'unstackFace'; slotId: string; index: number }
      | { kind: 'reorderFace'; slotId: string; index: number; to: number }
    interface In { layout: DashboardLayout; op: Op }
    const cases: Case<In, DashboardLayout>[] = []

    const apply = (layout: DashboardLayout, op: Op): DashboardLayout => {
      switch (op.kind) {
        case 'removeFace': return removeFace(layout, op.slotId, op.index)
        case 'addWidget': return addWidget(layout, op.id, op.surface)
        case 'resizeSlot': return resizeSlot(layout, op.slotId, op.surface)
        case 'moveSlot': return moveSlot(layout, op.fromId, op.toId)
        case 'stackSlots': return stackSlots(layout, op.fromId, op.ontoId, op.surface)
        case 'unstackFace': return unstackFace(layout, op.slotId, op.index)
        case 'reorderFace': return reorderFace(layout, op.slotId, op.index, op.to)
      }
    }
    const run = (name: string, layout: DashboardLayout, op: Op) => {
      const known = new Set(layout.slots.map((s) => s.id))
      cases.push({ name, input: { layout, op }, expected: normalizeLayout(known, layout.updatedAt, apply(layout, op)) })
    }
    const on = (name: LayoutName, op: Op, label = JSON.stringify(op)) => run(`${name}: ${label}`, LAYOUTS[name], op)

    // removeFace
    on('PHONE', { kind: 'removeFace', slotId: 'sl-steps', index: 0 }, 'remove steps → hidden')
    on('PHONE', { kind: 'removeFace', slotId: 'sl-steps', index: 5 }, 'index out of range → nothing dropped, still stamped')
    on('PHONE', { kind: 'removeFace', slotId: 'nope', index: 0 }, 'unknown slot → unchanged slots, still stamped')
    on('ARRANGED', { kind: 'removeFace', slotId: 'sl-sleep', index: 0 }, 'remove sleep from the stack → train remains, sleep hidden')
    on('ARRANGED', { kind: 'removeFace', slotId: 'sl-sleep', index: 1 }, 'remove train from the stack')
    on('ARRANGED', { kind: 'removeFace', slotId: 'sl-fuel2', index: 0 }, 'remove one of two fuels → not hidden')
    on('ARRANGED', { kind: 'removeFace', slotId: 'sl-fuel', index: 0 }, 'remove the other fuel → still one left')
    on('ARRANGED', { kind: 'removeFace', slotId: 'sl-recovery', index: 0 }, 'hidden list grows in removal order')
    // addWidget
    on('PHONE', { kind: 'addWidget', id: 'pr', surface: 'phone' })
    on('DESKTOP', { kind: 'addWidget', id: 'pr', surface: 'desktop' })
    on('DESKTOP', { kind: 'addWidget', id: 'recovery', surface: 'desktop' }, 'desktop default for recovery is xl')
    on('ARRANGED', { kind: 'addWidget', id: 'cardio', surface: 'phone' }, 'adding back clears hidden')
    on('ARRANGED', { kind: 'addWidget', id: 'fuel', surface: 'phone' }, 'a third fuel')
    on('PHONE', { kind: 'addWidget', id: 'sleep', surface: 'desktop' }, 'surface picks the size, not the layout')
    // resizeSlot — every widget from every size it can hold, on both surfaces
    // (On a one-slot layout: the other seventeen slots would only pad the fixture.)
    for (const id of WIDGET_IDS) {
      for (const surface of ['phone', 'desktop'] as const) {
        for (const size of sizesFor([id], surface)) {
          run(`resize ${id} from ${size} @${surface}`,
            { slots: [{ id: `sl-${id}`, size, items: [id] }], hidden: [], updatedAt: 0 },
            { kind: 'resizeSlot', slotId: `sl-${id}`, surface })
        }
      }
    }
    on('PHONE', { kind: 'resizeSlot', slotId: 'nope', surface: 'phone' }, 'unknown slot → still stamped')
    on('ARRANGED', { kind: 'resizeSlot', slotId: 'sl-sleep', surface: 'phone' }, 'a stack cycles the sizes all faces share')
    on('ARRANGED', { kind: 'resizeSlot', slotId: 'sl-water', surface: 'phone' }, 'water s → m')
    run('resize water from m wraps to s', withSize(PHONE, 'sl-water', 'm'), { kind: 'resizeSlot', slotId: 'sl-water', surface: 'phone' })
    run('resize a desktop-only xl read on a phone — not in the ladder, so index -1 + 1 = first', withSize(PHONE, 'sl-sleep', 'xl'), { kind: 'resizeSlot', slotId: 'sl-sleep', surface: 'phone' })
    // moveSlot
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-sleep', toId: 'sl-steps' })
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-steps', toId: 'sl-sleep' })
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-recovery', toId: 'sl-fatigue' }, 'first to last')
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-fatigue', toId: 'sl-recovery' }, 'last to first')
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-sleep', toId: 'sl-sleep' }, 'onto itself → untouched')
    on('PHONE', { kind: 'moveSlot', fromId: 'nope', toId: 'sl-sleep' }, 'unknown from → untouched')
    on('PHONE', { kind: 'moveSlot', fromId: 'sl-sleep', toId: 'nope' }, 'unknown to → untouched')
    // stackSlots
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-micros', ontoId: 'sl-water', surface: 'phone' }, 'two smalls stack, dragged goes under')
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-sleep', ontoId: 'sl-water', surface: 'phone' }, 'm onto s → refused')
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-micros', ontoId: 'sl-water', surface: 'desktop' }, 'desktop → refused')
    on('DESKTOP', { kind: 'stackSlots', fromId: 'sl-micros', ontoId: 'sl-bar', surface: 'desktop' }, 'desktop → refused even at equal sizes')
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-sleep', ontoId: 'sl-sleep', surface: 'phone' }, 'onto itself → refused')
    on('PHONE', { kind: 'stackSlots', fromId: 'nope', ontoId: 'sl-water', surface: 'phone' }, 'unknown from → refused')
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-water', ontoId: 'nope', surface: 'phone' }, 'unknown onto → refused')
    on('ARRANGED', { kind: 'stackSlots', fromId: 'sl-water', ontoId: 'sl-fuel2', surface: 'phone' }, 'water onto the duplicate fuel')
    on('ARRANGED', { kind: 'stackSlots', fromId: 'sl-micros', ontoId: 'sl-sleep', surface: 'phone' }, 's onto an m stack → refused')
    on('PHONE', { kind: 'stackSlots', fromId: 'sl-fuel', ontoId: 'sl-sleep', surface: 'phone' }, 'two mediums, order preserved')
    run('stack two larges', withSize(PHONE, 'sl-sleep', 'l'), { kind: 'stackSlots', fromId: 'sl-recovery', ontoId: 'sl-sleep', surface: 'phone' })
    run('stack the same widget onto itself',
      { ...PHONE, slots: [...PHONE.slots, { id: 'sl-micros2', size: 's', items: ['micros'] }] },
      { kind: 'stackSlots', fromId: 'sl-micros2', ontoId: 'sl-micros', surface: 'phone' })
    // unstackFace
    on('ARRANGED', { kind: 'unstackFace', slotId: 'sl-sleep', index: 1 }, 'lift train out → directly after')
    on('ARRANGED', { kind: 'unstackFace', slotId: 'sl-sleep', index: 0 }, 'lift sleep out')
    on('ARRANGED', { kind: 'unstackFace', slotId: 'sl-sleep', index: 5 }, 'index out of range → untouched')
    on('PHONE', { kind: 'unstackFace', slotId: 'sl-sleep', index: 0 }, 'not a stack → untouched')
    on('ARRANGED', { kind: 'unstackFace', slotId: 'nope', index: 0 }, 'unknown slot → untouched')
    run('unstack from a stack whose size the lone face cannot hold', {
      ...PHONE,
      slots: [{ id: 'st', size: 'm', items: ['sleep', 'cardio'] }, ...PHONE.slots.filter((s) => !['sleep', 'cardio'].includes(s.items[0]))],
    }, { kind: 'unstackFace', slotId: 'st', index: 1 })
    // reorderFace
    on('ARRANGED', { kind: 'reorderFace', slotId: 'sl-sleep', index: 0, to: 1 })
    on('ARRANGED', { kind: 'reorderFace', slotId: 'sl-sleep', index: 1, to: 0 })
    on('ARRANGED', { kind: 'reorderFace', slotId: 'sl-sleep', index: 0, to: 0 }, 'same index → untouched')
    on('ARRANGED', { kind: 'reorderFace', slotId: 'sl-sleep', index: 0, to: 9 }, 'out of range → untouched')
    on('ARRANGED', { kind: 'reorderFace', slotId: 'sl-sleep', index: -1, to: 0 }, 'negative → untouched')
    on('PHONE', { kind: 'reorderFace', slotId: 'nope', index: 0, to: 1 }, 'unknown slot → untouched')
    run('reorder a three-face stack', {
      ...PHONE,
      slots: [{ id: 'st', size: 's', items: ['micros', 'water', 'bar'] }, ...PHONE.slots.filter((s) => !['micros', 'water', 'bar'].includes(s.items[0]))],
    }, { kind: 'reorderFace', slotId: 'st', index: 2, to: 0 })

    emit('layout-ops.json', {
      module: 'dashboard/layout',
      fn: 'removeFace / addWidget / resizeSlot / moveSlot / stackSlots / unstackFace / reorderFace',
      note: 'Each case applies one operation to a layout. Minted slot ids are normalised to new-N in order of appearance; an updatedAt the operation stamped is -1, an untouched one is the input\'s. Both sides normalise the same way.',
      cases,
    })

    interface StackIn { a: StackSlot | null; b: StackSlot | null; surface: DashboardSurface }
    const stackCases: Case<StackIn, boolean>[] = []
    const slotA: StackSlot = { id: 'a', size: 's', items: ['fuel'] }
    const pairs: [StackSlot | null, StackSlot | null][] = [
      [slotA, { id: 'b', size: 's', items: ['sleep'] }],
      [slotA, { id: 'b', size: 'm', items: ['sleep'] }],
      [slotA, { id: 'a', size: 's', items: ['sleep'] }],
      [slotA, null], [null, slotA], [null, null],
      [{ id: 'x', size: 'xl', items: ['sleep'] }, { id: 'y', size: 'xl', items: ['body'] }],
    ]
    for (const [a, b] of pairs) {
      for (const surface of ['phone', 'desktop'] as const) {
        stackCases.push({ name: `${a?.id ?? 'null'}/${a?.size ?? '-'} + ${b?.id ?? 'null'}/${b?.size ?? '-'} @${surface}`, input: { a, b, surface }, expected: canStack(a, b, surface) })
      }
    }
    emit('layout-can-stack.json', {
      module: 'dashboard/layout',
      fn: 'canStack',
      note: 'Same size only, never the same slot, never on a desktop.',
      cases: stackCases,
    })

    const reordered: DashboardLayout = { ...ARRANGED, hidden: ['steps', 'cardio', 'sleep'] }
    emit('layout-queries.json', {
      module: 'dashboard/layout',
      fn: 'placedWidgets / hiddenWidgets',
      note: 'placed is grid order with duplicates; hidden is catalogue order.',
      cases: [
        ...(Object.keys(LAYOUTS) as LayoutName[]).map((name) => ({
          name,
          input: { layout: LAYOUTS[name] },
          expected: { placed: placedWidgets(LAYOUTS[name]), hidden: hiddenWidgets(LAYOUTS[name]) },
        })),
        {
          name: 'hidden out of catalogue order',
          input: { layout: reordered },
          expected: { placed: placedWidgets(reordered), hidden: hiddenWidgets(reordered) },
        },
      ],
    })

    interface SerIn { layout: DashboardLayout; surface: DashboardSurface; other: unknown }
    const ser: Case<SerIn, unknown>[] = []
    const v3 = { v: 3, slots: [{ id: 'a', size: 'l', items: ['sleep'] }], hidden: ['cardio'], updatedAt: 7 }
    const v4 = { v: 4, phone: { slots: [{ id: 'p', size: 's', items: ['sleep'] }], hidden: [], updatedAt: 1 }, desktop: { slots: [{ id: 'd', size: 'w', items: ['sleep'] }], hidden: [], updatedAt: 2 } }
    const sers: [string, DashboardLayout, DashboardSurface, unknown][] = [
      ['phone, nothing on disk', ARRANGED, 'phone', undefined],
      ['desktop, nothing on disk', ARRANGED, 'desktop', null],
      ['phone over a v3 — the whole v3 stands in for the desktop', ARRANGED, 'phone', v3],
      ['desktop over a v3', ARRANGED, 'desktop', v3],
      ['phone over a v4 keeps the desktop side unparsed', ARRANGED, 'phone', v4],
      ['desktop over a v4 keeps the phone side unparsed', ARRANGED, 'desktop', v4],
      ['phone over garbage', ARRANGED, 'phone', 'garbage'],
      ['phone over a v4 missing the other side', ARRANGED, 'phone', { v: 4, phone: v4.phone }],
    ]
    for (const [name, layout, surface, other] of sers) {
      // Through JSON, so an `undefined` side is absent — which is what the wire
      // carries and what the Swift side must produce.
      ser.push({ name, input: { layout, surface, other: other === undefined ? null : other }, expected: JSON.parse(JSON.stringify(serializeLayout(layout, surface, other))) })
    }
    emit('layout-serialize.json', {
      module: 'dashboard/layout',
      fn: 'serializeLayout',
      note: 'v4 wire form: the written side from the layout, the other side carried through UNPARSED from whatever was stored (a pre-split payload stands in whole). `other: null` in the input means nothing stored.',
      cases: ser,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Exercise aliases — `src/lib/exercises/aliases.ts`
//
// Exported here because `prSeed` keys its record book on the canonical name:
// a Swift port of the seed that does not resolve `Cable Lateral Raise` to
// `Single Arm Lateral Raise (Cable)` drops two asserted records on the floor.
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — exercise aliases', () => {
  it('exports the alias table and canonicalExerciseName', () => {
    emit('exercise-aliases.json', {
      module: 'exercises/aliases',
      fn: 'EXERCISE_ALIASES',
      note: 'Data, not arithmetic. Keys are lower-case + trimmed, values are canonical catalogue names; the Swift table must equal this one.',
      cases: [{ name: 'the table', input: {}, expected: EXERCISE_ALIASES }],
    })

    const keys = Object.keys(EXERCISE_ALIASES)
    const raws = [
      ...keys,
      ...keys.map((k) => k.toUpperCase()),
      ...keys.map((k) => `  ${k}\t`),
      ...new Set(Object.values(EXERCISE_ALIASES)),
      ...Object.keys(PR_TRUTH),
      'Zercher Squat', '', '   ', 'hack squat', 'HACK SQUAT', 'Leg Press Horizontal (Machine)', ' Hip Thrust (Machine) ',
    ]
    emit('exercise-canonical-name.json', {
      module: 'exercises/aliases',
      fn: 'canonicalExerciseName',
      note: 'Lower-case + trim, look up, else hand the RAW name back unchanged — case and padding included.',
      cases: raws.map((raw) => ({ name: JSON.stringify(raw), input: { raw }, expected: canonicalExerciseName(raw) })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR truth — `src/lib/training/prTruth.ts`
// ─────────────────────────────────────────────────────────────────────────────

const AXES: PrAxis[] = ['weight', 'reps', 'volume', 'e1rm']

describe('golden vectors — PR truth', () => {
  it('exports the record book, the excess floor and the axis reader', () => {
    emit('pr-truth-book.json', {
      module: 'training/prTruth',
      fn: 'PR_TRUTH / PR_LOGGED / PR_TRUTH_AS_OF',
      note: 'The asserted book and what Helix\'s own sets produce. Data, not arithmetic — the Swift constants must equal these, field for field.',
      cases: [{ name: 'the book', input: {}, expected: { asOf: PR_TRUTH_AS_OF, truth: PR_TRUTH, logged: PR_LOGGED } }],
    })

    const names: Array<string | null> = [
      ...Object.keys(PR_TRUTH),
      'Zercher Squat', '', 'calf press', 'Cable Lateral Raise', 'Leg Press Horizontal (Machine)', null,
    ]
    emit('pr-floor.json', {
      module: 'training/prTruth',
      fn: 'prFloorFor',
      note: 'Only the EXCESS of the book over PR_LOGGED floors. e1rm = max(Epley on the asserted set, Hevy\'s figure only where weight also floors), then excess. Never a sessionVolume floor. Lookup is by the exact canonical name — no aliasing, no case folding. null = nothing to raise.',
      cases: names.map((name) => ({ name: name ?? 'null', input: { name }, expected: prFloorFor(name) ?? null })),
    })

    const axisCases: Case<{ name: string; axis: PrAxis }, number | null>[] = []
    for (const name of [...Object.keys(PR_TRUTH), 'Zercher Squat']) {
      for (const axis of AXES) {
        axisCases.push({ name: `${name} · ${axis}`, input: { name, axis }, expected: truthAxisValue(PR_TRUTH[name], axis) ?? null })
      }
    }
    emit('pr-truth-axis-value.json', {
      module: 'training/prTruth',
      fn: 'truthAxisValue',
      note: 'volume resolves the stored set to kg × reps; reps is seconds ?? reps; an unknown name (no record) reads null on every axis.',
      cases: axisCases,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR seed — `src/lib/training/prSeed.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — PR seed', () => {
  it('exports the seeded book, the strict match and the era boundary', () => {
    emit('pr-seed-book.json', {
      module: 'training/prSeed',
      fn: 'SEEDED_PRS / SEED_CUTOFF / ASSERTED_DATES',
      note: 'Data, not arithmetic. 23 asserted records across 12 sessions; the Swift constants must equal these.',
      cases: [{ name: 'the seed', input: {}, expected: { cutoff: SEED_CUTOFF, assertedDates: ASSERTED_DATES, seeded: SEEDED_PRS } }],
    })

    interface SeedIn { date: string | null; exercise: string | null; setNumber: number | null; weightKg: number; reps: number }
    const seedCases: Case<SeedIn, PrAxis[]>[] = []
    const push = (name: string, i: SeedIn) =>
      seedCases.push({ name, input: i, expected: seededAxesFor(i.date, i.exercise, i.setNumber, i.weightKg, i.reps) })

    for (const p of SEEDED_PRS) {
      const base: SeedIn = { date: p.date, exercise: p.exercise, setNumber: p.setNumber, weightKg: p.weightKg, reps: p.reps }
      const tag = `${p.date} ${p.exercise} S${p.setNumber}`
      push(`${tag} — exact`, base)
      push(`${tag} — load +0.0005, inside near()`, { ...base, weightKg: p.weightKg + 0.0005 })
      push(`${tag} — load +0.01, outside near()`, { ...base, weightKg: p.weightKg + 0.01 })
      push(`${tag} — one more rep`, { ...base, reps: p.reps + 1 })
      push(`${tag} — next set number`, { ...base, setNumber: p.setNumber + 1 })
      push(`${tag} — another date`, { ...base, date: '2026-08-04' })
      push(`${tag} — upper-cased name still matches (index is lower-cased)`, { ...base, exercise: p.exercise.toUpperCase() })
      push(`${tag} — padded name does not (only aliases are trimmed)`, { ...base, exercise: `  ${p.exercise} ` })
    }
    push('07-21 lateral raise via the merged alias', { date: '2026-07-21', exercise: 'Cable Lateral Raise', setNumber: 3, weightKg: 5, reps: 10 })
    push('07-30 row via the wide-grip alias', { date: '2026-07-30', exercise: 'seated cable row - bar wide grip', setNumber: 2, weightKg: 42.5, reps: 10 })
    push('07-30 bare Seated Cable Row is a third identity and does not match', { date: '2026-07-30', exercise: 'Seated Cable Row', setNumber: 2, weightKg: 42.5, reps: 10 })
    push('null date', { date: null, exercise: 'Hip Thrust (Machine)', setNumber: 2, weightKg: 27.5, reps: 13 })
    push('empty date', { date: '', exercise: 'Hip Thrust (Machine)', setNumber: 2, weightKg: 27.5, reps: 13 })
    push('null exercise', { date: '2026-07-31', exercise: null, setNumber: 2, weightKg: 27.5, reps: 13 })
    push('empty exercise', { date: '2026-07-31', exercise: '', setNumber: 2, weightKg: 27.5, reps: 13 })
    push('null set number', { date: '2026-07-31', exercise: 'Hip Thrust (Machine)', setNumber: null, weightKg: 27.5, reps: 13 })
    push('set number 0', { date: '2026-07-31', exercise: 'Hip Thrust (Machine)', setNumber: 0, weightKg: 27.5, reps: 13 })
    emit('pr-seeded-axes.json', {
      module: 'training/prSeed',
      fn: 'seededAxesFor',
      note: 'Strict: date, canonical name (lower-cased), set number, load within 0.001 AND exact reps must all agree, or [].',
      cases: seedCases,
    })

    const dates: Array<string | null> = [
      null, '', '2025-12-31', '2026-03-10', '2026-05-20', '2026-07-30', '2026-07-31',
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-09', '2026-12-31', '2027-01-01',
    ]
    emit('pr-asserted-session.json', {
      module: 'training/prSeed',
      fn: 'isAssertedSession',
      note: 'Everything ≤ SEED_CUTOFF (string order) plus the individually listed dates. A dateless session is LIVE, never asserted.',
      cases: dates.map((date) => ({ name: date ?? 'null', input: { date }, expected: isAssertedSession(date) })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR engine — `src/lib/training/prEngine.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — PR engine', () => {
  const HIP = 'Hip Thrust (Machine)'
  const PLANK = 'Side Plank'
  const CRUNCH = 'Reverse Crunch'
  const HACK = 'Hack Squat'
  const SA = 'Single Arm Lateral Raise (Cable)'
  const CHEST = 'Chest Press (Machine)'
  const LEGEXT = 'Leg Extension'
  const HAMMER = 'DB Hammer Curl'

  const cand = (key: string, weightKg: number, reps: number, extra: Partial<PrCandidateSet> = {}): PrCandidateSet =>
    ({ key, weightKg, reps, timed: key === PLANK, setType: null, ...extra })

  /** The July 2026 Hip Thrust / Side Plank history the engine tests are built on. */
  const HISTORY: BaselineSetRow[] = [
    { key: HIP, weightKg: 25, reps: 14 }, { key: HIP, weightKg: 25, reps: 13 }, { key: HIP, weightKg: 25, reps: 12 },
    { key: PLANK, weightKg: 0, reps: 55 }, { key: PLANK, weightKg: 0, reps: 52 },
    { key: HIP, weightKg: 25, reps: 13 }, { key: HIP, weightKg: 27.5, reps: 12 }, { key: HIP, weightKg: 27.5, reps: 12 },
    { key: PLANK, weightKg: 0, reps: 57 }, { key: PLANK, weightKg: 0, reps: 54 },
  ]

  it('exports the eligibility rules and the axis labels', () => {
    const e1rm: Case<{ reps: number; floor: number | null }, boolean>[] = []
    for (const floor of [null, 5, 8, 10, 12, 15]) {
      for (let reps = 1; reps <= 20; reps++) e1rm.push({ name: `${reps} reps, floor ${floor ?? 'none'}`, input: { reps, floor }, expected: e1rmEligible(reps, floor) })
    }
    emit('pr-e1rm-eligible.json', {
      module: 'training/prEngine',
      fn: 'e1rmEligible',
      note: 'One-sided: reps ≥ the programmed floor; with no window, reps ≥ 5. Never gated above the ceiling.',
      cases: e1rm,
    })

    const setTypes: Array<string | null> = [null, '', 'warmup', 'dropset', 'ghost', 'failure', 'working', 'Warmup', 'WARMUP', 'drop', 'top']
    emit('pr-ineligible.json', {
      module: 'training/prEngine',
      fn: 'isPrIneligible',
      note: 'Exactly warmup, dropset and ghost — case-sensitive. Everything else can win and can set a bar.',
      cases: setTypes.map((setType) => ({ name: setType ?? 'null', input: { setType }, expected: isPrIneligible(setType) })),
    })

    emit('pr-reps-eligible.json', {
      module: 'training/prEngine',
      fn: 'repsAxisEligible',
      note: 'The reps axis exists only at exactly 0 kg.',
      cases: [0, 0.25, 2.5, 5, -1, 100].map((weightKg) => ({ name: `${weightKg} kg`, input: { weightKg }, expected: repsAxisEligible(weightKg) })),
    })

    const labels: Case<{ axis: PrAxis; timed: boolean }, string>[] = []
    for (const axis of AXES) for (const timed of [false, true]) labels.push({ name: `${axis}${timed ? ' timed' : ''}`, input: { axis, timed }, expected: prAxisLabel(axis, timed) })
    emit('pr-axis-label.json', {
      module: 'training/prEngine',
      fn: 'prAxisLabel',
      note: 'Whole words, no "PR " prefix; reps reads Duration on a timed hold.',
      cases: labels,
    })
  })

  it('exports the unilateral volume credits', () => {
    interface CreditRow { weightKg: number | null; reps: number | null; pairId?: string | null; side?: string | null }
    const r = (weightKg: number | null, reps: number | null, side?: string | null, pairId?: string | null): CreditRow =>
      ({ weightKg, reps, ...(side !== undefined ? { side } : {}), ...(pairId !== undefined ? { pairId } : {}) })
    const cases: Array<[string, CreditRow[]]> = [
      ['empty', []],
      ['bilateral rows score as logged', [r(5, 10), r(7.5, 8)]],
      ['null weight or reps read as 0', [r(null, 10), r(5, null), r(null, null)]],
      ['clean pair, L then R — weaker side once, on R', [r(5, 10, 'L', 'p1'), r(5, 14, 'R', 'p1')]],
      ['clean pair, R then L — lands on L', [r(5, 14, 'R', 'p1'), r(5, 10, 'L', 'p1')]],
      ['asymmetric loads — min weight × min reps', [r(4, 12, 'L', 'p1'), r(5, 10, 'R', 'p1')]],
      ['lone L scores on its own', [r(5, 12, 'L', 'solo')]],
      ['two Ls in one pair are malformed — as logged', [r(5, 10, 'L', 'p'), r(5, 12, 'L', 'p')]],
      ['three rows in one pair are malformed', [r(5, 10, 'L', 'p'), r(5, 12, 'R', 'p'), r(5, 11, 'L', 'p')]],
      ['a sideless row is not part of the pair', [r(5, 10, 'L', 'p'), r(5, 12, null, 'p')]],
      ['sides without a pairId are bilateral', [r(5, 10, 'L', null), r(5, 12, 'R', null)]],
      ['empty pairId is no pairId', [r(5, 10, 'L', ''), r(5, 12, 'R', '')]],
      ['lower-case l/r are not sides', [r(5, 10, 'l', 'p'), r(5, 12, 'r', 'p')]],
      ['two pairs interleaved', [r(5, 10, 'L', 'p1'), r(6, 9, 'L', 'p2'), r(5, 14, 'R', 'p1'), r(6, 8, 'R', 'p2')]],
      ['a pair split around a bilateral row', [r(5, 10, 'L', 'p1'), r(10, 10), r(5, 12, 'R', 'p1')]],
      ['pair with null reps on one side', [r(5, null, 'L', 'p'), r(5, 12, 'R', 'p')]],
      ['pair with null weight on one side', [r(null, 10, 'L', 'p'), r(5, 12, 'R', 'p')]],
    ]
    emit('pr-volume-credits.json', {
      module: 'training/prEngine',
      fn: 'volumeCredits',
      note: 'Per-row tonnage with L/R pairs collapsed to ONE credit (min w × min reps) on the row that completes the pair; null on the other side. Anything but exactly one L and one R per pairId is scored as logged.',
      cases: cases.map(([name, rows]) => ({ name, input: { rows }, expected: volumeCredits(rows) })),
    })
  })

  interface BaseIn { rows: BaselineSetRow[]; timedKeys: string[]; floor: boolean }
  const build = (i: BaseIn): PrBaselines =>
    buildBaselines(i.rows, (k) => i.timedKeys.includes(k), i.floor ? prFloorFor : undefined)

  it('exports buildBaselines', () => {
    const cases: Case<BaseIn, PrBaselines>[] = []
    const push = (name: string, rows: BaselineSetRow[], timedKeys: string[] = [PLANK], floor = false) => {
      const input = { rows, timedKeys, floor }
      cases.push({ name, input, expected: build(input) })
    }
    const win = { repFloor: 10 }

    push('empty', [])
    push('the July history — max per axis, plank on seconds only', HISTORY)
    push('warm-ups, drop sets and ghosts raise no bar', [
      { key: HIP, weightKg: 25, reps: 12 },
      { key: HIP, weightKg: 60, reps: 30, setType: 'warmup' },
      { key: HIP, weightKg: 55, reps: 30, setType: 'dropset' },
      { key: HIP, weightKg: 70, reps: 30, setType: 'ghost' },
    ])
    push('failure sets do', [{ key: HIP, weightKg: 25, reps: 12 }, { key: HIP, weightKg: 30, reps: 8, setType: 'failure' }])
    push('a sub-floor set sets weight and tonnage but not e1RM', [{ key: HACK, weightKg: 60, reps: 8, ...win }, { key: HACK, weightKg: 40, reps: 14, ...win }])
    push('no window: 4 reps sets no e1RM bar, 5 does', [{ key: HACK, weightKg: 60, reps: 4 }, { key: HACK, weightKg: 50, reps: 5 }])
    push('a stored est1rm of 0 is not an estimate — Epley is recomputed', [{ key: CRUNCH, weightKg: 0, reps: 15 }, { key: CRUNCH, weightKg: 0, reps: 12, est1rm: 0 }])
    push('a stored est1rm wins over Epley (|| not ??)', [{ key: HIP, weightKg: 25, reps: 12, est1rm: 99.9 }])
    push('a stored null est1rm falls back to Epley', [{ key: HIP, weightKg: 25, reps: 12, est1rm: null }])
    push('null weight sets nothing; null reps sets weight only', [{ key: HIP, weightKg: null, reps: 12 }, { key: HIP, weightKg: 30, reps: null }])
    push('a timed hold with null reps sets nothing', [{ key: PLANK, weightKg: 0, reps: null }])
    push('a timed key ignores its weight', [{ key: PLANK, weightKg: 20, reps: 40 }])
    push('the same exercise timed vs not is a different world', [{ key: PLANK, weightKg: 0, reps: 40 }], [])
    push('reps@weight keys print the load the JS way (27.5, 25, 0)', [{ key: HIP, weightKg: 27.5, reps: 12 }, { key: HIP, weightKg: 25, reps: 14 }, { key: CRUNCH, weightKg: 0, reps: 15 }, { key: HIP, weightKg: 22.5, reps: 12 }])
    push('insertion order is first-seen, per map', [{ key: 'B', weightKg: 10, reps: 10 }, { key: 'A', weightKg: 10, reps: 10 }, { key: 'B', weightKg: 12, reps: 10 }, { key: 'C', weightKg: 0, reps: 10 }])
    push('a clean pair sets ONE tonnage at the weaker side', [{ key: SA, weightKg: 5, reps: 12, side: 'L', pairId: 'h1' }, { key: SA, weightKg: 5, reps: 12, side: 'R', pairId: 'h1' }])
    push('paired and unsided rows of one movement share a scale', [
      { key: SA, weightKg: 5, reps: 13, side: 'L', pairId: 'jul23' }, { key: SA, weightKg: 5, reps: 15, side: 'R', pairId: 'jul23' },
      { key: SA, weightKg: 5, reps: 15 },
    ])
    push('a warm-up inside a pair still credits the pair to the other row', [
      { key: SA, weightKg: 5, reps: 13, side: 'L', pairId: 'p', setType: 'warmup' }, { key: SA, weightKg: 5, reps: 15, side: 'R', pairId: 'p' },
    ])

    // The floor. Calf Press exactly as Helix held it on 2026-08-10.
    const CALF_HISTORY: BaselineSetRow[] = [
      { key: 'Calf Press', weightKg: 65, reps: 15 }, { key: 'Calf Press', weightKg: 67.5, reps: 14 }, { key: 'Calf Press', weightKg: 67.5, reps: 13 },
      { key: 'Calf Press', weightKg: 67.5, reps: 15 }, { key: 'Calf Press', weightKg: 67.5, reps: 13 }, { key: 'Calf Press', weightKg: 67.5, reps: 12 },
    ]
    push('Calf Press without the floor', CALF_HISTORY)
    push('Calf Press with the floor — 72.5 / 1012.5 asserted', CALF_HISTORY, [PLANK], true)
    for (const name of Object.keys(PR_TRUTH)) {
      const timed = name === PLANK
      push(`floor over one small row — ${name}`, [{ key: name, weightKg: timed ? 0 : 1, reps: 1 }], [PLANK], true)
    }
    push('floor visits keys in the union order weight, seconds, volume, e1rm', [
      { key: 'Leg Press', weightKg: 72.5, reps: null },
      { key: PLANK, weightKg: 0, reps: 30 },
      { key: CRUNCH, weightKg: 0, reps: 10 },
      { key: 'Calf Press', weightKg: 65, reps: null },
      { key: 'Hanging Knee Raise', weightKg: 0, reps: 5 },
    ], [PLANK], true)
    push('floor is a max — a logged best above the book stands', [{ key: 'Leg Press', weightKg: 90, reps: 10 }], [PLANK], true)
    push('floor on a name the book has never heard of is a no-op', [{ key: 'Zercher Squat', weightKg: 90, reps: 10 }], [PLANK], true)
    push('floor never visits a key that only has reps@weight', [{ key: 'Leg Press', weightKg: null, reps: 10 }], [PLANK], true)
    for (const c of [
      { name: 'Leg Press', logged: 72.5 }, { name: 'Leg Extension', logged: 37.5 }, { name: 'Seated Leg Curl', logged: 45 },
      { name: 'Pec Deck', logged: 52.5 }, { name: 'Lat Pulldown', logged: 47 }, { name: 'Straight-Arm Pulldown', logged: 16.25 },
      { name: 'Cable Overhead Extension', logged: 11.25 }, { name: 'DB Shoulder Press', logged: 30 },
    ]) {
      push(`floor over the logged best — ${c.name}`, [{ key: c.name, weightKg: c.logged, reps: 12 }], [], true)
    }

    // A grid: every single row and every ordered pair of rows from a pool that
    // covers each branch of the fold.
    const pool: Array<[string, BaselineSetRow]> = [
      ['40×12', { key: 'X', weightKg: 40, reps: 12 }],
      ['45×10', { key: 'X', weightKg: 45, reps: 10 }],
      ['45×10 warmup', { key: 'X', weightKg: 45, reps: 10, setType: 'warmup' }],
      ['50×8 floor 10', { key: 'X', weightKg: 50, reps: 8, repFloor: 10 }],
      ['50×8 floor 8', { key: 'X', weightKg: 50, reps: 8, repFloor: 8 }],
      ['0×15', { key: 'X', weightKg: 0, reps: 15 }],
      ['0×12 est 0', { key: 'X', weightKg: 0, reps: 12, est1rm: 0 }],
      ['40×12 est 57', { key: 'X', weightKg: 40, reps: 12, est1rm: 57 }],
      ['null×12', { key: 'X', weightKg: null, reps: 12 }],
      ['40×null', { key: 'X', weightKg: 40, reps: null }],
      ['45×3', { key: 'X', weightKg: 45, reps: 3 }],
      ['42.5×11 failure', { key: 'X', weightKg: 42.5, reps: 11, setType: 'failure' }],
      ['45×10 ghost', { key: 'X', weightKg: 45, reps: 10, setType: 'ghost' }],
      ['45×10 dropset', { key: 'X', weightKg: 45, reps: 10, setType: 'dropset' }],
      ['5×10 L p', { key: 'X', weightKg: 5, reps: 10, side: 'L', pairId: 'p' }],
      ['5×12 R p', { key: 'X', weightKg: 5, reps: 12, side: 'R', pairId: 'p' }],
    ]
    for (const [a, ra] of pool) push(`grid ${a}`, [ra], [])
    for (const [a, ra] of pool) for (const [b, rb] of pool) push(`grid ${a} + ${b}`, [ra, rb], [])

    emit('pr-baselines.json', {
      module: 'training/prEngine',
      fn: 'buildBaselines',
      note: 'Per-axis maxima as insertion-ordered [key, value] tuples. Ineligible set types set no bar; a timed key scores seconds only; e1RM is gated on the rep floor and read from a stored est1rm with || (0 recomputes); the unilateral collapse applies; `floor: true` folds prFloorFor(key) in last as a max. Order of tuples matters — the Swift port must preserve first-seen order.',
      cases,
    })
  })

  it('exports whole sessions — detection, deltas, counts and the ledger', () => {
    interface SessIn { sets: PrCandidateSet[]; baselines: PrBaselines }
    interface RecOut { axis: PrAxis; weightKg: number; reps: number; value: number }
    interface SessOut {
      perSet: Array<{ axes: PrAxis[]; est1rm: number | null; records: Partial<Record<PrAxis, { value: number; previous: number }>> }>
      axesByKey: Array<{ key: string; axes: PrAxis[] }>
      prCount: number
      recordSets: Array<{ key: string; records: RecOut[] }>
    }
    const run = (i: SessIn): SessOut => {
      const r = detectSessionPrs(i.sets, i.baselines)
      const rec = recordSets(i.sets, r)
      return {
        perSet: r.perSet,
        axesByKey: [...r.axesByKey].map(([key, axes]) => ({ key, axes: [...axes] })),
        prCount: r.prCount,
        recordSets: [...rec].map(([key, m]) => ({ key, records: [...m].map(([axis, s]) => ({ axis, ...s })) })),
      }
    }
    const cases: Case<SessIn, SessOut>[] = []
    const push = (name: string, sets: PrCandidateSet[], baselines: PrBaselines) => {
      const input = { sets, baselines }
      cases.push({ name, input, expected: run(input) })
    }
    const bl = (rows: BaselineSetRow[], timedKeys: string[] = [PLANK], floor = false) => build({ rows, timedKeys, floor })
    const win = { repFloor: 10 }

    // ── The July 31 session ──
    const july = bl(HISTORY)
    push('July 31 — volume + e1RM on the 27.5 × 13, duration on the 58 s plank, pr_count 3',
      [cand(HIP, 25, 14), cand(HIP, 27.5, 13), cand(HIP, 27.5, 13), cand(PLANK, 0, 58), cand(PLANK, 0, 55)], july)
    push('no baseline at all — a first-ever log is not a record', [cand('Brand New Lift', 100, 20)], EMPTY_BASELINES)
    push('warm-up, drop set and ghost win nothing', [cand(HIP, 40, 20, { setType: 'warmup' }), cand(HIP, 40, 20, { setType: 'dropset' }), cand(HIP, 40, 20, { setType: 'ghost' })], july)
    push('a failure set can win', [cand(HIP, 40, 20, { setType: 'failure' })], july)
    push('weight axis with its delta — 30 beat 27.5', [cand(HIP, 30, 8)], july)
    push('30 × 10 — weight, volume and e1RM, each with what it beat', [cand(HIP, 30, 10)], july)
    push('a tie on every axis is not a record', [cand(HIP, 27.5, 12)], july)
    push('a plank that only ties', [cand(PLANK, 0, 57)], july)
    push('a plank with weight is still only seconds', [cand(PLANK, 20, 58)], july)

    // ── Reps only at 0 kg ──
    const crunch = bl([{ key: CRUNCH, weightKg: 0, reps: 15 }, { key: CRUNCH, weightKg: 0, reps: 15 }], [])
    push('bodyweight reps — 17 wins, 16 loses to the 17 just logged, est1rm null', [cand(CRUNCH, 0, 17), cand(CRUNCH, 0, 16), cand(CRUNCH, 0, 15)], crunch)
    push('a 0 kg set can never win e1RM', [cand(CRUNCH, 0, 40)], crunch)
    push('loaded lift adding a rep at the same load — tonnage and e1RM, never reps',
      [cand(HACK, 55, 12, win)], bl([{ key: HACK, weightKg: 55, reps: 11, ...win }, { key: HACK, weightKg: 50, reps: 12, ...win }], []))
    push('reps@weight bar exists only at the exact load — 0.25 kg has no bar', [cand(CRUNCH, 0.25, 40)], crunch)

    // ── The e1RM gate ──
    const hackGate = bl([{ key: HACK, weightKg: 60, reps: 8, ...win }, { key: HACK, weightKg: 40, reps: 14, ...win }], [])
    push('e1RM gate — 50×12 then 55×11 in the window; only the second keeps volume + e1RM', [cand(HACK, 50, 12, win), cand(HACK, 55, 11, win)], hackGate)
    push('a sub-floor candidate wins weight but is never judged on e1RM', [cand(HACK, 62.5, 6, win)], hackGate)
    push('above the ceiling is not gated — 72.5 × 13 after 72.5 × 12',
      [cand('Leg Press Horizontal (Machine)', 72.5, 13, { repFloor: 8 })], bl([{ key: 'Leg Press Horizontal (Machine)', weightKg: 72.5, reps: 12, repFloor: 8 }], []))
    push('no window — 4 reps is excluded, 5 is not', [cand(HACK, 70, 4), cand(HACK, 61, 5)], bl([{ key: HACK, weightKg: 60, reps: 10 }], []))

    // ── Volume is a per-set axis ──
    const legext = bl([{ key: LEGEXT, weightKg: 60, reps: 5 }], [])
    push('volume lands on the heaviest set, not the last', [cand(LEGEXT, 30, 12), cand(LEGEXT, 30, 11)], legext)
    push('three identical sets are no record', [cand('Romanian Deadlift (DB)', 35, 12), cand('Romanian Deadlift (DB)', 35, 12), cand('Romanian Deadlift (DB)', 35, 12)],
      bl([{ key: 'Romanian Deadlift (DB)', weightKg: 35, reps: 12 }, { key: 'Romanian Deadlift (DB)', weightKg: 35, reps: 12 }], []))
    push('Leg Extension 2026-08-03 — one extra rep on one set of three is nothing',
      [cand(LEGEXT, 37.5, 13), cand(LEGEXT, 37.5, 13), cand(LEGEXT, 37.5, 12, { setType: 'failure' })],
      bl([
        { key: LEGEXT, weightKg: 37.5, reps: 12 }, { key: LEGEXT, weightKg: 35, reps: 15 }, { key: LEGEXT, weightKg: 37.5, reps: 11, setType: 'failure' },
        { key: LEGEXT, weightKg: 37.5, reps: 13 }, { key: LEGEXT, weightKg: 37.5, reps: 12, setType: 'failure' }, { key: LEGEXT, weightKg: 37.5, reps: 12 },
      ], []))

    // ── Raw axes ──
    push('raw axes — implied e1RM counted beside the tonnage record', [cand(CHEST, 37.5, 12)], bl([{ key: CHEST, weightKg: 37.5, reps: 10 }], []))
    push('raw axes — all three', [cand(CHEST, 37.5, 12)], bl([{ key: CHEST, weightKg: 35, reps: 12 }], []))
    push('raw axes — a lone e1RM for a better load/rep trade', [cand(CHEST, 55, 8)], bl([{ key: CHEST, weightKg: 100, reps: 3 }, { key: CHEST, weightKg: 45, reps: 10 }], []))

    // ── Two sets, same axis; the ledger ──
    const hackSets = [cand(HACK, 50, 12, win), cand(HACK, 55, 11, win)]
    push('ledger files the BEST e1RM (75.2), not the first claimed (70.0)', hackSets, bl([{ key: HACK, weightKg: 70, reps: 4, ...win }, { key: HACK, weightKg: 45, reps: 10, ...win }], []))
    push('ledger files the heaviest load and its tonnage', hackSets, bl([{ key: HACK, weightKg: 40, reps: 14, ...win }], []))
    push('ledger keeps the LAST reps claimant — per-load record', [cand(CRUNCH, 0, 16), cand(CRUNCH, 0, 17), cand(CRUNCH, 0, 18)], crunch)

    // ── Unilateral ──
    const pair = (n: string, side: 'L' | 'R', w: number, reps: number, extra: Partial<PrCandidateSet> = {}): PrCandidateSet =>
      cand(SA, w, reps, { side, pairId: n, ...extra })
    push('pair scored at the WEAKER side — asymmetric session is not a record', [pair('t1', 'L', 5, 10), pair('t1', 'R', 5, 14)],
      bl([{ key: SA, weightKg: 5, reps: 12, side: 'L', pairId: 'h1' }, { key: SA, weightKg: 5, reps: 12, side: 'R', pairId: 'h1' }], []))
    const pair50 = bl([{ key: SA, weightKg: 5, reps: 10, side: 'L', pairId: 'h1' }, { key: SA, weightKg: 5, reps: 10, side: 'R', pairId: 'h1' }], [])
    push('pair record filed ONCE, on the completing row, at one side\'s tonnage', [pair('t1', 'L', 5, 12), pair('t1', 'R', 5, 12)], pair50)
    push('pair logged R first — the credit lands on L', [pair('t1', 'R', 5, 12), pair('t1', 'L', 5, 12)], pair50)
    push('the 2026-08-05 bug — paired and unsided rows on one scale, 5 × 17 wins volume AND e1RM', [cand(SA, 5, 17)],
      bl([{ key: SA, weightKg: 5, reps: 13, side: 'L', pairId: 'jul23' }, { key: SA, weightKg: 5, reps: 15, side: 'R', pairId: 'jul23' }, { key: SA, weightKg: 5, reps: 15 }], []))
    push('a lone side scores on its own', [cand(SA, 5, 12, { side: 'L', pairId: 'solo' })], bl([{ key: SA, weightKg: 5, reps: 10 }], []))
    push('a pair is one group — L wins weight, R only ties, volume completes on R',
      [pair('p1', 'L', 5, 13, { repFloor: 12 }), pair('p1', 'R', 5, 15, { repFloor: 12 })], bl([{ key: SA, weightKg: 4, reps: 12 }, { key: SA, weightKg: 4, reps: 10 }], []))
    push('a pair whose two halves both beat the bar keep the axis on BOTH rows (weight)',
      [pair('p1', 'L', 6, 12), pair('p1', 'R', 6, 12)], bl([{ key: SA, weightKg: 5, reps: 12 }], []))
    push('a malformed pair (two Ls) is scored as logged', [pair('p', 'L', 5, 12), pair('p', 'L', 5, 13)], pair50)
    push('empty pairId — no credit collapse, but `??` makes one supersession group of every empty id, so the beaten set keeps its axes (unreachable from real callers; pinned as-is)',
      [cand(HIP, 25, 15, { pairId: '' }), cand(HIP, 27.5, 14, { pairId: '' })], bl([{ key: HIP, weightKg: 25, reps: 14 }]))

    // ── Supersession ──
    const win8 = { repFloor: 8 }
    push('supersession — 2026-08-07 Hip Thrust: the 385 kg set keeps volume, the 375 kg set loses it',
      [cand(HIP, 25, 15, win8), cand(HIP, 27.5, 14, win8), cand(HIP, 27.5, 13, win8)],
      bl([{ key: HIP, weightKg: 25, reps: 14, ...win8 }, { key: HIP, weightKg: 27.5, reps: 13, ...win8 }]))
    push('supersession — ledger files the set the flags point at', [cand(HIP, 25, 15, win8), cand(HIP, 27.5, 14, win8)], bl([{ key: HIP, weightKg: 25, reps: 14, ...win8 }]))
    push('supersession — a tying set never takes the axis', [cand(HIP, 25, 14, win8), cand(HIP, 25, 14, win8)], bl([{ key: HIP, weightKg: 25, reps: 12, ...win8 }]))
    push('supersession — each axis independently (weight on set 1, volume on set 2)', [cand(HIP, 30, 10, win8), cand(HIP, 25, 15, win8)], bl([{ key: HIP, weightKg: 25, reps: 12, ...win8 }]))
    push('supersession across two exercises does not cross keys', [cand(HIP, 30, 10), cand(CHEST, 45, 10), cand(HIP, 32.5, 8)],
      bl([{ key: HIP, weightKg: 25, reps: 12 }, { key: CHEST, weightKg: 40, reps: 10 }]))

    // ── The seeded era ──
    const dated = (key: string, w: number, reps: number, date: string | null, setNumber: number, extra: Partial<PrCandidateSet> = {}) =>
      cand(key, w, reps, { date, exerciseName: key, setNumber, ...extra })
    push('seed — a first-ever set the engine could never derive (records empty: nothing to beat)', [dated(HAMMER, 20, 12, '2026-07-21', 1)], EMPTY_BASELINES)
    push('seed — SUPPRESSES a record detection would have found', [dated(HAMMER, 22.5, 12, '2026-07-21', 3)], bl([{ key: HAMMER, weightKg: 16, reps: 10 }], []))
    push('seed — an edited set stops matching', [dated(HAMMER, 20, 11, '2026-07-21', 1)], EMPTY_BASELINES)
    push('seed — live again after the cutoff', [dated(HAMMER, 22.5, 12, '2026-08-04', 1)], bl([{ key: HAMMER, weightKg: 16, reps: 10 }], []))
    push('seed — not replayed on a later date', [dated(HAMMER, 20, 12, '2026-08-04', 1)], EMPTY_BASELINES)
    push('seed — the date is read off the FIRST dated set', [cand(HAMMER, 22.5, 12), dated(HAMMER, 20, 12, '2026-07-21', 1)], bl([{ key: HAMMER, weightKg: 16, reps: 10 }], []))
    push('seed — an empty-string date is no date', [dated(HAMMER, 22.5, 12, '', 1)], bl([{ key: HAMMER, weightKg: 16, reps: 10 }], []))
    push('seed — the key is the alias, exerciseName canonicalises', [dated('Cable Lateral Raise', 5, 10, '2026-07-21', 3)], EMPTY_BASELINES)
    push('seed — exerciseName absent falls back to the key', [cand(HAMMER, 20, 12, { date: '2026-07-21', setNumber: 1 })], EMPTY_BASELINES)
    push('seed — an asserted axis with a baseline still reports the delta', [dated(HAMMER, 20, 12, '2026-07-21', 1)], bl([{ key: HAMMER, weightKg: 16, reps: 10 }], []))
    push('seed — a seeded session still advances the index for later sets', [dated(HAMMER, 20, 12, '2026-07-21', 1), dated(HAMMER, 22.5, 12, '2026-07-21', 2)], EMPTY_BASELINES)
    push('seed — a warm-up on a seeded set still carries its asserted axes (the list is authority)', [dated(HAMMER, 20, 12, '2026-07-21', 1, { setType: 'warmup' })], EMPTY_BASELINES)

    // ── 2026-08-02, end to end ──
    const D = '2026-08-02'
    const c2 = (name: string, setNumber: number, weightKg: number, reps: number, setType: string | null = null): PrCandidateSet =>
      ({ key: name, exerciseName: name, setNumber, weightKg, reps, setType, timed: false, date: D })
    const SETS = [
      c2('Incline DB Press', 1, 35, 12), c2('Incline DB Press', 2, 40, 10), c2('Incline DB Press', 3, 40, 8),
      c2('Lat Pulldown', 1, 47, 12), c2('Lat Pulldown', 2, 47, 12), c2('Lat Pulldown', 3, 47, 10),
      c2(CHEST, 1, 37.5, 12), c2(CHEST, 2, 40, 8, 'failure'),
      c2('Seated Cable Row (V-Grip)', 1, 42.5, 12), c2('Seated Cable Row (V-Grip)', 2, 42.5, 13),
      c2('Pec Deck', 1, 50, 15), c2('Pec Deck', 2, 50, 11),
      c2('Straight-Arm Pulldown', 1, 16.25, 15), c2('Straight-Arm Pulldown', 2, 16.25, 12), c2('Straight-Arm Pulldown', 3, 15, 11),
      c2('Face Pull', 1, 16.25, 15), c2('Face Pull', 2, 15, 16), c2('Face Pull', 3, 15, 15),
    ]
    const REST: BaselineSetRow[] = [
      ...[[37.5, 12], [37.5, 12], [35, 12]].map(([w, r]) => ({ key: CHEST, weightKg: w, reps: r })),
      ...[[42.5, 12], [42.5, 12]].map(([w, r]) => ({ key: 'Seated Cable Row (V-Grip)', weightKg: w, reps: r })),
      ...[[50, 15], [52.5, 9]].map(([w, r]) => ({ key: 'Pec Deck', weightKg: w, reps: r })),
      ...[[16.25, 15], [16.25, 11], [15, 11]].map(([w, r]) => ({ key: 'Straight-Arm Pulldown', weightKg: w, reps: r })),
      ...[[15, 14], [16.25, 15], [15, 15]].map(([w, r]) => ({ key: 'Face Pull', weightKg: w, reps: r })),
      ...[[47, 12], [47, 12], [47, 10]].map(([w, r]) => ({ key: 'Lat Pulldown', weightKg: w, reps: r })),
    ]
    const incline = (rows: number[][]): BaselineSetRow[] => rows.map(([w, r]) => ({ key: 'Incline DB Press', weightKg: w, reps: r }))
    const JUL_19 = incline([[35, 11], [35, 12], [35, 12]])
    const history = bl([...JUL_19, ...incline([[35, 12], [35, 12], [35, 12]]), ...REST], [])
    const poisoned = bl([...JUL_19, ...incline([[63.75, 12], [63.75, 12], [63.75, 12]]), ...REST], [])
    const bare = SETS.map((s) => ({ ...s, date: null }))
    push('2026-08-02 asserted — exactly the three records', SETS, history)
    push('2026-08-02 asserted — the same three against the poisoned history', SETS, poisoned)
    push('2026-08-02 derived against the poisoned history — Incline never found, 3 wrong axes', bare, poisoned)
    push('2026-08-02 derived against the repaired history — 5 axes, both Incline records', bare, history)

    // ── The floor, through detection ──
    const CALF = 'Calf Press'
    const calfRows: BaselineSetRow[] = [
      { key: CALF, weightKg: 65, reps: 15 }, { key: CALF, weightKg: 67.5, reps: 14 }, { key: CALF, weightKg: 67.5, reps: 13 },
      { key: CALF, weightKg: 67.5, reps: 15 }, { key: CALF, weightKg: 67.5, reps: 13 }, { key: CALF, weightKg: 67.5, reps: 12 },
    ]
    const calfSet = (w: number, reps: number) => cand(CALF, w, reps, { date: '2026-08-10' })
    push('Calf Press 2026-08-10 WITHOUT the floor — 70 kg flags weight', [calfSet(70, 12), calfSet(70, 13), calfSet(70, 13)], bl(calfRows, [], false))
    push('Calf Press 2026-08-10 WITH the floor — 70 < 72.5, no weight axis', [calfSet(70, 12), calfSet(70, 13), calfSet(70, 13)], bl(calfRows, [], true))
    push('Calf Press — 75 kg beats the asserted best', [calfSet(75, 12)], bl(calfRows, [], true))
    push('Calf Press — 70 × 14: weight no, volume no, e1RM 102.7 > 100.75 YES', [calfSet(70, 14)], bl(calfRows, [], true))
    for (const c of [
      { name: 'Leg Press', logged: 72.5, asserted: 80, comeback: 75 }, { name: LEGEXT, logged: 37.5, asserted: 42.5, comeback: 40 },
      { name: 'Seated Leg Curl', logged: 45, asserted: 50, comeback: 47.5 }, { name: 'Pec Deck', logged: 52.5, asserted: 55, comeback: 55 },
      { name: 'Lat Pulldown', logged: 47, asserted: 49.5, comeback: 49.5 }, { name: 'Straight-Arm Pulldown', logged: 16.25, asserted: 17.5, comeback: 17.5 },
      { name: 'Cable Overhead Extension', logged: 11.25, asserted: 12.5, comeback: 12.5 }, { name: 'DB Shoulder Press', logged: 30, asserted: 31, comeback: 31 },
    ]) {
      const b = bl([{ key: c.name, weightKg: c.logged, reps: 12 }], [], true)
      push(`floor — ${c.name}: returning to ${c.comeback} kg is not a record`, [cand(c.name, c.comeback, 10, { date: '2026-08-12' })], b)
      push(`floor — ${c.name}: ${c.asserted + 2.5} kg still is`, [cand(c.name, c.asserted + 2.5, 10, { date: '2026-08-12' })], b)
    }
    push('floor — Side Plank keeps its in-window 60 s record (no seconds floor); 61 wins', [cand(PLANK, 0, 61)], bl([{ key: PLANK, weightKg: 0, reps: 60 }], [PLANK], true))
    push('floor — Reverse Crunch reps@0 floor from the book', [cand(CRUNCH, 0, 19)], bl([{ key: CRUNCH, weightKg: 0, reps: 15 }], [], true))

    // ── Grids ──
    const X = 'X'
    const xb = bl([{ key: X, weightKg: 40, reps: 12, ...win }, { key: X, weightKg: 45, reps: 10, ...win }, { key: X, weightKg: 42.5, reps: 11, setType: 'failure', ...win }], [])
    const setTypes: Array<string | null> = [null, 'failure', 'warmup']
    for (const w of [40, 42.5, 45, 47.5]) for (const reps of [4, 9, 10, 12, 14]) for (const setType of setTypes) {
      push(`grid single ${w}×${reps}${setType ? ` ${setType}` : ''}`, [cand(X, w, reps, { setType, ...win })], xb)
    }
    const doubles: Array<[number, number]> = [[45, 10], [45, 12], [47.5, 8], [47.5, 10], [42.5, 14], [40, 15]]
    for (const [w1, r1] of doubles) for (const [w2, r2] of doubles) {
      push(`grid double ${w1}×${r1} then ${w2}×${r2}`, [cand(X, w1, r1, win), cand(X, w2, r2, win)], xb)
    }
    const sab = bl([{ key: SA, weightKg: 5, reps: 12, side: 'L', pairId: 'h' }, { key: SA, weightKg: 5, reps: 12, side: 'R', pairId: 'h' }], [])
    for (const wL of [5, 6]) for (const rL of [10, 12, 13]) for (const rR of [10, 12, 13]) {
      push(`grid pair L ${wL}×${rL} / R 5×${rR}`, [pair('g', 'L', wL, rL), pair('g', 'R', 5, rR)], sab)
    }
    const plank = bl([{ key: PLANK, weightKg: 0, reps: 57 }])
    for (const s of [50, 57, 58, 60]) push(`grid plank ${s} s`, [cand(PLANK, 0, s)], plank)
    for (const [a, b] of [[58, 60], [60, 58], [60, 60]]) push(`grid plank ${a} s then ${b} s`, [cand(PLANK, 0, a), cand(PLANK, 0, b)], plank)

    emit('pr-session.json', {
      module: 'training/prEngine',
      fn: 'detectSessionPrs + recordSets',
      note: 'Whole sessions in performed order against baselines built by the TypeScript. perSet is parallel to sets (axes in detection order weight, reps, volume, e1rm; est1rm null for holds and 0 kg; records = per axis the set beat a bar on AT DETECTION TIME, the new value and the beaten one, omitted where there was no bar — captured BEFORE supersession, so an axis later stripped from `axes` keeps its record; consumers index records through axes, as livePrs.ts does). axesByKey and recordSets are insertion-ordered. An asserted session (≤ 2026-07-31 or 2026-08-02, read off the first dated set) takes its axes from the seed and skips supersession.',
      cases,
    })
  })
})
