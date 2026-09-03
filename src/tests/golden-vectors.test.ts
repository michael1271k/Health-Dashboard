import { describe, it, expect, vi } from 'vitest'
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
import { isoAddDays } from '@/lib/utils/week'
import { PHASES, phaseSpanFor, getWeekPhase, enumerateWeeks, type PhaseKind } from '@/lib/phases'
import {
  LEVERS, DEFICIT_LEVERS, DEFAULT_LEVER, LEVER_SCHEDULE, scheduledLeverOn, leverForDate, leverById, isLeverId,
  atwaterKcal, applyLever, goalsForDate, leverKindOn, leverPeriods,
  type LeverGoals, type LeverId, type NutritionLever, type TargetPeriod,
} from '@/lib/nutrition/levers'
import { maintenanceLeverOn, isMaintenanceDate, maintenanceSpanFor, maintenanceBands } from '@/lib/nutrition/maintenance'
import {
  CONTEXT_MODES, CONTEXT_META, isRangeMode, contextFromDayLabel, contextFromSetting, scoringContextFor,
  suspendsStepGoal, contextRangeLine, daysBetween, rangeCovers, contextRangesIn, contextRangeLabel, type ContextMode,
} from '@/lib/nutrition/context'
import { BUILTIN_PROFILES, profileByKey, profileToDailyTarget, matchesProfile, type TargetProfile } from '@/lib/nutrition/profiles'
import { tracksCarbs, tracksFat, hasDailyTarget, applyDailyTarget, type DailyTarget } from '@/lib/nutrition/dailyTargets'
import { activeProgram, type ProgramPhase } from '@/lib/programs'
import {
  parseRepWindow, repWindowFor, holdTargetFor, clearedCeiling, loadLadder, workLoads, ladderVerdict,
  topLoadCleared, levelUpCue, progressionVerdict, timedProgressionVerdict,
  type WorkingSet, type RepWindow, type ProgressionVerdict,
} from '@/lib/training/ceilings'
import {
  CR10_MIN, CR10_MAX, CR10_ANCHORS, cr10Label, normalizeCr10, RPE_LADDER, rpeStopIndex, rpeLabel, nudgeRpe,
  EFFORT_WORDS, effortCr10, effortWordFor, EFFORT_COLD_BASELINE, EFFORT_MIN_HISTORY, suggestEffortWord, type EffortWord,
} from '@/lib/training/effort'
import {
  SET_TAGS, isWorkingSet, setTagFor, setComposition, SET_QUALITY, SET_QUALITY_KEYS, setQualityFor, isSetQuality,
} from '@/lib/training/setTags'
import {
  REST_STEP_SEC, REST_MIN_SEC, REST_MAX_SEC, clampRestSec, programRestSec, restTargetKey, sessionRestKey, formatRestTarget,
} from '@/lib/training/restTargets'
import {
  draftTotals, draftVolumeSeries, isPairCompactable, pairAsymmetry, applySetPatch, cascadeSetEdit,
  cardioSummary, cleanSessionTitle, type SessionDraft, type DraftSet, type DraftExercise,
} from '@/lib/sessions/draft'
import type { SplitDay } from '@/lib/types/workout'
import { resolveSeededRpe, deriveSessionRpe } from '@/lib/training/rpeMemory'
import { findNextSet, formatLastTime, formatLastRpe, formatLoad, formatRpe, type NextSet } from '@/lib/sessions/nextSet'
import { previousDisplayRows, alignPreviousSets } from '@/lib/sessions/prevAlign'
import type { HistorySet, ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { isTimedExercise } from '@/lib/exercises/timed'
import { livePrDigest, computeLivePrs } from '@/lib/sessions/livePrs'
import type { AxisRecord } from '@/lib/training/prEngine'
import { metKcalPerMin, medianKcalPerMin, estimateCalories, estimateAvgBpm, type KcalSample } from '@/lib/sessions/estimates'
import { sessionElapsedSec, sessionActiveSec, elapsedDurationMin, pausedMsAt, MAX_SESSION_SEC } from '@/lib/sessions/sessionElapsed'
import {
  CLOCK_KEY, getSessionClock, setClockMode, startClock, pauseClock, resetClock, restartClock, setDurationSec,
  elapsedMs, elapsedSec, remainingSec, isTimerDone, clockReadingSec, clockIsLive, formatClock, clampDuration,
  type SessionClock, type ClockMode,
} from '@/lib/sessions/sessionClock'
import { weekStartOf } from '@/lib/utils/week'
import { weekNumberOf, weekLabelOf } from '@/lib/reports/weekNumber'
import {
  buildWeeklyExport, weeklySummary, trendTotals, energyBalance, sparkline, markdownTable, nutrientLine, flaggedNutrients,
  setDetail, consolidateSupplements, trendLedger, priorReportNote, fatigueLabelsFor, FATIGUE_SLOT_LABELS,
  UNILATERAL_VOLUME_NOTE, EPLEY_NOTE, APPLE_WATCH_DISCLAIMER,
  type WeeklyExportInput, type ExportDay, type ExportSet, type ExportSession, type WeeklySummary, type TrendTotals, type EnergyBalance,
} from '@/lib/reports/weeklyExport'
import { derivedWeek, type DerivedWeek } from '@/lib/reports/derived'
import { weekJsonBlock } from '@/lib/reports/weekJson'
import { paceMinPerKm, formatPace } from '@/lib/cardio/metrics'
import { formatSet, isUnloadedSet } from '@/lib/utils/setFormat'
import { weighInSkipReason, isDefaultSkipReason } from '@/lib/body/weighIn'
import { NUTRIENT_TARGETS } from '@/lib/nutrition/nutrientTargets'
import { volumeZone, type VolumeZone } from '@/lib/training/landmarks'
import { deriveBodyComp, whrBand, visceralBand, type BodyCompDerived, type WhrBand } from '@/lib/body/composition'
import { deltaVerdict, MAINTENANCE_BAND, type Metric, type Verdict } from '@/lib/body/deltaVerdict'
import { bodyCompState, missingBodyCompFields, bodyCompGapLabel, bodyCompGapShort, type BodyCompFields } from '@/lib/body/compGap'

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

// ─────────────────────────────────────────────────────────────────────────────
// Phases — `src/lib/phases.ts` (the timeline, not the palette)
//
// Exported ahead of its place in the list because `maintenance.ts` falls back
// to `phaseSpanFor` for the deloads that predate levers. Colours stay out: a hex
// is a HelixUI token, not domain arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

const daysFrom = (start: string, count: number, step = 1): string[] =>
  Array.from({ length: count }, (_, i) => isoAddDays(start, i * step))

describe('golden vectors — phases', () => {
  it('exports the phase table, the day resolver and the week resolver', () => {
    emit('phases-table.json', {
      module: 'phases',
      fn: 'PHASES',
      note: 'Data, not arithmetic. Every start is a Sunday; the Swift table must equal this one.',
      cases: [{ name: 'the timeline', input: {}, expected: PHASES }],
    })

    const spanDates = [
      ...daysFrom('2026-03-01', 110, 3),
      '2026-03-07', '2026-03-08', '2026-05-09', '2026-05-10', '2026-06-20', '2026-06-21', '2026-06-27', '2026-06-28',
      '2026-07-11', '2026-07-12', '2026-07-18', '2026-07-19', '2026-10-17', '2026-10-18', '2026-10-31', '2026-11-01',
      '2027-01-16', '2027-01-17', '2025-12-31', 'garbage', '',
    ]
    emit('phase-span.json', {
      module: 'phases',
      fn: 'phaseSpanFor',
      note: 'The phase a DATE falls in and how far into it that date is. First match in table order; null between phases and for an unparseable date.',
      cases: spanDates.map((date) => {
        const s = phaseSpanFor(date)
        return { name: date || 'empty', input: { date }, expected: s ? { kind: s.def.kind, name: s.def.name, start: s.start, dayIndex: s.dayIndex } : null }
      }),
    })

    const sundays = daysFrom('2026-03-01', 48, 7)
    emit('week-phase.json', {
      module: 'phases',
      fn: 'getWeekPhase',
      note: 'The phase for a SUNDAY week start — label, short and eraTag strings exactly. A date that is not a week start of any phase is null.',
      cases: [...sundays, '2026-07-20', '2026-07-15', 'garbage', ''].map((weekStart) => ({
        name: weekStart || 'empty', input: { weekStart }, expected: getWeekPhase(weekStart),
      })),
    })

    const kindSets: PhaseKind[][] = [['cut'], ['bulk'], ['peak'], ['deload'], ['deload', 'peak'], ['cut', 'bulk', 'peak', 'deload'], []]
    emit('enumerate-weeks.json', {
      module: 'phases',
      fn: 'enumerateWeeks',
      note: 'Every week of the given kinds as a folder, NEWEST FIRST.',
      cases: kindSets.map((kinds) => ({ name: kinds.join('+') || 'none', input: { kinds }, expected: enumerateWeeks(kinds) })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Nutrition levers — `src/lib/nutrition/levers.ts` + `maintenance.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — nutrition levers', () => {
  const FB: LeverGoals = { calorie: 2400, protein: 100, carbs: 300, fat: 80, steps: 6000 }

  it('exports the ladder, the schedule and the id rules', () => {
    emit('levers-table.json', {
      module: 'nutrition/levers',
      fn: 'LEVERS / DEFICIT_LEVERS / DEFAULT_LEVER / LEVER_SCHEDULE',
      note: 'Data, not arithmetic. Every rung is Atwater-exact (4/4/9); the deficit ladder is ordered; the schedule is oldest first and a `custom` row may pin the goals of a CLOSED stretch.',
      cases: [{
        name: 'the ladder',
        input: {},
        expected: { levers: LEVERS, deficitIds: DEFICIT_LEVERS.map((l) => l.id), defaultLever: DEFAULT_LEVER, schedule: LEVER_SCHEDULE },
      }],
    })

    const ids: Array<string | null> = [...LEVERS.map((l) => l.id), 'custom', 'lever-3', 'lever-9', '', null, 'Baseline', ' baseline']
    emit('lever-by-id.json', {
      module: 'nutrition/levers',
      fn: 'leverById / isLeverId / applyLever',
      note: 'Exact id match. `custom` is a valid id that names NO rung; applyLever hands the goals back untouched for custom, unknown and absent.',
      cases: ids.map((id) => ({
        name: id === null ? 'null' : id === '' ? 'empty' : id,
        input: { id, goals: FB },
        expected: { lever: leverById(id), isLeverId: isLeverId(id), applied: applyLever(FB, id) },
      })),
    })

    const triples = [
      ...LEVERS.map((l) => ({ name: l.id, proteinG: l.proteinGoalG, carbsG: l.carbsGoalG, fatG: l.fatGoalG })),
      { name: 'the 1999 pin', proteinG: 170, carbsG: 206, fatG: 55 },
      { name: 'zero', proteinG: 0, carbsG: 0, fatG: 0 },
      { name: 'fractional', proteinG: 12.5, carbsG: 0.25, fatG: 1.1 },
    ]
    emit('atwater.json', {
      module: 'nutrition/levers',
      fn: 'atwaterKcal',
      note: '4·P + 4·C + 9·F.',
      cases: triples.map(({ name, ...t }) => ({ name, input: t, expected: atwaterKcal(t.proteinG, t.carbsG, t.fatG) })),
    })
  })

  it('exports leverForDate and everything that hangs off it', () => {
    interface In { date: string; stored: string | null; today: string; releaseEndsOn: string | null }
    interface Out {
      scheduled: LeverId | null
      lever: LeverId | null
      kind: NutritionLever['kind']
      goals: LeverGoals
      maintenanceLever: boolean
      maintenanceDate: boolean
    }
    const run = (i: In): Out => ({
      scheduled: scheduledLeverOn(i.date),
      lever: leverForDate(i.date, i.stored, i.today, i.releaseEndsOn),
      kind: leverKindOn(i.date, i.stored, i.today, i.releaseEndsOn),
      goals: goalsForDate(i.date, i.stored, i.today, FB, i.releaseEndsOn),
      maintenanceLever: maintenanceLeverOn(i.date, i.stored, i.releaseEndsOn, i.today),
      maintenanceDate: isMaintenanceDate(i.date, i.stored, i.releaseEndsOn, i.today),
    })
    const cases: Case<In, Out>[] = []
    const push = (name: string, i: In) => cases.push({ name, input: i, expected: run(i) })

    const dates = [
      '2026-06-27', '2026-06-28', '2026-07-01', '2026-07-11', '2026-07-12', '2026-07-14', '2026-07-15', '2026-07-20',
      '2026-08-15', '2026-08-16', '2026-08-19', '2026-08-20', '2026-08-29', '2026-08-30', '2026-09-03', '2026-09-05',
      '2026-09-06', '2026-09-10', '2026-10-18', '2026-10-31', '2026-11-01', '2026-12-01', '2027-01-01',
    ]
    const storeds: Array<string | null> = [null, 'baseline', 'lever-1', 'lever-2', 'maintenance-week', 'custom', 'lever-9']
    const todays = ['2026-08-19', '2026-09-03']
    const ends: Array<string | null> = [null, '2026-09-05']
    for (const today of todays) for (const releaseEndsOn of ends) for (const stored of storeds) for (const date of dates) {
      push(`${date} · stored ${stored ?? 'null'} · today ${today} · until ${releaseEndsOn ?? 'none'}`, { date, stored, today, releaseEndsOn })
    }
    push('empty releaseEndsOn is no end date', { date: '2026-09-10', stored: 'maintenance-week', today: '2026-08-30', releaseEndsOn: '' })
    push('an empty stored id is no selection', { date: '2026-09-03', stored: '', today: '2026-09-03', releaseEndsOn: null })
    push('a deleted rung id (lever-3) is unknown', { date: '2026-09-03', stored: 'lever-3', today: '2026-09-03', releaseEndsOn: null })
    push('today itself, release held on its opening day', { date: '2026-08-30', stored: 'maintenance-week', today: '2026-08-30', releaseEndsOn: null })
    push('an end date never truncates a deficit rung', { date: '2026-12-01', stored: 'lever-1', today: '2026-08-30', releaseEndsOn: '2026-09-05' })
    push('release ends on the end date itself — the last day still counts', { date: '2026-09-05', stored: 'maintenance-week', today: '2026-08-30', releaseEndsOn: '2026-09-05' })
    push('release the day after its end falls to the schedule', { date: '2026-09-06', stored: 'maintenance-week', today: '2026-08-30', releaseEndsOn: '2026-09-05' })

    emit('lever-for-date.json', {
      module: 'nutrition/levers + nutrition/maintenance',
      fn: 'scheduledLeverOn / leverForDate / leverKindOn / goalsForDate / maintenanceLeverOn / isMaintenanceDate',
      note: 'The past belongs to the schedule; today and after belong to the stored selection when it is a valid id — except a release past `releaseEndsOn`. goalsForDate: rung figures, else a closed custom stretch\'s pinned goals, else the fallback (2400/100/300/80/6000 here). isMaintenanceDate falls back to a `deload` PHASE.',
      cases,
    })
  })

  it('exports leverPeriods', () => {
    interface In {
      dates: string[]; stored: string | null; today: string; fallback: LeverGoals
      releaseEndsOn: string | null; dailyTargets: DailyTarget[] | null
    }
    const run = (i: In) => leverPeriods(i.dates, i.stored, i.today, i.fallback, {
      releaseEndsOn: i.releaseEndsOn, dailyTargets: i.dailyTargets ?? undefined,
    })
    const cases: Case<In, TargetPeriod[]>[] = []
    const push = (name: string, i: Partial<In> & { dates: string[] }) => {
      const input: In = { stored: 'custom', today: '2026-09-03', fallback: FB, releaseEndsOn: null, dailyTargets: null, ...i }
      cases.push({ name, input, expected: run(input) })
    }
    const week = (start: string) => daysFrom(start, 7)

    push('week of 16 Aug — one rung the whole way', { dates: week('2026-08-16') })
    push('week of 23 Aug — the closed custom stretch pins 1,999', { dates: week('2026-08-23') })
    push('week straddling 19/20 Aug — Lever 1 then the pinned custom', { dates: week('2026-08-16').concat(week('2026-08-23')) })
    push('week of 30 Aug, today inside it, holding the release with an end date', { dates: week('2026-08-30'), stored: 'maintenance-week', releaseEndsOn: '2026-09-05' })
    push('week of 30 Aug, today inside it, holding custom — the release ends on today', { dates: week('2026-08-30'), stored: 'custom' })
    push('week of 30 Aug, holding lever-2 from today', { dates: week('2026-08-30'), stored: 'lever-2' })
    push('week of 6 Sep, lever-2 selected', { dates: week('2026-09-06'), stored: 'lever-2' })
    push('week of 6 Sep, nothing stored — open custom, the live row', { dates: week('2026-09-06'), stored: null })
    push('before the cut opened — DEFAULT_LEVER', { dates: week('2026-07-08') })
    push('empty', { dates: [] })
    push('one day', { dates: ['2026-08-18'] })
    push('identical goals under two labels merge — baseline then lever-1 selected on 16 Aug', {
      dates: daysFrom('2026-08-14', 7), stored: 'lever-1', today: '2026-08-16',
    })
    push('daily targets split a week — kcal Tue, untracked fat Wed, zero row Thu, steps Fri', {
      dates: week('2026-08-23'),
      dailyTargets: [
        { date: '2026-08-25', kcal: 2400 },
        { date: '2026-08-26', track_fat: false },
        { date: '2026-08-27', kcal: 0 },
        { date: '2026-08-28', steps_goal: 12000 },
      ],
    })
    push('two identical daily targets on adjacent days merge into one run', {
      dates: week('2026-08-23'),
      dailyTargets: [{ date: '2026-08-25', kcal: 2400 }, { date: '2026-08-26', kcal: 2400 }],
    })
    push('a duplicate date in dailyTargets — the last row wins', {
      dates: week('2026-08-23'),
      dailyTargets: [{ date: '2026-08-25', kcal: 2400 }, { date: '2026-08-25', kcal: 2600 }],
    })
    push('a restaurant profile row inside the maintenance week', {
      dates: week('2026-08-30'), stored: 'maintenance-week', releaseEndsOn: '2026-09-05',
      dailyTargets: [profileToDailyTarget(BUILTIN_PROFILES[1], '2026-09-04')],
    })
    push('a daily target on the open custom stretch overrides the live row', {
      dates: week('2026-09-06'), stored: null, dailyTargets: [{ date: '2026-09-08', kcal: 2200, protein_g: 180 }],
    })
    push('dates out of order are not re-sorted', { dates: ['2026-08-20', '2026-08-18', '2026-08-19'] })

    emit('lever-periods.json', {
      module: 'nutrition/levers',
      fn: 'leverPeriods',
      note: 'Resolve every day (rung ⊂ pinned custom ⊂ fallback, then the day\'s own daily_targets row on top) and glue equal NEIGHBOURS — compared on the resolved goals, not the label. leverId/label come from the first day of the run; a run under no rung is labelled Custom.',
      cases,
    })
  })

  it('exports the maintenance spans and bands', () => {
    const spanDates = [...daysFrom('2026-06-20', 50, 3), '2026-06-27', '2026-06-28', '2026-07-11', '2026-07-12', '2026-08-30', '2026-10-17', '2026-10-18', '2026-10-31', '2026-11-01', 'garbage']
    emit('maintenance-span.json', {
      module: 'nutrition/maintenance',
      fn: 'maintenanceSpanFor',
      note: 'The inclusive span of the DELOAD PHASE containing the date — from PHASES only, never the lever. null elsewhere.',
      cases: spanDates.map((date) => ({ name: date, input: { date }, expected: maintenanceSpanFor(date) })),
    })
    const bands: Array<[string, string[]]> = [
      ['clamps to the axis', ['2026-10-16', '2026-10-18', '2026-10-20']],
      ['two blocks apart stay apart', ['2026-07-01', '2026-08-01', '2026-10-18']],
      ['no deload', ['2026-08-24', '2026-08-26', '2026-08-28']],
      ['30 Aug is a lever, not a phase', daysFrom('2026-08-30', 7)],
      ['the whole Thailand trip', daysFrom('2026-06-25', 20)],
      ['every day from June to November', daysFrom('2026-06-20', 140)],
      ['a gap inside one block does not split the band', ['2026-06-28', '2026-07-05', '2026-07-11']],
      ['empty', []],
      ['duplicates', ['2026-07-01', '2026-07-01', '2026-07-02']],
    ]
    emit('maintenance-bands.json', {
      module: 'nutrition/maintenance',
      fn: 'maintenanceBands',
      note: 'Inclusive [start, end] pairs of deload dates present in the input, keyed on the span\'s own start so two blocks never merge.',
      cases: bands.map(([name, dates]) => ({ name, input: { dates }, expected: maintenanceBands(dates) })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Context — `src/lib/nutrition/context.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — context', () => {
  it('exports the vocabulary and every reader of it', () => {
    emit('context-meta.json', {
      module: 'nutrition/context',
      fn: 'CONTEXT_META / isRangeMode / scoringContextFor / suspendsStepGoal',
      note: 'Per mode: its labels, whether it persists, what the scorer applies, and whether the step goal is suspended.',
      cases: CONTEXT_MODES.map((mode) => ({
        name: mode,
        input: { mode },
        expected: { meta: CONTEXT_META[mode], isRange: isRangeMode(mode), scoring: scoringContextFor(mode), suspendsSteps: suspendsStepGoal(mode) },
      })),
    })

    const stored: Array<string | null> = [
      null, '', '   ', 'Illness', ' refeed ', 'REFEED', 'Wedding', 'normal', 'Normal', 'travel', 'Emergency', 'event',
      'social', 'nonsense', 'illness ', 'Travel\t', 'EVENT', 'ILLNESS', 'Social ', 'x',
    ]
    emit('context-from-label.json', {
      module: 'nutrition/context',
      fn: 'contextFromDayLabel',
      note: 'Trim + lower-case; a known mode folds in; anything else non-empty is an EXCEPTION day and maps to event, never to normal.',
      cases: stored.map((s) => ({ name: JSON.stringify(s), input: { stored: s }, expected: contextFromDayLabel(s) })),
    })
    emit('context-from-setting.json', {
      module: 'nutrition/context',
      fn: 'contextFromSetting',
      note: 'Trim + lower-case; a known mode folds in; anything else is normal.',
      cases: stored.map((s) => ({ name: JSON.stringify(s), input: { stored: s }, expected: contextFromSetting(s) })),
    })

    const pairs: Array<[string, string]> = [
      ['2026-08-12', '2026-08-16'], ['2026-08-16', '2026-08-12'], ['2026-08-16', '2026-08-16'], ['2026-08-31', '2026-09-01'],
      ['2026-02-28', '2026-03-01'], ['2028-02-28', '2028-03-01'], ['2026-03-01', '2026-11-30'], ['2025-12-31', '2027-01-01'],
      ['2026-10-31', '2026-11-01'], ['2026-03-28', '2026-03-30'], ['garbage', '2026-08-16'], ['2026-08-16', ''], ['', ''],
    ]
    emit('days-between.json', {
      module: 'nutrition/context',
      fn: 'daysBetween',
      note: 'Whole days from a to b, never negative; 0 when either date does not parse.',
      cases: pairs.map(([a, b]) => ({ name: `${a || 'empty'} → ${b || 'empty'}`, input: { a, b }, expected: daysBetween(a, b) })),
    })

    const coverCases: Case<{ mode: ContextMode; since: string | null; date: string; today: string }, boolean>[] = []
    for (const mode of CONTEXT_MODES) for (const since of [null, '', '2026-08-12']) for (const date of ['2026-08-11', '2026-08-12', '2026-08-14', '2026-08-16', '2026-08-17']) {
      const today = '2026-08-16'
      coverCases.push({ name: `${mode} since ${since || 'none'} on ${date}`, input: { mode, since, date, today }, expected: rangeCovers(mode, since, date, today) })
    }
    emit('context-range-covers.json', {
      module: 'nutrition/context',
      fn: 'rangeCovers',
      note: 'Range modes only, never the future; with no start date only TODAY is inside.',
      cases: coverCases,
    })

    const lineCases: Case<{ mode: ContextMode; since: string | null; today: string }, string | null>[] = []
    for (const mode of CONTEXT_MODES) for (const since of [null, '', '2026-08-14', '2026-08-16', '2026-08-17', '2026-07-01']) {
      lineCases.push({ name: `${mode} since ${since || 'none'}`, input: { mode, since, today: '2026-08-16' }, expected: contextRangeLine(mode, since, '2026-08-16') })
    }
    emit('context-range-line.json', {
      module: 'nutrition/context',
      fn: 'contextRangeLine',
      note: 'The export header line, exact string; null for normal; "(active)" with no start; singular "day" at exactly one.',
      cases: lineCases,
    })

    type Day = { date: string; exception?: string | null }
    const week: Day[] = [
      { date: '2026-08-10', exception: null }, { date: '2026-08-11', exception: 'Illness' }, { date: '2026-08-12', exception: 'Illness' },
      { date: '2026-08-13', exception: 'Illness' }, { date: '2026-08-14', exception: null }, { date: '2026-08-15', exception: 'Refeed' },
      { date: '2026-08-16', exception: 'Illness' },
    ]
    const rangeInputs: Array<[string, Day[]]> = [
      ['the test week', week],
      ['unsorted input is sorted first', [...week].reverse()],
      ['all normal', week.map((d) => ({ date: d.date, exception: null }))],
      ['adjacent different range modes are two ranges', [{ date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-11', exception: 'Travel' }, { date: '2026-08-12', exception: 'travel' }]],
      ['a one-day mode between two illness days breaks the range', [{ date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-11', exception: 'Event' }, { date: '2026-08-12', exception: 'Illness' }]],
      ['a missing day between two illness days breaks the range', [{ date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-12', exception: 'Illness' }]],
      ['an unknown label is an event and never a range', [{ date: '2026-08-10', exception: 'Wedding' }, { date: '2026-08-11', exception: 'Wedding' }]],
      ['the exception field absent', [{ date: '2026-08-10' }, { date: '2026-08-11', exception: 'emergency' }]],
      ['a duplicate date extends nothing', [{ date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-11', exception: 'Illness' }]],
      ['same date, two labels — the sort is stable, input order decides', [{ date: '2026-08-10', exception: 'Illness' }, { date: '2026-08-10', exception: 'Travel' }, { date: '2026-08-11', exception: 'Illness' }, { date: '2026-08-11', exception: 'Travel' }]],
      ['across a month end', [{ date: '2026-08-31', exception: 'Travel' }, { date: '2026-09-01', exception: 'Travel' }, { date: '2026-09-02', exception: 'Travel' }]],
      ['empty', []],
    ]
    emit('context-ranges-in.json', {
      module: 'nutrition/context',
      fn: 'contextRangesIn + contextRangeLabel',
      note: 'Contiguous RANGE contexts across stamped days, oldest first; gaps and mode changes break a range. labels are contextRangeLabel of each range, exact strings.',
      cases: rangeInputs.map(([name, days]) => {
        const ranges = contextRangesIn(days)
        return { name, input: { days }, expected: { ranges, labels: ranges.map(contextRangeLabel) } }
      }),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Daily targets and profiles — `dailyTargets.ts` + `profiles.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — daily targets and profiles', () => {
  const RUNG: LeverGoals = { calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000 }
  const BARE: LeverGoals = { calorie: 1999, protein: null, carbs: null, fat: null, steps: null }
  const D = '2026-09-04'
  const home = BUILTIN_PROFILES[0]
  const restaurant = BUILTIN_PROFILES[1]

  it('exports the daily-target layer', () => {
    const targets: Array<[string, DailyTarget | null]> = [
      ['null', null],
      ['date only', { date: D }],
      ['kcal only', { date: D, kcal: 2400 }],
      ['zero kcal is a broken row', { date: D, kcal: 0 }],
      ['negative kcal is a broken row', { date: D, kcal: -5 }],
      ['all null', { date: D, kcal: null, protein_g: null, carbs_g: null, fat_g: null, steps_goal: null }],
      ['every figure', { date: D, kcal: 2400, protein_g: 180, carbs_g: 250, fat_g: 60, steps_goal: 8000 }],
      ['untrack fat only', { date: D, track_fat: false }],
      ['untrack carbs with a carbs figure — the flag wins', { date: D, track_carbs: false, carbs_g: 300 }],
      ['tracked flags true, nothing else', { date: D, track_carbs: true, track_fat: true }],
      ['tracked flags null', { date: D, track_carbs: null, track_fat: null }],
      ['zero macros', { date: D, carbs_g: 0, fat_g: 0 }],
      ['steps only', { date: D, steps_goal: 12000 }],
      ['half a gram of protein counts', { date: D, protein_g: 0.5 }],
      ['a note alone is not an override', { date: D, note: 'x' }],
      ['a profile key alone is not an override', { date: D, profile_key: 'restaurant' }],
      ['home profile row', profileToDailyTarget(home, D)],
      ['restaurant profile row', profileToDailyTarget(restaurant, D)],
      ['restaurant hand-edited', { ...profileToDailyTarget(restaurant, D), kcal: 2650 }],
      ['fat untracked, carbs stated', { date: D, carbs_g: 180, track_fat: false }],
    ]
    const cases: Case<{ goals: LeverGoals; target: DailyTarget | null }, { has: boolean; tracksCarbs: boolean; tracksFat: boolean; applied: LeverGoals }>[] = []
    for (const [goalsName, goals] of [['rung', RUNG], ['bare', BARE]] as const) {
      for (const [name, target] of targets) {
        cases.push({
          name: `${name} over ${goalsName}`,
          input: { goals, target },
          expected: { has: hasDailyTarget(target), tracksCarbs: tracksCarbs(target), tracksFat: tracksFat(target), applied: applyDailyTarget(goals, target) },
        })
      }
    }
    emit('daily-target.json', {
      module: 'nutrition/dailyTargets',
      fn: 'hasDailyTarget / tracksCarbs / tracksFat / applyDailyTarget',
      note: 'Field by field, > 0 (a stored zero is a broken row); an untracked macro resolves to NULL, not zero and not the rung; an absent flag means tracked; an all-null row is not an override but an untrack flag alone is.',
      cases,
    })
  })

  it('exports the profiles', () => {
    emit('profiles-table.json', {
      module: 'nutrition/profiles',
      fn: 'BUILTIN_PROFILES',
      note: 'Data. The fallback when target_profiles cannot be read; null macros are UNTRACKED, never zero.',
      cases: [{ name: 'the shipped shapes', input: {}, expected: BUILTIN_PROFILES }],
    })
    const keys: Array<string | null> = ['home', 'restaurant', 'brunch', '', null, 'Home', ' home']
    emit('profile-by-key.json', {
      module: 'nutrition/profiles',
      fn: 'profileByKey',
      note: 'Exact key match against the given list; nothing resolves to the first profile by default.',
      cases: keys.map((key) => ({ name: key === null ? 'null' : key || 'empty', input: { profiles: BUILTIN_PROFILES, key }, expected: profileByKey(BUILTIN_PROFILES, key) })),
    })
    const toRow: Case<{ profile: TargetProfile; date: string }, DailyTarget>[] = []
    for (const profile of BUILTIN_PROFILES) for (const date of ['2026-09-01', '2026-09-04']) {
      toRow.push({ name: `${profile.key} on ${date}`, input: { profile, date }, expected: profileToDailyTarget(profile, date) })
    }
    toRow.push({
      name: 'a profile with a step opinion',
      input: { profile: { key: 'hike', label: 'Hike', summary: '', sort: 2, kcal: 2600, proteinG: 170, carbsG: 300, fatG: null, stepsGoal: 20000 }, date: D },
      expected: profileToDailyTarget({ key: 'hike', label: 'Hike', summary: '', sort: 2, kcal: 2600, proteinG: 170, carbsG: 300, fatG: null, stepsGoal: 20000 }, D),
    })
    emit('profile-to-daily-target.json', {
      module: 'nutrition/profiles',
      fn: 'profileToDailyTarget',
      note: 'Every field stated (the row REPLACES the day); track flags follow the macro being non-null; steps only when the profile names one; note null.',
      cases: toRow,
    })

    const rows: Array<[string, DailyTarget | null]> = [
      ['null', null],
      ['home row', profileToDailyTarget(home, D)],
      ['restaurant row', profileToDailyTarget(restaurant, D)],
      ['restaurant edited kcal', { ...profileToDailyTarget(restaurant, D), kcal: 2650 }],
      ['restaurant figures but tracked flags', { date: D, kcal: 2400, protein_g: 170, track_carbs: true, track_fat: true }],
      ['restaurant figures, flags absent', { date: D, kcal: 2400, protein_g: 170 }],
      ['home figures, flags absent', { date: D, kcal: 2150, protein_g: 170, carbs_g: 244, fat_g: 55 }],
      ['home figures with a different fat', { date: D, kcal: 2150, protein_g: 170, carbs_g: 244, fat_g: 60 }],
      ['home figures, fat untracked', { date: D, kcal: 2150, protein_g: 170, carbs_g: 244, fat_g: 55, track_fat: false }],
      ['home with a step goal — steps are excluded', { ...profileToDailyTarget(home, D), steps_goal: 12000 }],
      ['home figures under a restaurant stamp — the stamp is not consulted', { ...profileToDailyTarget(home, D), profile_key: 'restaurant' }],
      ['restaurant figures under a home stamp', { ...profileToDailyTarget(restaurant, D), profile_key: 'home' }],
      ['empty day', { date: D }],
    ]
    const matches: Case<{ target: DailyTarget | null; profile: TargetProfile }, boolean>[] = []
    for (const profile of BUILTIN_PROFILES) for (const [name, target] of rows) {
      matches.push({ name: `${name} vs ${profile.key}`, input: { target, profile }, expected: matchesProfile(target, profile) })
    }
    emit('profile-matches.json', {
      module: 'nutrition/profiles',
      fn: 'matchesProfile',
      note: 'Compared on the four food figures and both tracking flags (absent = tracked); steps excluded; the stamp is NOT consulted.',
      cases: matches,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Training — ceilings, effort, set tags and the pure half of rest targets
// ─────────────────────────────────────────────────────────────────────────────

/** The Helix-5 deck as each phase trains it — the ONLY program the Swift carries. */
const HELIX5_ID = 'apex51'

/** Run `fn` with the active phase pinned, then restore the default. */
function withPhase<T>(phase: ProgramPhase, fn: () => T): T {
  window.localStorage.setItem('helix_active_phase', phase)
  try { return fn() } finally { window.localStorage.removeItem('helix_active_phase') }
}

describe('golden vectors — program deck', () => {
  it('exports the Helix-5 deck per phase', () => {
    const cases: Case<{ phase: ProgramPhase }, unknown>[] = []
    for (const phase of ['cut', 'bulk'] as ProgramPhase[]) {
      const p = activeProgram(HELIX5_ID, phase)
      cases.push({
        name: phase,
        input: { phase },
        expected: {
          id: p.id,
          days: p.days.map((d) => ({
            key: d.key, label: d.label, weekday: d.weekday,
            exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, restSec: e.restSec ?? null, wk1Kg: e.wk1Kg })),
          })),
        },
      })
    }
    emit('program-helix5.json', {
      module: 'programs',
      fn: 'activeProgram(apex51, phase)',
      note: 'The deck as the phase trains it: cutSets resolved into sets and lifts at 0 dropped. Names, windows, rest and seed loads must equal the Swift Program.helix5.',
      cases,
    })
  })
})

describe('golden vectors — ceilings', () => {
  const S = (weightKg: number, reps: number): WorkingSet => ({ weightKg, reps })

  it('exports the rep-window parser and the program lookups', () => {
    const strings = [
      '10–15', '8-12', '12–20', '10', '55s', '55 s', '45S', 'AMRAP', '', ' 8 – 12 ', '12–8', '8–12 reps', '3x10', '10-12-15', '0–0', '15–20',
      '8–10', '12–15', '10–12', '8–15', 'hold 30s', '30s hold', '5',
    ]
    emit('rep-window.json', {
      module: 'training/ceilings',
      fn: 'parseRepWindow',
      note: 'Trailing s (any case) is a timed hold → null; else first and last digit runs are floor and ceiling; ceiling < floor → null; no digits → null.',
      cases: strings.map((reps) => ({ name: JSON.stringify(reps), input: { reps }, expected: parseRepWindow(reps) })),
    })

    interface LookupIn { name: string; dayKey: string | null; phase: ProgramPhase }
    interface LookupOut { window: RepWindow | null; hold: number | null; restSec: number | null }
    const names = new Set<string>()
    for (const phase of ['cut', 'bulk'] as ProgramPhase[]) for (const d of activeProgram(HELIX5_ID, phase).days) for (const e of d.exercises) names.add(e.name)
    const extra = ['Cable Lateral Raise', 'leg press horizontal', 'HACK SQUAT', ' Calf Press ', 'Zercher Squat', 'Seated Cable Row', 'seated cable row - bar wide grip', 'Incline DB Bench Press', '']
    const dayKeys: Array<string | null> = [null, 'cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b', 'bogus']
    const lookups: Case<LookupIn, LookupOut>[] = []
    for (const phase of ['cut', 'bulk'] as ProgramPhase[]) {
      withPhase(phase, () => {
        for (const name of [...names, ...extra]) for (const dayKey of dayKeys) {
          lookups.push({
            name: `${name || 'empty'} · ${dayKey ?? 'no day'} · ${phase}`,
            input: { name, dayKey, phase },
            expected: {
              window: repWindowFor(name, dayKey, HELIX5_ID),
              hold: holdTargetFor(name, dayKey, HELIX5_ID),
              restSec: programRestSec(name, dayKey, HELIX5_ID),
            },
          })
        }
      })
    }
    emit('program-lookups.json', {
      module: 'training/ceilings + training/restTargets',
      fn: 'repWindowFor / holdTargetFor / programRestSec',
      note: 'Canonical, lower-cased, trimmed name match against the phase\'s deck. The day wins when known; with no day: the STRICTEST window (highest ceiling, its own floor), the LONGEST hold, the LONGEST rest. null off-program.',
      cases: lookups,
    })
  })

  it('exports every verdict over one session', () => {
    interface SessIn { sets: WorkingSet[]; ceiling: number; floor: number }
    interface SessOut {
      working: WorkingSet[]
      cleared: boolean
      ladder: ReturnType<typeof loadLadder>
      verdict: ReturnType<typeof ladderVerdict>
      topLoadCleared: boolean
      levelUp: ReturnType<typeof levelUpCue>
    }
    const run = (i: SessIn): SessOut => ({
      working: workLoads(i.sets),
      cleared: clearedCeiling(i.sets, i.ceiling),
      ladder: loadLadder(i.sets, i.ceiling),
      verdict: ladderVerdict(i.sets, i.ceiling),
      topLoadCleared: topLoadCleared(i.sets, i.ceiling),
      levelUp: levelUpCue(i.sets, { floor: i.floor, ceiling: i.ceiling }),
    })
    const cases: Case<SessIn, SessOut>[] = []
    const push = (name: string, sets: WorkingSet[], ceiling = 12, floor = 8) => {
      const input = { sets, ceiling, floor }
      cases.push({ name, input, expected: run(input) })
    }

    push('empty', [])
    push('the reported 15/14/13 Calf Press', [S(65, 15), S(65, 14), S(65, 13)], 15, 10)
    push('every set at the ceiling on one load', [S(65, 15), S(65, 16), S(65, 15)], 15, 10)
    push('ceiling reached by dropping the load', [S(65, 15), S(55, 15)], 15, 10)
    push('bodyweight single set at 20', [S(0, 20)])
    push('heavy first — 20×12 then 18×10 (blocked, 2 owed)', [S(20, 12), S(18, 10)])
    push('light first — 18×10 then 20×12 (same verdict)', [S(18, 10), S(20, 12)])
    push('18×12 then 20×8 — collapse-ready', [S(18, 12), S(20, 8)])
    push('ceiling reps at both loads is still not one load', [S(20, 12), S(18, 12)])
    push('two clean sets at 20', [S(20, 12), S(20, 12)])
    push('20×12, 20×11 — incomplete', [S(20, 12), S(20, 11)])
    push('three-load ladder binding on 18', [S(22.5, 12), S(20, 12), S(18, 9)])
    push('all-bodyweight is one rung at 0', [S(0, 20)])
    push('an unfilled 0 kg row beside real work is dropped', [S(0, 5), S(20, 12)])
    push('worst set at the binding load decides the reps owed', [S(18, 12), S(18, 8), S(20, 12)])
    push('loadLadder groups lightest first', [S(20, 12), S(18, 12), S(20, 10)])
    push('level-up: two at 20 cleared, one at 18 cleared', [S(20, 12), S(20, 12), S(18, 12)])
    push('level-up is order-independent', [S(18, 12), S(20, 12), S(20, 12)])
    push('level-up silent while the top load is earned', [S(18, 12), S(20, 9)])
    push('one lone top set is not a capability', [S(18, 12), S(20, 12)])
    push('bodyweight clears on reps', [S(0, 30), S(0, 30)])
    push('bodyweight, one set', [S(0, 30)])
    push('bodyweight, one short', [S(0, 30), S(0, 9)])
    push('35, 35, 30 all at 12 — no clear, but a cue', [S(35, 12), S(35, 12), S(30, 12)])
    push('two at ceiling then a fade at the same load', [S(20, 12), S(20, 12), S(20, 8)])
    push('the real Leg Press Jul 20', [S(72.5, 12), S(72.5, 12), S(72.5, 11)])
    push('the real Leg Press Jul 27', [S(72.5, 13), S(72.5, 12), S(72.5, 12)])
    push('fractional loads and a 0.25 microload rung', [S(5, 20), S(5.25, 20), S(5.25, 18)], 20, 12)
    push('negative reps do not crash the min', [S(20, -1), S(20, 12)])

    // Grid: every session of one and two sets over a 3×3 (load, reps) pool,
    // plus every three-set session opening with a clean 20×12.
    const pool: WorkingSet[] = []
    for (const w of [0, 18, 20]) for (const r of [8, 10, 12]) pool.push(S(w, r))
    const tag = (s: WorkingSet) => `${s.weightKg}×${s.reps}`
    for (const a of pool) push(`grid ${tag(a)}`, [a])
    for (const a of pool) for (const b of pool) push(`grid ${tag(a)}, ${tag(b)}`, [a, b])
    for (const b of pool) for (const c of pool) push(`grid 20×12, ${tag(b)}, ${tag(c)}`, [S(20, 12), b, c])

    emit('ceiling-session.json', {
      module: 'training/ceilings',
      fn: 'workLoads / clearedCeiling / loadLadder / ladderVerdict / topLoadCleared / levelUpCue',
      note: 'One session, every verdict. workLoads drops 0 kg rows only when some set carried load. The binding rung is the LOWEST load; topLoadCleared needs ONE load, ≥ 2 sets, all at the ceiling; levelUpCue needs ≥ 2 loads (>0 kg only) and the top rung cleared with ≥ 2 sets.',
      cases,
    })
  })

  it('exports the two-session progression verdicts', () => {
    interface ProgIn { sessions: WorkingSet[][]; ceiling: number | null }
    const sessions: Array<[string, WorkingSet[]]> = [
      ['clean65', [S(65, 15), S(65, 15)]],
      ['dirty65', [S(65, 15), S(65, 13)]],
      ['reported', [S(65, 15), S(65, 14), S(65, 13)]],
      ['bumped', [S(67.5, 12), S(67.5, 11)]],
      ['clean20', [S(20, 12), S(20, 12)]],
      ['clean18', [S(18, 12), S(18, 12)]],
      ['mixed', [S(18, 12), S(20, 9)]],
      ['oneGood', [S(20, 12), S(20, 9)]],
      ['fade', [S(20, 12), S(20, 12), S(20, 8)]],
      ['drop', [S(35, 12), S(35, 12), S(30, 12)]],
      ['clean35', [S(35, 12), S(35, 12), S(35, 12)]],
      ['bw16', [S(0, 16), S(0, 16)]],
      ['bwShort', [S(0, 16), S(0, 9)]],
      ['single', [S(20, 12)]],
      ['empty', []],
    ]
    const cases: Case<ProgIn, ProgressionVerdict>[] = []
    const push = (name: string, sess: WorkingSet[][], ceiling: number | null) =>
      cases.push({ name, input: { sessions: sess, ceiling }, expected: progressionVerdict(sess, ceiling) })
    for (const [na, a] of sessions) for (const ceiling of [12, 15]) push(`${na} alone @${ceiling}`, [a], ceiling)
    for (const [na, a] of sessions) for (const [nb, b] of sessions) push(`${na} then ${nb} @12`, [a, b], 12)
    push('clean65 twice @15', [sessions[0][1], sessions[0][1]], 15)
    push('dirty65 then clean65 @15', [sessions[1][1], sessions[0][1]], 15)
    push('reported twice @15', [sessions[2][1], sessions[2][1]], 15)
    push('clean65 then bumped @15', [sessions[0][1], sessions[3][1]], 15)
    push('unprogrammed', [sessions[0][1], sessions[0][1]], null)
    push('no sessions', [], 12)
    push('three sessions — only the last two count', [sessions[4][1], sessions[8][1], sessions[4][1]], 12)
    push('three sessions, last two clean', [sessions[8][1], sessions[4][1], sessions[4][1]], 12)
    push('bodyweight ready suggests no load', [sessions[11][1], sessions[11][1]], 15)
    push('fractional top load rounds to one decimal', [[S(5.25, 20), S(5.25, 20)], [S(5.25, 20), S(5.25, 20)]], 20)
    emit('progression-verdict.json', {
      module: 'training/ceilings',
      fn: 'progressionVerdict',
      note: 'Newest LAST. Both of the last two cleared (topLoadCleared) → ready with top + 2.5 kg (null at 0 kg); newest only → one-more; else no. null ceiling → no.',
      cases,
    })

    const holds: Array<[string, WorkingSet[]]> = [
      ['cleared', [S(0, 60), S(0, 58)]], ['short', [S(0, 40), S(0, 55)]], ['exact', [S(0, 55), S(0, 55)]], ['one', [S(0, 60)]], ['empty', []],
    ]
    const timed: Case<ProgIn, ProgressionVerdict>[] = []
    for (const [na, a] of holds) for (const [nb, b] of holds) {
      timed.push({ name: `${na} then ${nb}`, input: { sessions: [a, b], ceiling: 55 }, expected: timedProgressionVerdict([a, b], 55) })
    }
    for (const [na, a] of holds) timed.push({ name: `${na} alone`, input: { sessions: [a], ceiling: 55 }, expected: timedProgressionVerdict([a], 55) })
    timed.push({ name: 'no target', input: { sessions: [holds[0][1], holds[0][1]], ceiling: null }, expected: timedProgressionVerdict([holds[0][1], holds[0][1]], null) })
    timed.push({ name: 'no sessions', input: { sessions: [], ceiling: 55 }, expected: timedProgressionVerdict([], 55) })
    emit('timed-progression-verdict.json', {
      module: 'training/ceilings',
      fn: 'timedProgressionVerdict',
      note: 'reps carry SECONDS. A session clears when every set met the target; two consecutive → ready, never a kg suggestion; ceiling echoes the target.',
      cases: timed,
    })
  })
})

describe('golden vectors — effort', () => {
  it('exports the CR10 scale, the per-set ladder and the session words', () => {
    emit('effort-tables.json', {
      module: 'training/effort',
      fn: 'CR10_ANCHORS / RPE_LADDER / EFFORT_WORDS / constants',
      note: 'Data. Colours are not exported — a hex is a HelixUI token.',
      cases: [{
        name: 'the tables',
        input: {},
        expected: {
          cr10Min: CR10_MIN, cr10Max: CR10_MAX,
          anchors: Object.entries(CR10_ANCHORS).map(([k, v]) => ({ value: Number(k), label: v })),
          ladder: RPE_LADDER, words: EFFORT_WORDS,
          coldBaseline: EFFORT_COLD_BASELINE, minHistory: EFFORT_MIN_HISTORY,
        },
      }],
    })

    const values: Array<number | null> = [null, 0, 0.3, 0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 9.75, 10, 10.5, 11, -1, 0.25, 7.25, 7.75, 8.24, 8.26, 100]
    emit('cr10.json', {
      module: 'training/effort',
      fn: 'cr10Label / normalizeCr10 / rpeStopIndex / rpeLabel / nudgeRpe / effortWordFor',
      note: 'Per value: the nearest anchor at or below; snapped to the 0.5 grid and clamped 1–10 (null stays null); the lit ladder pip or -1; ladder label else CR10 anchor; ±0.5 nudges; the nearest session word (ties keep the lower).',
      cases: values.map((v) => ({
        name: v === null ? 'null' : String(v),
        input: { v },
        expected: {
          label: cr10Label(v), normalized: normalizeCr10(v), stopIndex: rpeStopIndex(v), rpeLabel: rpeLabel(v),
          up: nudgeRpe(v, 1), down: nudgeRpe(v, -1), word: effortWordFor(v),
        },
      })),
    })

    const keys: Array<string | null> = [...EFFORT_WORDS.map((w) => w.key), 'nonsense', '', null, 'Hard', 'HARD']
    emit('effort-cr10.json', {
      module: 'training/effort',
      fn: 'effortCr10',
      note: 'The stored number for a word key; null for anything else.',
      cases: keys.map((key) => ({ name: key === null ? 'null' : key || 'empty', input: { key }, expected: effortCr10(key) })),
    })

    interface SuggestIn { mean: number | null; history: number[] }
    const suggest: Case<SuggestIn, EffortWord | null>[] = []
    const push = (name: string, mean: number | null, history: number[]) =>
      suggest.push({ name, input: { mean, history }, expected: suggestEffortWord(mean, history) })
    push('typical session against its own shape', 8.875, [8.8, 8.9, 8.8, 9])
    push('cold baseline itself, no history', EFFORT_COLD_BASELINE, [])
    for (const b of [7, 8, 8.5, 8.8, 9, 9.5]) push(`matches its own baseline ${b}`, b, [b, b, b])
    push('+0.5 is Brutal', 9, [8.5, 8.5, 8.5])
    push('+1.1 is Everything', 9.6, [8.5, 8.5, 8.5])
    push('−0.5 is Solid', 8.3, [8.8, 8.8, 8.8])
    push('−1.0 is Easy', 7.8, [8.8, 8.8, 8.8])
    push('median ignores one savage session', 8.8, [8.8, 8.8, 8.8, 10])
    push('two sessions are not a baseline', 8.8, [5, 5])
    push('null mean', null, [8.8, 8.8, 8.8])
    push('even-length history takes the midpoint', 8.5, [8, 9, 8, 9])
    push('unsorted history', 9.25, [9, 8, 10, 8.5, 8.5])
    for (const delta of [-1, -0.75, -0.74, -0.5, -0.25, -0.24, 0, 0.24, 0.25, 0.5, 0.74, 0.75, 1]) {
      push(`delta ${delta} off an 8.5 baseline`, 8.5 + delta, [8.5, 8.5, 8.5])
      push(`delta ${delta} off the cold baseline`, EFFORT_COLD_BASELINE + delta, [])
    }
    emit('effort-suggest.json', {
      module: 'training/effort',
      fn: 'suggestEffortWord',
      note: 'mean − baseline, baseline = median of history when ≥ 3 entries else 8.8. Bands: ≤ −0.75 Easy, ≤ −0.25 Solid, < 0.25 Hard, < 0.75 Brutal, else Everything. null mean → null.',
      cases: suggest,
    })
  })
})

describe('golden vectors — set tags', () => {
  it('exports the tag and quality vocabularies and their readers', () => {
    const strip = (t: { label: string; full: string }) => ({ label: t.label, full: t.full })
    emit('set-tags-table.json', {
      module: 'training/setTags',
      fn: 'SET_TAGS / SET_QUALITY / SET_QUALITY_KEYS',
      note: 'Data, colours stripped (HelixUI tokens). SET_QUALITY_KEYS is the render order and matches the DB CHECK.',
      cases: [{
        name: 'the vocabularies',
        input: {},
        expected: {
          tags: Object.fromEntries(Object.entries(SET_TAGS).map(([k, t]) => [k, strip(t)])),
          quality: SET_QUALITY,
          qualityKeys: SET_QUALITY_KEYS,
        },
      }],
    })
    const types: Array<string | null> = [null, '', 'warmup', 'failure', 'dropset', 'ghost', 'working', 'Warmup', 'top', 'momentum']
    emit('set-type.json', {
      module: 'training/setTags',
      fn: 'isWorkingSet / setTagFor / setQualityFor / isSetQuality',
      note: 'isWorkingSet excludes exactly warmup and ghost. setTagFor / setQualityFor read the table by exact key, null for a plain set. isSetQuality is a closed-vocabulary guard.',
      cases: [...types, ...SET_QUALITY_KEYS, 'partial', 'Momentum'].map((v) => ({
        name: v === null ? 'null' : v || 'empty',
        input: { v },
        expected: {
          working: isWorkingSet(v),
          tag: setTagFor(v) ? strip(setTagFor(v)!) : null,
          quality: setQualityFor(v) ?? null,
          isQuality: isSetQuality(v),
        },
      })),
    })
    const counts: Array<[string, Record<string, number>]> = [
      ['none', {}],
      ['2W 1F 1D', { warmup: 2, failure: 1, dropset: 1 }],
      ['out of order in, fixed order out', { ghost: 1, dropset: 2, warmup: 1 }],
      ['zeros vanish', { warmup: 0, failure: 3 }],
      ['unknown keys are ignored', { top: 4, failure: 1 }],
      ['negative is not a count', { warmup: -1, ghost: 2 }],
    ]
    emit('set-composition.json', {
      module: 'training/setTags',
      fn: 'setComposition',
      note: 'Only kinds that occurred (> 0), in the fixed order warmup, failure, dropset, ghost. Colours stripped.',
      cases: counts.map(([name, c]) => ({ name, input: { counts: c }, expected: setComposition(c).map((t) => ({ ...strip(t), count: t.count })) })),
    })
  })
})

describe('golden vectors — rest targets', () => {
  it('exports the pure half — grid, keys and the chip format', () => {
    emit('rest-constants.json', {
      module: 'training/restTargets',
      fn: 'REST_STEP_SEC / REST_MIN_SEC / REST_MAX_SEC',
      note: 'The 15 s grid and its bounds.',
      cases: [{ name: 'the grid', input: {}, expected: { step: REST_STEP_SEC, min: REST_MIN_SEC, max: REST_MAX_SEC } }],
    })
    const secs = [0, 1, 7, 7.5, 8, 14, 15, 22, 22.5, 23, 30, 45, 59, 60, 61, 90, 97, 98, 105, 119, 120, 135, 150, 180, 292, 293, 299, 300, 301, 4000, -30, 62.4]
    emit('rest-clamp-format.json', {
      module: 'training/restTargets',
      fn: 'clampRestSec / formatRestTarget',
      note: 'clamp: Math.round(sec / 15) × 15, then 15–300. format is of the CLAMPED value: "45s" under a minute, else m:ss.',
      cases: secs.map((sec) => ({ name: String(sec), input: { sec }, expected: { clamped: clampRestSec(sec), formatted: formatRestTarget(clampRestSec(sec)) } })),
    })
    const keyCases: Array<[string, string | null, string | null]> = [
      ['Leg Press', 'legs_a', HELIX5_ID], ['leg press', 'legs_a', HELIX5_ID], ['Leg Press Horizontal (Machine)', 'legs_a', HELIX5_ID],
      ['Calf Press', null, HELIX5_ID], ['Calf Press', 'legs_b', 'axis4'], [' Cable Lateral Raise ', 'arms', HELIX5_ID], ['HACK SQUAT', undefined as unknown as null, HELIX5_ID],
    ]
    emit('rest-keys.json', {
      module: 'training/restTargets',
      fn: 'restTargetKey / sessionRestKey',
      note: 'programId|day or -|canonical lower-cased trimmed name; the session key prefixes the ISO date. programId is always given here (the TS default reads the active plan).',
      cases: keyCases.map(([name, dayKey, programId]) => ({
        name: `${name} · ${dayKey ?? 'no day'} · ${programId}`,
        input: { name, dayKey: dayKey ?? null, programId, date: '2026-09-03' },
        expected: { plan: restTargetKey(name, dayKey, programId!), session: sessionRestKey('2026-09-03', name, dayKey, programId!) },
      })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sessions — the draft's pure functions, RPE memory, next set, previous-set
// alignment, live PRs, estimates, elapsed time and the rest clock model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A patch as the fixture spells it. `Partial<DraftSet>` cannot cross JSON —
 * `JSON.stringify` drops an `undefined` field, and `applySetPatch` treats a
 * PRESENT-but-undefined `rpe` (a clearing) differently from an absent one. So
 * `null` here means "present and undefined" on the TypeScript side.
 */
interface PatchSpec {
  weightKg?: number
  reps?: number
  rpe?: number | null
  setType?: DraftSet['setType'] | null
  done?: boolean
  quality?: string
}
function patchOf(spec: PatchSpec): Partial<DraftSet> {
  const p: Partial<DraftSet> = {}
  if ('weightKg' in spec) p.weightKg = spec.weightKg
  if ('reps' in spec) p.reps = spec.reps
  if ('rpe' in spec) p.rpe = spec.rpe ?? undefined
  if ('setType' in spec) p.setType = spec.setType ?? undefined
  if ('done' in spec) p.done = spec.done
  if ('quality' in spec) p.quality = spec.quality
  return p
}

const draftOf = (exercises: DraftExercise[], over: Partial<SessionDraft> = {}): SessionDraft => ({
  splitDay: 'upper', date: '2026-08-25', notes: '', startedAt: '2026-08-25T09:00:00.000Z', exercises, ...over,
})
const exOf = (name: string, sets: DraftSet[], over: Partial<DraftExercise> = {}): DraftExercise => ({ localId: name, name, sets, ...over })

describe('golden vectors — RPE memory', () => {
  it('exports resolveSeededRpe and deriveSessionRpe', () => {
    interface SeedIn { seed: { rpe: number; weightKg: number; reps: number } | null; weightKg: number; reps: number }
    const seedCases: Case<SeedIn, { rpe: number | null; stale: boolean }>[] = []
    const seeds: SeedIn['seed'][] = [null, { rpe: 8, weightKg: 60, reps: 10 }, { rpe: 10, weightKg: 0, reps: 15 }, { rpe: 7.5, weightKg: 32.5, reps: 12 }]
    for (const seed of seeds) for (const weightKg of [0, 30, 32.5, 57.5, 60, 62.5]) for (const reps of [8, 10, 12, 15, 16]) {
      const r = resolveSeededRpe(seed ?? undefined, { weightKg, reps })
      seedCases.push({ name: `${seed ? `${seed.rpe}@${seed.weightKg}×${seed.reps}` : 'no seed'} vs ${weightKg}×${reps}`, input: { seed, weightKg, reps }, expected: { rpe: r.rpe ?? null, stale: r.stale } })
    }
    emit('rpe-seed.json', {
      module: 'training/rpeMemory',
      fn: 'resolveSeededRpe',
      note: 'A remembered rating clears (stale) when the load rose, or when reps rose at the SAME load. A lighter set keeps it. 0 kg is real data — the reps branch is the only one that can fire there.',
      cases: seedCases,
    })

    type Rated = { weightKg: number; reps: number; rpe?: number | null; setType?: string | null }
    const rated: Array<[string, Rated[]]> = [
      ['empty', []],
      ['unrated', [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10, rpe: null }]],
      ['typical', [{ weightKg: 40, reps: 10, rpe: 8.5 }, { weightKg: 40, reps: 10, rpe: 9 }, { weightKg: 50, reps: 8, rpe: 9 }, { weightKg: 50, reps: 8, rpe: 9.5 }]],
      ['warm-up and ghost excluded', [{ weightKg: 20, reps: 12, rpe: 5, setType: 'warmup' }, { weightKg: 20, reps: 12, rpe: 5, setType: 'ghost' }, { weightKg: 40, reps: 10, rpe: 9 }]],
      ['failure and dropset count', [{ weightKg: 40, reps: 10, rpe: 10, setType: 'failure' }, { weightKg: 30, reps: 12, rpe: 9, setType: 'dropset' }]],
      ['bodyweight weighs 1', [{ weightKg: 0, reps: 15, rpe: 8 }, { weightKg: 0, reps: 12, rpe: 9 }]],
      ['bodyweight beside loaded', [{ weightKg: 0, reps: 15, rpe: 6 }, { weightKg: 100, reps: 10, rpe: 9 }]],
      ['off-grid mean snaps to 0.5', [{ weightKg: 40, reps: 10, rpe: 8 }, { weightKg: 40, reps: 10, rpe: 8 }, { weightKg: 40, reps: 10, rpe: 9 }]],
      ['a single rated set', [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10, rpe: 7 }]],
      ['a pair counts both rows', [{ weightKg: 5, reps: 10, rpe: 7 }, { weightKg: 5, reps: 14, rpe: 9 }]],
    ]
    emit('session-rpe.json', {
      module: 'training/rpeMemory',
      fn: 'deriveSessionRpe',
      note: 'Tonnage-weighted mean of rated WORKING sets (unloaded weigh 1), snapped through normalizeCr10; null when nothing is rated.',
      cases: rated.map(([name, sets]) => ({ name, input: { sets }, expected: deriveSessionRpe(sets) })),
    })
  })
})

describe('golden vectors — session draft', () => {
  const seeded = (over: Partial<DraftSet> = {}): DraftSet => ({ weightKg: 60, reps: 10, rpe: 8, rpeSeed: 8, rpeSeedWeightKg: 60, rpeSeedReps: 10, ...over })

  it('exports applySetPatch and cascadeSetEdit', () => {
    const patchCases: Case<{ set: DraftSet; patch: PatchSpec }, DraftSet>[] = []
    const push = (name: string, set: DraftSet, patch: PatchSpec) => patchCases.push({ name, input: { set, patch }, expected: applySetPatch(set, patchOf(patch)) })
    push('plain weight edit', { weightKg: 40, reps: 10 }, { weightKg: 45 })
    push('rating to 10 tags failure', { weightKg: 40, reps: 10 }, { rpe: 10 })
    push('rating to 10 on a warm-up leaves the tag', { weightKg: 40, reps: 10, setType: 'warmup' }, { rpe: 10 })
    push('rating to 10 on a dropset leaves the tag', { weightKg: 40, reps: 10, setType: 'dropset' }, { rpe: 10 })
    push('rating away from 10 clears failure', { weightKg: 40, reps: 10, rpe: 10, setType: 'failure' }, { rpe: 9.5 })
    push('rating away from 10 leaves an explicit warm-up', { weightKg: 40, reps: 10, rpe: 10, setType: 'warmup' }, { rpe: 9 })
    push('an explicit setType in the same patch wins', { weightKg: 40, reps: 10 }, { rpe: 10, setType: 'dropset' })
    push('explicit setType undefined with rpe 10 — no failure tag', { weightKg: 40, reps: 10, setType: 'failure' }, { rpe: 10, setType: null })
    push('clearing the rating releases the seed', seeded(), { rpe: null })
    push('clearing the rating on a set at 10 drops failure', seeded({ rpe: 10, setType: 'failure' }), { rpe: null })
    push('rating a seeded set takes ownership', seeded(), { rpe: 9 })
    push('ticking a rated seeded set takes ownership', seeded(), { done: true })
    push('ticking an unrated stale set keeps the seed', { weightKg: 65, reps: 10, rpeSeed: 8, rpeSeedWeightKg: 60, rpeSeedReps: 10, rpeStale: true }, { done: true })
    push('unticking changes nothing about ownership', seeded(), { done: false })
    push('a weight edit alone leaves the seed in place', seeded(), { weightKg: 65 })
    push('quality patch', { weightKg: 40, reps: 10 }, { quality: 'momentum' })
    push('empty patch', seeded(), {})
    push('rpe 10 patch with done in the same patch', seeded(), { rpe: 10, done: true })
    emit('set-patch.json', {
      module: 'sessions/draft',
      fn: 'applySetPatch',
      note: 'Any touch of `rpe` (present, even undefined) releases the seed; ticking a RATED set releases it too; rpe 10 sets failure unless an explicit setType is in the patch or the set is a warm-up/dropset; leaving 10 clears a failure tag. In the fixture `rpe: null` / `setType: null` mean present-and-undefined.',
      cases: patchCases,
    })

    const cascade: Case<{ sets: DraftSet[]; setIdx: number; patch: PatchSpec }, DraftSet[]>[] = []
    const cpush = (name: string, sets: DraftSet[], setIdx: number, patch: PatchSpec) => cascade.push({ name, input: { sets, setIdx, patch }, expected: cascadeSetEdit(sets, setIdx, patchOf(patch)) })
    const three = [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 8 }]
    cpush('set 1 weight carries to set 2 only', three, 0, { weightKg: 45 })
    cpush('a diverged set 2 is left alone', [{ weightKg: 40, reps: 10 }, { weightKg: 50, reps: 10 }], 0, { weightKg: 45 })
    cpush('middle edit carries to its successor only', [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }], 1, { weightKg: 60 })
    cpush('setType never cascades', [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }], 0, { setType: 'warmup' })
    cpush('reps cascade one step', three, 0, { reps: 11 })
    cpush('reps only cascade to a matching heir', three, 1, { reps: 11 })
    cpush('0 → n weight is a change of kind, not cascaded', [{ weightKg: 0, reps: 15 }, { weightKg: 0, reps: 15 }], 0, { weightKg: 10 })
    cpush('last set has no heir', three, 2, { weightKg: 45 })
    cpush('out-of-range index returns the input', three, 5, { weightKg: 45 })
    cpush('cascade re-resolves the inherited rating on the heir', [seeded(), seeded()], 0, { weightKg: 62.5 })
    cpush('a lighter cascade keeps the heir\'s remembered rating', [seeded(), seeded()], 0, { weightKg: 57.5 })
    cpush('rating the edited set drops its seed, the heir keeps its own', [seeded(), seeded()], 0, { rpe: 9 })
    cpush('a bodyweight rep increase clears the inherited rating', [seeded({ weightKg: 0, rpeSeedWeightKg: 0, reps: 15, rpeSeedReps: 15 }), seeded({ weightKg: 0, rpeSeedWeightKg: 0, reps: 15, rpeSeedReps: 15 })], 0, { reps: 16 })
    cpush('restoring the numbers restores the rating', [{ weightKg: 62.5, reps: 10, rpeSeed: 8, rpeSeedWeightKg: 60, rpeSeedReps: 10, rpeStale: true }], 0, { weightKg: 60 })
    cpush('a partial seed is left untouched', [{ weightKg: 62.5, reps: 10, rpeSeed: 8 }], 0, { weightKg: 65 })
    cpush('unilateral rows cascade like any other (the store bypasses this for pairs)', [{ weightKg: 15, reps: 12, side: 'L', pairId: 'p1' }, { weightKg: 15, reps: 12, side: 'R', pairId: 'p1' }], 0, { weightKg: 17.5 })
    emit('cascade-set-edit.json', {
      module: 'sessions/draft',
      fn: 'cascadeSetEdit',
      note: 'Apply the patch to setIdx, carry weight (only from a load > 0) and reps to the NEXT set if it still holds the previous value, then re-resolve every inherited rating (applyRpeMemory) over the whole list.',
      cases: cascade,
    })
  })

  it('exports the totals, the sparkline, the pair rules and the strings', () => {
    interface TotIn { draft: SessionDraft; cap: number }
    const tot: Case<TotIn, { volumeKg: number; sets: number; series: number[] }>[] = []
    const tpush = (name: string, draft: SessionDraft, cap = 12) => tot.push({ name, input: { draft, cap }, expected: { ...draftTotals(draft), series: draftVolumeSeries(draft, cap) } })
    tpush('warm-ups count', draftOf([exOf('Chest Press (Machine)', [{ weightKg: 20, reps: 10, setType: 'warmup' }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10, setType: 'failure' }])]))
    tpush('unticked sets do not', draftOf([exOf('Row', [{ weightKg: 50, reps: 10, done: true }, { weightKg: 50, reps: 10, done: false }, { weightKg: 50, reps: 10 }])]))
    tpush('cardio is skipped', draftOf([exOf('Treadmill', [{ weightKg: 0, reps: 1 }], { kind: 'cardio', distanceKm: 1 }), exOf('Row', [{ weightKg: 50, reps: 10 }])]))
    tpush('a pair scores at the weaker side once', draftOf([exOf('SA', [{ weightKg: 20, reps: 10, side: 'R', pairId: 'p1' }, { weightKg: 18, reps: 10, side: 'L', pairId: 'p1' }])]))
    tpush('cumulative series', draftOf([exOf('X', [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 50, reps: 8 }])]))
    tpush('one set draws nothing', draftOf([exOf('X', [{ weightKg: 40, reps: 10 }])]))
    tpush('empty draft', draftOf([]))
    tpush('40 sets sampled to 12', draftOf([exOf('X', Array.from({ length: 40 }, () => ({ weightKg: 10, reps: 10 })))]))
    tpush('13 sets sampled to 12', draftOf([exOf('X', Array.from({ length: 13 }, (_, i) => ({ weightKg: 10, reps: 10 + i })))]))
    tpush('cap 5 over 9 sets', draftOf([exOf('X', Array.from({ length: 9 }, (_, i) => ({ weightKg: 10 + i, reps: 10 })))]), 5)
    tpush('cap 2 keeps both endpoints', draftOf([exOf('X', Array.from({ length: 7 }, () => ({ weightKg: 10, reps: 10 })))]), 2)
    tpush('quarter-kilo volumes keep their decimals', draftOf([exOf('X', [{ weightKg: 3.75, reps: 15 }, { weightKg: 3.75, reps: 15 }, { weightKg: 12.5, reps: 13 }])]))
    tpush('a split pair across exercises', draftOf([exOf('A', [{ weightKg: 5, reps: 10, side: 'L', pairId: 'a' }, { weightKg: 5, reps: 12, side: 'R', pairId: 'a' }, { weightKg: 5, reps: 12 }]), exOf('B', [{ weightKg: 0, reps: 20 }, { weightKg: 30, reps: 10, done: false }])]))
    emit('draft-totals.json', {
      module: 'sessions/draft',
      fn: 'draftTotals + draftVolumeSeries',
      note: 'Committed strength sets only (warm-ups included, cardio excluded); volume through sessionVolumeKg; the sparkline is the rounded cumulative volume over each prefix, sampled to `cap` points with both endpoints kept, empty below two sets.',
      cases: tot,
    })

    interface PairIn { l: DraftSet | null; r: DraftSet | null }
    const side = (s: 'L' | 'R', over: Partial<DraftSet> = {}): DraftSet => ({ weightKg: 32.5, reps: 10, side: s, pairId: 'p1', rpe: 8, ...over })
    const pairs: Array<[string, DraftSet | null, DraftSet | null]> = [
      ['same load, different effort', side('L', { rpe: 9 }), side('R')],
      ['identical', side('L'), side('R')],
      ['different load', side('L', { weightKg: 30 }), side('R')],
      ['different reps', side('L', { reps: 9 }), side('R')],
      ['left unticked', side('L', { done: false }), side('R')],
      ['right unticked', side('L'), side('R', { done: false })],
      ['warm-up left', side('L', { setType: 'warmup' }), side('R')],
      ['both failure', side('L', { setType: 'failure' }), side('R', { setType: 'failure' })],
      ['no right', side('L'), null],
      ['no left', null, side('R')],
      ['30×8 vs 30×10', side('L', { weightKg: 30, reps: 8 }), side('R', { weightKg: 30, reps: 10 })],
      ['30×10 vs 27.5×10', side('L', { weightKg: 30, reps: 10 }), side('R', { weightKg: 27.5, reps: 10 })],
      ['trivial gap 49 vs 50', side('L', { weightKg: 30, reps: 49 }), side('R', { weightKg: 30, reps: 50 })],
      ['timed hold 40 s vs 65 s', side('L', { weightKg: 0, reps: 40 }), side('R', { weightKg: 0, reps: 65 })],
      ['bodyweight 12 vs 10', side('L', { weightKg: 0, reps: 12 }), side('R', { weightKg: 0, reps: 10 })],
      ['unloaded match', side('L', { weightKg: 0, reps: 60 }), side('R', { weightKg: 0, reps: 60 })],
      ['loaded 5×40 vs 5×65', side('L', { weightKg: 5, reps: 40 }), side('R', { weightKg: 5, reps: 65 })],
      ['no work either side', side('L', { weightKg: 0, reps: 0 }), side('R', { weightKg: 0, reps: 0 })],
      ['one side zero', side('L', { weightKg: 0, reps: 0 }), side('R', { weightKg: 0, reps: 10 })],
      ['3% exactly', side('L', { weightKg: 100, reps: 97 }), side('R', { weightKg: 100, reps: 100 })],
      ['2.5% rounds to 3', side('L', { weightKg: 100, reps: 39 }), side('R', { weightKg: 100, reps: 40 })],
    ]
    emit('pair-row.json', {
      module: 'sessions/draft',
      fn: 'isPairCompactable + pairAsymmetry',
      note: 'Compactable: both present, both committed, same setType (absent = normal), same weight AND reps. Asymmetry: work = weight × reps when loaded else reps; pct = round((1 − min/max) × 100), null under 3 or with no work.',
      cases: pairs.map(([name, l, r]) => ({ name, input: { l, r }, expected: { compactable: isPairCompactable(l ?? undefined, r ?? undefined), asymmetry: pairAsymmetry(l ?? undefined, r ?? undefined) } })),
    })

    const cardio: Array<[string, DraftExercise]> = [
      ['distance and minutes', exOf('Treadmill', [], { kind: 'cardio', distanceKm: 0.4, durationSec: 300 })],
      ['seconds too', exOf('Treadmill', [], { kind: 'cardio', distanceKm: 1.25, durationSec: 305 })],
      ['incline', exOf('Treadmill', [], { kind: 'cardio', distanceKm: 2, durationSec: 1200, inclinePct: 12 })],
      ['zero incline is not printed', exOf('Treadmill', [], { kind: 'cardio', durationSec: 60, inclinePct: 0 })],
      ['nothing', exOf('Bike', [], { kind: 'cardio' })],
      ['distance only', exOf('Row Erg', [], { kind: 'cardio', distanceKm: 5 })],
      ['long duration', exOf('Walk', [], { kind: 'cardio', durationSec: 3661 })],
      ['sub-minute', exOf('Sprint', [], { kind: 'cardio', durationSec: 45 })],
      ['fractional incline', exOf('Treadmill', [], { kind: 'cardio', inclinePct: 2.5 })],
    ]
    emit('cardio-summary.json', {
      module: 'sessions/draft',
      fn: 'cardioSummary',
      note: '"Treadmill: 0.4 km · 5 min" — distance, m or m:ss min, incline (only when non-zero), joined by · ; the bare name when nothing is set.',
      cases: cardio.map(([name, ex]) => ({ name, input: { ex }, expected: cardioSummary(ex) })),
    })

    const titles: Array<[string, string | null, string | null, string]> = [
      ['day label wins', 'Legs & Core B · Posterior Focus', 'legs_b', 'lower'],
      ['unknown day falls to the title head', 'Legs & Core B · Posterior Focus', 'bogus', 'lower'],
      ['no day, title head', 'Upper A · Chest + Back', null, 'upper'],
      ['no separator', 'Push Day', null, 'push'],
      ['empty title falls to the split', '', null, 'push'],
      ['no title', null, null, 'legs'],
      ['nothing at all', null, null, ''],
      ['padded head', '  Arms  ·  x', null, 'arms'],
      ['separator first', '· x', null, 'pull'],
    ]
    emit('clean-title.json', {
      module: 'sessions/draft',
      fn: 'cleanSessionTitle',
      note: 'The program day\'s label if dayKey resolves (Helix-5), else the title up to its first ·, else the split, else "Workout".',
      cases: titles.map(([name, title, dayKey, splitDay]) => ({
        name,
        input: { title, dayKey, splitDay },
        expected: cleanSessionTitle({ title: title ?? undefined, dayKey: (dayKey ?? undefined) as SessionDraft['dayKey'], splitDay: splitDay as SplitDay }),
      })),
    })
  })
})

describe('golden vectors — next set and previous alignment', () => {
  const hist = (sets: HistorySet[]): ExerciseHistory => ({ date: '2026-08-18', sets })

  it('exports findNextSet and its strings', () => {
    interface In { draft: SessionDraft | null; history: Array<{ name: string; history: ExerciseHistory }> | null }
    interface Out { next: NextSet | null; lastTime: string; lastRpe: string; load: string; rpe: string }
    const run = (i: In): Out => {
      const next = findNextSet(i.draft, i.history ? new Map(i.history.map((h) => [h.name, h.history])) : undefined)
      return { next, lastTime: formatLastTime(next), lastRpe: formatLastRpe(next), load: formatLoad(next), rpe: formatRpe(next) }
    }
    const cases: Case<In, Out>[] = []
    const push = (name: string, draft: SessionDraft | null, history: In['history'] = null) => cases.push({ name, input: { draft, history }, expected: run({ draft, history }) })
    push('null draft', null)
    push('first unticked, in deck order', draftOf([
      exOf('Incline Press', [{ weightKg: 60, reps: 8, done: true }, { weightKg: 60, reps: 8, done: true }]),
      exOf('Lateral Raise Cable', [{ weightKg: 3.75, reps: 16, done: true }, { weightKg: 3.75, reps: 16, done: false }]),
    ]))
    push('ghosts carry no ordinal', draftOf([exOf('Bench Press', [{ weightKg: 80, reps: 6, setType: 'ghost', done: true }, { weightKg: 80, reps: 6, done: false }, { weightKg: 80, reps: 6, done: false }])]))
    push('warm-ups carry no ordinal', draftOf([exOf('Bench Press', [{ weightKg: 20, reps: 12, setType: 'warmup', done: false }, { weightKg: 80, reps: 6, done: false }])]))
    push('cardio skipped', draftOf([exOf('Treadmill', [], { kind: 'cardio' }), exOf('Row', [{ weightKg: 50, reps: 10, done: false }])]))
    push('a pair is one set', draftOf([exOf('Single Arm Pushdown', [
      { weightKg: 15, reps: 12, side: 'L', pairId: 'p1', done: true }, { weightKg: 15, reps: 12, side: 'R', pairId: 'p1', done: true },
      { weightKg: 15, reps: 12, side: 'L', pairId: 'p2', done: false }, { weightKg: 15, reps: 12, side: 'R', pairId: 'p2', done: false },
    ])]))
    push('all done', draftOf([exOf('Row', [{ weightKg: 50, reps: 10, done: true }])]))
    push('an exercise with only warm-ups is skipped', draftOf([exOf('A', [{ weightKg: 20, reps: 12, setType: 'warmup', done: false }]), exOf('B', [{ weightKg: 50, reps: 10, done: false }])]))
    push('last time aligned by working set number', draftOf([exOf('Bench Press', [{ weightKg: 80, reps: 6, done: true }, { weightKg: 80, reps: 6, done: false }])]),
      [{ name: 'Bench Press', history: hist([{ weightKg: 20, reps: 12, setType: 'warmup' }, { weightKg: 77.5, reps: 7, rpe: 8 }, { weightKg: 77.5, reps: 6, rpe: 9.5 }]) }])
    push('last time had fewer sets', draftOf([exOf('Row', [{ weightKg: 50, reps: 10, done: true }, { weightKg: 50, reps: 10, done: false }])]), [{ name: 'Row', history: hist([{ weightKg: 47.5, reps: 11 }]) }])
    push('history pair folds to its first row', draftOf([exOf('SA', [{ weightKg: 15, reps: 12, side: 'L', pairId: 'p1', done: true }, { weightKg: 15, reps: 12, side: 'R', pairId: 'p1', done: true }, { weightKg: 15, reps: 12, done: false }])]),
      [{ name: 'SA', history: hist([{ weightKg: 12, reps: 10, side: 'R', pairId: 'h1', rpe: 8 }, { weightKg: 12, reps: 10, side: 'L', pairId: 'h1', rpe: 9 }, { weightKg: 12, reps: 9, rpe: 7 }]) }])
    push('history ghost stripped', draftOf([exOf('Row', [{ weightKg: 50, reps: 10, done: false }])]), [{ name: 'Row', history: hist([{ weightKg: 40, reps: 5, setType: 'ghost' }, { weightKg: 47.5, reps: 11 }]) }])
    push('history for another exercise is ignored', draftOf([exOf('Row', [{ weightKg: 50, reps: 10, done: false }])]), [{ name: 'Bench', history: hist([{ weightKg: 47.5, reps: 11 }]) }])
    push('unloaded next set with unloaded history', draftOf([exOf('Reverse Crunch', [{ weightKg: 0, reps: 17, done: false }])]), [{ name: 'Reverse Crunch', history: hist([{ weightKg: 0, reps: 15, rpe: 10 }]) }])
    push('quarter-plate load on the set you are on', draftOf([exOf('Lateral Raise', [{ weightKg: 3.75, reps: 16, rpe: 8, done: false }])]), [{ name: 'Lateral Raise', history: hist([{ weightKg: 3.75, reps: 15, rpe: 9 }]) }])
    push('empty pairId is no pair', draftOf([exOf('X', [{ weightKg: 10, reps: 10, pairId: '', done: true }, { weightKg: 10, reps: 10, pairId: '', done: false }])]))
    emit('next-set.json', {
      module: 'sessions/nextSet',
      fn: 'findNextSet + formatLastTime / formatLastRpe / formatLoad / formatRpe',
      note: 'First uncommitted working set in deck order (cardio, warm-ups and ghosts skipped, a pair counted once); last time is the history\'s Nth working set (pairs folded to their first row). `history` is a list of {name, history} standing in for the Map.',
      cases,
    })

    interface FmtIn { w: number | null; r: number | null; rpe: number | null }
    const fmt: Case<FmtIn, { lastTime: string; lastRpe: string; load: string; rpe: string }>[] = []
    for (const w of [null, 0, 2.5, 3.75, 12.125, 20, 60, 77.5, 3.333, 100.05, 0.1]) for (const r of [null, 0, 16]) for (const rpe of [null, 8, 9.5, 10]) {
      const n: NextSet = { exercise: 'X', setNumber: 1, setTotal: 1, lastWeightKg: w, lastReps: r, lastRpe: rpe, weightKg: w, reps: r, rpe }
      fmt.push({ name: `${w} × ${r} @ ${rpe}`, input: { w, r, rpe }, expected: { lastTime: formatLastTime(n), lastRpe: formatLastRpe(n), load: formatLoad(n), rpe: formatRpe(n) } })
    }
    emit('next-set-format.json', {
      module: 'sessions/nextSet',
      fn: 'formatLastTime / formatLastRpe / formatLoad / formatRpe',
      note: 'toFixed(0) for a whole load, toFixed(1) when tenths suffice, else toFixed(2); unloaded prints "N reps"; a half-typed row prints what it has; never a zero it does not have.',
      cases: fmt,
    })
  })

  it('exports previous-set alignment', () => {
    const warm = (kg: number, reps: number): HistorySet => ({ weightKg: kg, reps, setType: 'warmup' })
    const work = (kg: number, reps: number): HistorySet => ({ weightKg: kg, reps })
    interface In { todayWarmup: boolean[]; previous: HistorySet[] | null }
    const cases: Array<[string, boolean[], HistorySet[] | null]> = [
      ['the 28 Aug Leg Press', [true, false, false], [warm(60, 15), work(72.5, 13), work(72.5, 14)]],
      ['no warm-up in history', [true, false], [work(72.5, 13), work(72.5, 14)]],
      ['runs out', [false, false, false], [work(40, 12)]],
      ['no history', [true, false, false, false], null],
      ['empty history', [false], []],
      ['history warm-up, none today', [false, false], [warm(60, 15), work(72.5, 13), work(72.5, 14)]],
      ['pair folds to its first row', [false, false], [{ weightKg: 12, reps: 10, side: 'R', pairId: 'p1' }, { weightKg: 12, reps: 10, side: 'L', pairId: 'p1' }, work(12, 9)]],
      ['paired history against a paired deck', [false, false], [{ weightKg: 12, reps: 10, side: 'R', pairId: 'p1' }, { weightKg: 12, reps: 10, side: 'L', pairId: 'p1' }, { weightKg: 12, reps: 9, side: 'R', pairId: 'p2' }, { weightKg: 12, reps: 9, side: 'L', pairId: 'p2' }]],
      ['ghost is a warm-up row here', [true, false], [{ weightKg: 40, reps: 5, setType: 'ghost' }, work(50, 10)]],
      ['two warm-ups today, one in history', [true, true, false], [warm(40, 12), work(60, 10)]],
      ['empty today', [], [work(1, 1)]],
      ['empty pairId does not fold', [false, false], [{ weightKg: 12, reps: 10, pairId: '' }, { weightKg: 12, reps: 9, pairId: '' }]],
    ]
    emit('prev-align.json', {
      module: 'sessions/prevAlign',
      fn: 'previousDisplayRows + alignPreviousSets',
      note: 'History pairs fold to their first row; then like against like — today\'s warm-up rows take the history\'s non-working rows in order, working rows take working rows; surplus is null.',
      cases: cases.map(([name, todayWarmup, previous]) => ({ name, input: { todayWarmup, previous } as In, expected: { rows: previousDisplayRows(previous ?? undefined), aligned: alignPreviousSets(todayWarmup, previous ?? undefined) } })),
    })

    const names: Array<string | null> = [null, '', 'Side Plank', 'side plank', 'Plank', 'Hollow Hold', 'hollow  hold', 'Dead Hang', 'deadhang', 'Wall Sit', 'L-Sit', 'L Sit', 'Lsit', 'Farmer Carry', 'Suitcase Carry', 'Carryover Press', 'Hold', 'Household', 'Planks', 'Leg Press', 'Hip Thrust (Machine)', 'Hanging Knee Raise', 'Reverse Crunch']
    emit('timed-exercise.json', {
      module: 'exercises/timed',
      fn: 'isTimedExercise',
      note: 'Word-bounded, case-insensitive match on plank / hollow hold / hold / dead hang / wall sit / l-sit / carry.',
      cases: names.map((name) => ({ name: name === null ? 'null' : name || 'empty', input: { name }, expected: isTimedExercise(name) })),
    })
  })
})

describe('golden vectors — live PRs', () => {
  it('exports livePrDigest and computeLivePrs', () => {
    interface In { draft: SessionDraft | null; baselines: PrBaselines | null }
    interface Out { digest: string; bySet: Array<{ key: string; axes: PrAxis[] }>; detail: Array<{ key: string; records: Partial<Record<PrAxis, AxisRecord>> }>; count: number }
    const run = (i: In): Out => {
      const r = computeLivePrs(i.draft, i.baselines ?? undefined)
      return {
        digest: livePrDigest(i.draft),
        bySet: [...r.bySet].map(([key, axes]) => ({ key, axes })),
        detail: [...r.detailBySet].map(([key, records]) => ({ key, records })),
        count: r.count,
      }
    }
    const HIP = 'Hip Thrust (Machine)'
    const PLANK = 'Side Plank'
    const bl = buildBaselines([
      { key: HIP, weightKg: 25, reps: 14 }, { key: HIP, weightKg: 27.5, reps: 12 },
      { key: PLANK, weightKg: 0, reps: 57 },
      { key: 'Single Arm Lateral Raise (Cable)', weightKg: 5, reps: 12, side: 'L', pairId: 'h' }, { key: 'Single Arm Lateral Raise (Cable)', weightKg: 5, reps: 12, side: 'R', pairId: 'h' },
    ], (k) => k === PLANK)
    const cases: Case<In, Out>[] = []
    const push = (name: string, draft: SessionDraft | null, baselines: PrBaselines | null = bl) => cases.push({ name, input: { draft, baselines }, expected: run({ draft, baselines }) })
    push('null draft', null)
    push('no baselines', draftOf([exOf(HIP, [{ weightKg: 30, reps: 10 }])]), null)
    push('nothing committed', draftOf([exOf(HIP, [{ weightKg: 30, reps: 10, done: false }])]))
    push('July 31 shape — records on set 2 and the plank', draftOf([
      exOf(HIP, [{ weightKg: 25, reps: 14 }, { weightKg: 27.5, reps: 13 }, { weightKg: 27.5, reps: 13 }]),
      exOf(PLANK, [{ weightKg: 0, reps: 58 }, { weightKg: 0, reps: 55, done: false }]),
    ], { date: '2026-08-25' }))
    push('an asserted date takes the record book', draftOf([exOf('DB Hammer Curl', [{ weightKg: 20, reps: 12 }])], { date: '2026-07-21' }))
    push('a live date derives', draftOf([exOf('DB Hammer Curl', [{ weightKg: 20, reps: 12 }])], { date: '2026-08-25' }))
    push('supersession — only the surviving axes keep a delta', draftOf([exOf(HIP, [{ weightKg: 25, reps: 15 }, { weightKg: 27.5, reps: 14 }, { weightKg: 27.5, reps: 13 }])]))
    push('a pair collapses on the tick', draftOf([exOf('Single Arm Lateral Raise (Cable)', [{ weightKg: 5, reps: 14, side: 'L', pairId: 't' }, { weightKg: 5, reps: 14, side: 'R', pairId: 't' }])]))
    push('warm-up committed, no record', draftOf([exOf(HIP, [{ weightKg: 40, reps: 20, setType: 'warmup' }])]))
    push('cardio ignored in the digest', draftOf([exOf('Treadmill', [{ weightKg: 0, reps: 1 }], { kind: 'cardio' }), exOf(HIP, [{ weightKg: 30, reps: 10, quality: 'momentum' }])]))
    push('digest carries side and pair', draftOf([exOf('X', [{ weightKg: 5.25, reps: 10, side: 'L', pairId: 'p', setType: 'failure' }, { weightKg: 5.25, reps: 10, side: 'R', pairId: 'p', done: false }])]))
    push('timed exercise by name — a plank variant', draftOf([exOf('Side Plank', [{ weightKg: 0, reps: 60 }])]))
    emit('live-prs.json', {
      module: 'sessions/livePrs',
      fn: 'livePrDigest + computeLivePrs',
      note: 'Only committed strength sets reach the engine, in deck order, keyed `${localId}|${setIdx}`; the draft date is passed so an asserted date takes the record book; detail keeps only the axes that survived supersession. bySet/detail are the Maps as insertion-ordered lists.',
      cases,
    })
  })
})

describe('golden vectors — estimates', () => {
  it('exports the calorie and heart-rate estimates', () => {
    const samples = (n: number, kcalPerMin: number): KcalSample[] => Array.from({ length: n }, () => ({ kcal: kcalPerMin * 60, durationMin: 60 }))
    emit('met-kcal-per-min.json', {
      module: 'sessions/estimates',
      fn: 'metKcalPerMin',
      note: '6.0 × 3.5 × kg / 200; null without a positive bodyweight.',
      cases: [null, 0, -5, 50, 70, 75, 80, 100.5].map((bw) => ({ name: bw === null ? 'null' : String(bw), input: { bodyweightKg: bw }, expected: metKcalPerMin(bw) })),
    })
    const medians: Array<[string, KcalSample[]]> = [
      ['empty', []],
      ['four is too few', samples(4, 8)],
      ['five', samples(5, 8)],
      ['outlier', [...samples(4, 8), { kcal: 900, durationMin: 60 }]],
      ['even count', [60, 70, 80, 90, 100, 110].map((k) => ({ kcal: k, durationMin: 10 }))],
      ['unusable rows dropped', [...samples(4, 8), { kcal: 0, durationMin: 60 }, { kcal: 400, durationMin: 0 }]],
      ['negative rows dropped', [...samples(5, 8), { kcal: -5, durationMin: 60 }, { kcal: 300, durationMin: -1 }]],
      ['unsorted', [10, 6, 8, 7, 9].map((k) => ({ kcal: k * 30, durationMin: 30 }))],
    ]
    emit('kcal-median.json', {
      module: 'sessions/estimates',
      fn: 'medianKcalPerMin',
      note: 'Median kcal/min over usable samples (both > 0 and finite); null below 5.',
      cases: medians.map(([name, s]) => ({ name, input: { samples: s }, expected: medianKcalPerMin(s) })),
    })
    interface EstIn { durationMin: number | null; samples: KcalSample[]; bodyweightKg: number | null }
    const est: Array<[string, EstIn]> = [
      ['personal median', { durationMin: 60, samples: samples(6, 9), bodyweightKg: 75 }],
      ['met fallback', { durationMin: 60, samples: samples(2, 9), bodyweightKg: 75 }],
      ['nothing to fire', { durationMin: 60, samples: [], bodyweightKg: null }],
      ['no duration', { durationMin: null, samples: samples(9, 8), bodyweightKg: 75 }],
      ['zero duration', { durationMin: 0, samples: samples(9, 8), bodyweightKg: 75 }],
      ['half hour', { durationMin: 30, samples: samples(6, 8), bodyweightKg: 75 }],
      ['fractional duration rounds', { durationMin: 47.5, samples: [], bodyweightKg: 72.3 }],
      ['negative duration', { durationMin: -10, samples: samples(6, 8), bodyweightKg: 75 }],
    ]
    emit('calorie-estimate.json', {
      module: 'sessions/estimates',
      fn: 'estimateCalories',
      note: 'Personal median first, MET formula second, null when neither can fire; kcal is Math.round(rate × minutes).',
      cases: est.map(([name, i]) => ({ name, input: i, expected: estimateCalories(i) })),
    })
    emit('bpm-estimate.json', {
      module: 'sessions/estimates',
      fn: 'estimateAvgBpm',
      note: 'The previous value, rounded; null for nothing or non-positive.',
      cases: [null, 0, -1, 118, 117.6, 117.5, 60.4999].map((b) => ({ name: b === null ? 'null' : String(b), input: { previousBpm: b }, expected: estimateAvgBpm(b) })),
    })
  })
})

describe('golden vectors — session elapsed and the rest clock', () => {
  it('exports the elapsed and pause arithmetic', () => {
    interface In { startedAt: string | null; now: number; pause: { pausedMs?: number; pausedAt?: string | null } | null }
    interface Out { elapsed: number | null; active: number | null; durationMin: number | null; pausedMs: number }
    const run = (i: In): Out => {
      const active = sessionActiveSec(i.startedAt, i.now, i.pause)
      return { elapsed: sessionElapsedSec(i.startedAt, i.now), active, durationMin: elapsedDurationMin(active), pausedMs: pausedMsAt(i.pause, i.now) }
    }
    const NOW = Date.parse('2026-08-28T13:10:40.000Z')
    const cases: Array<[string, In]> = [
      ['live session, 70m40s', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: null }],
      ['no ms, Z', { startedAt: '2026-08-28T12:00:00Z', now: NOW, pause: null }],
      ['offset +00:00', { startedAt: '2026-08-28T12:00:00.000+00:00', now: NOW, pause: null }],
      ['offset +02:00', { startedAt: '2026-08-28T14:00:00.000+02:00', now: NOW, pause: null }],
      ['back-dated six days', { startedAt: '2026-08-22T12:00:00.000Z', now: NOW, pause: null }],
      ['future start', { startedAt: '2026-08-28T14:00:00.000Z', now: NOW, pause: null }],
      ['exactly the bound', { startedAt: new Date(NOW - MAX_SESSION_SEC * 1000).toISOString(), now: NOW, pause: null }],
      ['one past the bound', { startedAt: new Date(NOW - (MAX_SESSION_SEC + 1) * 1000).toISOString(), now: NOW, pause: null }],
      ['null', { startedAt: null, now: NOW, pause: null }],
      ['empty', { startedAt: '', now: NOW, pause: null }],
      ['garbage', { startedAt: 'not a date', now: NOW, pause: null }],
      ['under 30 s', { startedAt: new Date(NOW - 20_000).toISOString(), now: NOW, pause: null }],
      ['31 s', { startedAt: new Date(NOW - 31_000).toISOString(), now: NOW, pause: null }],
      ['61:40 rounds to 62', { startedAt: new Date(NOW - (61 * 60 + 40) * 1000).toISOString(), now: NOW, pause: null }],
      ['61:20 rounds to 61', { startedAt: new Date(NOW - (61 * 60 + 20) * 1000).toISOString(), now: NOW, pause: null }],
      ['closed pause of 10 min', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 600_000 } }],
      ['open pause since 12:40', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 0, pausedAt: '2026-08-28T12:40:00.000Z' } }],
      ['open pause plus bank', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 300_000, pausedAt: '2026-08-28T13:07:00.000Z' } }],
      ['pause in the future', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 120_000, pausedAt: '2026-08-28T13:30:00.000Z' } }],
      ['negative bank', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: -900 } }],
      ['unparseable pausedAt', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 180_000, pausedAt: 'not a date' } }],
      ['over-long pause clamps to zero', { startedAt: '2026-08-28T13:05:00.000Z', now: NOW, pause: { pausedMs: 3_600_000 } }],
      ['mis-dated draft not rescued by a pause', { startedAt: '2026-08-25T12:00:00.000Z', now: NOW, pause: { pausedMs: 3 * 24 * 3_600_000 } }],
      ['empty pause object', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: {} }],
      ['pausedAt empty string', { startedAt: '2026-08-28T12:00:00.000Z', now: NOW, pause: { pausedMs: 1000, pausedAt: '' } }],
      ['date-only startedAt', { startedAt: '2026-08-28', now: Date.parse('2026-08-28T01:00:00Z'), pause: null }],
      ['fractional seconds .5', { startedAt: '2026-08-28T12:00:00.500Z', now: NOW, pause: null }],
    ]
    emit('session-elapsed.json', {
      module: 'sessions/sessionElapsed',
      fn: 'sessionElapsedSec / sessionActiveSec / elapsedDurationMin / pausedMsAt',
      note: 'Elapsed = floor((now − started) / 1000), null outside 0…6 h or unparseable; active subtracts banked + open pause (never negative) after the wall-clock bound; durationMin rounds and refuses < 30 s. `now` is epoch ms.',
      cases: cases.map(([name, i]) => ({ name, input: i, expected: run(i) })),
    })
  })

  it('exports the rest clock model', () => {
    const T0 = Date.parse('2026-08-24T10:00:00Z')
    const clock = (over: Partial<SessionClock> = {}): SessionClock => ({ mode: 'timer', startedAt: null, accumulatedMs: 0, durationSec: 60, ...over })

    // parse + staleness, through the store's own reader
    interface ParseIn { raw: string | null; now: number }
    const raws: Array<[string, string | null, number]> = [
      ['empty', null, T0],
      ['garbage', '{not json', T0],
      ['v1 targetSec', JSON.stringify({ startedAt: null, targetSec: 120 }), T0],
      ['stopwatch running', JSON.stringify({ mode: 'stopwatch', startedAt: T0 - 5000, accumulatedMs: 0, durationSec: 60 }), T0],
      ['unknown mode is timer', JSON.stringify({ mode: 'countdown', startedAt: null, accumulatedMs: 0, durationSec: 45 }), T0],
      ['negative accumulated clamps', JSON.stringify({ mode: 'timer', startedAt: null, accumulatedMs: -5, durationSec: 45 }), T0],
      ['duration out of bounds', JSON.stringify({ mode: 'timer', startedAt: null, accumulatedMs: 0, durationSec: 5000 }), T0],
      ['duration fractional', JSON.stringify({ mode: 'timer', startedAt: null, accumulatedMs: 0, durationSec: 44.4 }), T0],
      ['startedAt as string is ignored', JSON.stringify({ mode: 'timer', startedAt: 'yesterday', accumulatedMs: 0, durationSec: 60 }), T0],
      ['stale — started 61 min ago', JSON.stringify({ mode: 'timer', startedAt: T0 - 61 * 60_000, accumulatedMs: 30_000, durationSec: 90 }), T0],
      ['not stale — started 59 min ago', JSON.stringify({ mode: 'stopwatch', startedAt: T0 - 59 * 60_000, accumulatedMs: 30_000, durationSec: 90 }), T0],
      ['paused is never stale', JSON.stringify({ mode: 'stopwatch', startedAt: null, accumulatedMs: 30_000_000, durationSec: 90 }), T0],
      ['array is idle', '[1,2]', T0],
      ['durationSec null falls to default', JSON.stringify({ mode: 'timer', startedAt: null, accumulatedMs: 0, durationSec: null }), T0],
    ]
    const parseCases: Case<ParseIn, SessionClock>[] = []
    for (const [name, raw, now] of raws) {
      vi.useFakeTimers(); vi.setSystemTime(now)
      localStorage.clear()
      if (raw !== null) localStorage.setItem(CLOCK_KEY, raw)
      parseCases.push({ name, input: { raw, now }, expected: getSessionClock() })
      vi.useRealTimers()
    }
    emit('session-clock-parse.json', {
      module: 'sessions/sessionClock',
      fn: 'getSessionClock (parse + staleness)',
      note: 'Tolerant read of the stored row: unknown mode → timer, non-number startedAt → null, accumulatedMs ≥ 0, duration clamped 15–3600 with the v1 `targetSec` honoured; a clock started more than an hour before `now` is discarded to idle (mode and duration kept).',
      cases: parseCases,
    })

    interface ReadIn { clock: SessionClock; now: number }
    const reads: Array<[string, SessionClock, number]> = [
      ['idle timer', clock(), T0],
      ['timer just started', clock({ startedAt: T0 }), T0],
      ['timer at 0.9 s', clock({ startedAt: T0 }), T0 + 900],
      ['timer at 1 s', clock({ startedAt: T0 }), T0 + 1000],
      ['timer at 59.999 s', clock({ startedAt: T0 }), T0 + 59_999],
      ['timer done at 60 s', clock({ startedAt: T0 }), T0 + 60_000],
      ['timer well past', clock({ startedAt: T0 }), T0 + 120_000],
      ['timer paused with 20 s banked', clock({ accumulatedMs: 20_000 }), T0 + 999_999],
      ['timer resumed with bank', clock({ startedAt: T0, accumulatedMs: 20_000 }), T0 + 10_000],
      ['stopwatch running', clock({ mode: 'stopwatch', startedAt: T0 }), T0 + 72_000],
      ['stopwatch paused', clock({ mode: 'stopwatch', accumulatedMs: 20_000 }), T0 + 9_000_000],
      ['stopwatch bank + open', clock({ mode: 'stopwatch', startedAt: T0, accumulatedMs: 30_000 }), T0 + 20_000],
      ['stopwatch never done', clock({ mode: 'stopwatch', startedAt: T0 }), T0 + 3_600_000],
      ['clock moved backwards', clock({ mode: 'stopwatch', startedAt: T0 + 5000 }), T0],
      ['idle stopwatch', clock({ mode: 'stopwatch' }), T0],
      ['fractional ms', clock({ mode: 'stopwatch', startedAt: T0, accumulatedMs: 1500 }), T0 + 2499],
    ]
    emit('session-clock-read.json', {
      module: 'sessions/sessionClock',
      fn: 'elapsedMs / elapsedSec / remainingSec / isTimerDone / clockReadingSec / clockIsLive',
      note: 'elapsed = banked + max(0, now − startedAt); remaining = max(0, duration − floor(elapsed s)); done only for a timer at or past its duration; live when running or with a bank.',
      cases: reads.map(([name, c, now]) => ({
        name, input: { clock: c, now } as ReadIn,
        expected: { elapsedMs: elapsedMs(c, now), elapsedSec: elapsedSec(c, now), remainingSec: remainingSec(c, now), done: isTimerDone(c, now), reading: clockReadingSec(c, now), live: clockIsLive(c) },
      })),
    })

    interface Op { kind: 'setMode' | 'start' | 'pause' | 'reset' | 'restart' | 'setDuration'; mode?: ClockMode; sec?: number }
    interface OpIn { clock: SessionClock; op: Op; now: number }
    const ops: Array<[string, SessionClock, Op, number]> = [
      ['start timer from idle', clock(), { kind: 'start' }, T0],
      ['start stopwatch explicitly from idle timer', clock(), { kind: 'start', mode: 'stopwatch' }, T0],
      ['start while running is a no-op', clock({ startedAt: T0 - 5000 }), { kind: 'start' }, T0],
      ['start a different mode while running restarts in that mode', clock({ startedAt: T0 - 5000, accumulatedMs: 3000 }), { kind: 'start', mode: 'stopwatch' }, T0],
      ['start resumes a paused stopwatch', clock({ mode: 'stopwatch', accumulatedMs: 20_000 }), { kind: 'start' }, T0],
      ['pause folds the open segment', clock({ mode: 'stopwatch', startedAt: T0 - 20_000 }), { kind: 'pause' }, T0],
      ['pause adds to the bank', clock({ mode: 'stopwatch', startedAt: T0 - 20_000, accumulatedMs: 30_000 }), { kind: 'pause' }, T0],
      ['pause while idle is a no-op', clock(), { kind: 'pause' }, T0],
      ['pause with a backwards clock banks zero', clock({ mode: 'stopwatch', startedAt: T0 + 5000 }), { kind: 'pause' }, T0],
      ['reset keeps mode and duration', clock({ mode: 'stopwatch', startedAt: T0 - 5000, accumulatedMs: 9000, durationSec: 120 }), { kind: 'reset' }, T0],
      ['restart runs from zero', clock({ mode: 'stopwatch', startedAt: T0 - 50_000, accumulatedMs: 9000 }), { kind: 'restart' }, T0],
      ['restart from idle', clock(), { kind: 'restart' }, T0],
      ['setMode stops the clock', clock({ startedAt: T0 - 5000 }), { kind: 'setMode', mode: 'stopwatch' }, T0],
      ['setMode to the same mode is a no-op', clock({ startedAt: T0 - 5000 }), { kind: 'setMode', mode: 'timer' }, T0],
      ['setDuration resets a mid-flight countdown', clock({ startedAt: T0 - 30_000 }), { kind: 'setDuration', sec: 90 }, T0],
      ['setDuration clamps low', clock(), { kind: 'setDuration', sec: -15 }, T0],
      ['setDuration clamps high', clock(), { kind: 'setDuration', sec: 4200 }, T0],
      ['setDuration rounds', clock(), { kind: 'setDuration', sec: 44.5 }, T0],
      ['start on a stale clock starts fresh', clock({ mode: 'stopwatch', startedAt: T0 - 2 * 3_600_000, accumulatedMs: 5000 }), { kind: 'start' }, T0],
      ['pause on a stale clock is a no-op on the idle state', clock({ startedAt: T0 - 2 * 3_600_000, accumulatedMs: 5000 }), { kind: 'pause' }, T0],
    ]
    const opCases: Case<OpIn, SessionClock>[] = []
    for (const [name, c, op, now] of ops) {
      vi.useFakeTimers(); vi.setSystemTime(now)
      localStorage.clear()
      localStorage.setItem(CLOCK_KEY, JSON.stringify(c))
      switch (op.kind) {
        case 'setMode': setClockMode(op.mode!); break
        case 'start': startClock(op.mode); break
        case 'pause': pauseClock(); break
        case 'reset': resetClock(); break
        case 'restart': restartClock(); break
        case 'setDuration': setDurationSec(op.sec!); break
      }
      opCases.push({ name, input: { clock: c, op, now }, expected: getSessionClock() })
      vi.useRealTimers()
    }
    localStorage.clear()
    emit('session-clock-ops.json', {
      module: 'sessions/sessionClock',
      fn: 'setClockMode / startClock / pauseClock / resetClock / restartClock / setDurationSec',
      note: 'Each transition as a pure step over the stored clock at `now` (Date.now() at the moment of the call). The stored row is read through getSessionClock first, so a stale clock is idle before the step applies.',
      cases: opCases,
    })

    emit('clock-format.json', {
      module: 'sessions/sessionClock',
      fn: 'formatClock + clampDuration',
      note: 'm:ss always, h:mm:ss only past an hour, negatives and fractions floor to whole seconds; clampDuration rounds then clamps 15–3600.',
      cases: [0, 0.4, 9, 9.9, 59, 60, 90, 599, 600, 724, 3599, 3600, 3661, 3723, 36000, -5, 14.5, 15, 44.5, 45.5, 3600.4, 3601, 100000].map((sec) => ({
        name: String(sec), input: { sec }, expected: { formatted: formatClock(sec), clamped: clampDuration(sec) },
      })),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reports — the weekly export and everything it renders from
// ─────────────────────────────────────────────────────────────────────────────

const emptyExportDay = (date: string, weekdayLabel: string, over: Partial<ExportDay> = {}): ExportDay => ({
  date, weekdayLabel, isTrainingDay: false,
  weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
  steps: null, distanceM: null, trainingMin: null,
  sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
  wristTempDeltaC: null, bloodOxygenPct: null,
  waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
  weighInSkipReason: null, nutritionException: null, nutritionEstimated: false,
  ...over,
})
const xset = (weightKg: number, reps: number, over: Partial<ExportSet> = {}): ExportSet =>
  ({ weightKg, reps, rpe: null, side: null, failure: false, pairId: null, ...over })

describe('golden vectors — week numbering', () => {
  it('exports weekStartOf, weekNumberOf, weekLabelOf', () => {
    const dates = [
      '2026-03-01', '2026-03-08', '2026-05-10', '2026-06-21', '2026-06-28', '2026-07-05', '2026-07-11', '2026-07-12', '2026-07-15',
      '2026-07-18', '2026-07-19', '2026-08-03', '2026-08-23', '2026-08-29', '2026-08-30', '2026-09-03', '2026-09-05', '2026-09-06',
      '2026-10-18', '2026-12-31', '2027-01-16', '2027-01-17', 'garbage', '',
    ]
    const cases: Case<{ date: string; startDay: number }, { weekStart: string; weekNumber: number; label: string; weekNumberForDate: number }>[] = []
    for (const date of dates) for (const startDay of [0, 1]) {
      const ws = weekStartOf(date, startDay)
      cases.push({
        name: `${date || 'empty'} · start ${startDay}`,
        input: { date, startDay },
        expected: { weekStart: ws, weekNumber: weekNumberOf(ws), label: weekLabelOf(ws), weekNumberForDate: weekNumberOf(weekStartOf(date, startDay)) },
      })
    }
    emit('week-number.json', {
      module: 'reports/weekNumber + utils/week',
      fn: 'weekStartOf / weekNumberOf / weekLabelOf',
      note: 'weekStartOf echoes an unparseable date; weekNumberOf is Math.round(weeks since 2026-07-12) and 0 when unparseable; a negative week draws its label from the phase, else "Week N".',
      cases,
    })
  })
})

describe('golden vectors — weekly export', () => {
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const baseDays = WEEK.map((wd, i) => emptyExportDay(`2026-08-2${3 + i}`, wd))
  const BASE: WeeklyExportInput = {
    weekStart: '2026-08-23', weekEnd: '2026-08-29', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: baseDays, sessions: [], volumeByMuscle: [], doms: [],
  }

  const SA = 'Single Arm Lateral Raise (Cable)'
  const richDays: ExportDay[] = [
    emptyExportDay('2026-08-30', 'Sun', {
      sleepMin: 551, deepMin: 62, remMin: 118, coreMin: 350, awakeMin: 21, bedTime: '2026-08-29T23:10:00', wakeTime: '2026-08-30T08:21:00', sleepOnsetTrouble: false,
      restingHr: 52, hrvMs: 61.5, wristTempDeltaC: 0.2, bloodOxygenPct: 97, avgHr: 71, respiratoryRate: 14.5, vo2max: 46.1, daylightMin: 42, exerciseMin: 31, standHours: 12, standMin: 58,
      weightKg: 64.9, bmrKcal: 1516, calories: 2151, proteinG: 172, carbsG: 244, fatG: 55, waterMl: 3100, steps: 7842, distanceM: 6120, activeKcal: 412,
      supplementsTaken: 6, supplementsPlanned: 7, supplementsLog: [{ key: 'creatine', time: '07:00' }, { key: 'd3k2', time: '07:00' }, { key: 'omega3', time: '12:30' }, { key: 'magnesium', time: '22:00' }, { key: 'glycine', time: '22:00' }, { key: 'theanine', time: null }],
      supplementsSkipped: ['Caffeine'],
      nutrientsFood: { fiber: 31, protein: 172, sodium: 2400, potassium: 3100, calcium: 950, iron: 12, magnesium: 380, vitaminC: 124, satFat: 14, sugar: 22 },
      nutrientsStack: { vitaminC: 470, vitaminD: 2000, vitaminB12: 300, folate: 680, epa: 600, dha: 300, creatine: 5000, glycine: 5000, theanine: 200, magnesium: 200 },
    }),
    emptyExportDay('2026-08-31', 'Mon', {
      isTrainingDay: true,
      sleepMin: 470, deepMin: 40, remMin: 95, coreMin: 320, awakeMin: 15, bedTime: '2026-08-30T23:50:00', wakeTime: '2026-08-31T07:55:00', sleepOnsetTrouble: true,
      restingHr: 54, hrvMs: 48, wristTempDeltaC: -0.1, bloodOxygenPct: 96, avgHr: 84, respiratoryRate: 15.1, vo2max: 46.1, daylightMin: 12, exerciseMin: 78, standHours: 14, standMin: 40,
      weightKg: 64.6, bmrKcal: 1514, calories: 2160, proteinG: 175, carbsG: 250, fatG: 52, waterMl: 3500, steps: 11204, distanceM: 8900, trainingMin: 78, activeKcal: 688,
      supplementsTaken: 7, supplementsPlanned: 9, supplementsLog: [{ key: 'creatine', time: '07:00' }, { key: 'citrulline', time: '11:45' }, { key: 'caffeine', time: '11:45' }],
      nutrientsFood: { fiber: 28, protein: 175, sodium: 3100, potassium: 3000, calcium: 3074, iron: 9, magnesium: 300, vitaminC: 80, satFat: 24, sugar: 45 },
      nutrientsStack: { creatine: 5000, citrulline: 3000, caffeine: 200 },
    }),
    emptyExportDay('2026-09-01', 'Tue', {
      isTrainingDay: true, nutritionException: 'Illness',
      sleepMin: 505, deepMin: 55, remMin: 100, coreMin: 335, awakeMin: 15, restingHr: 58, hrvMs: 39, wristTempDeltaC: 0.6, bloodOxygenPct: 95,
      weightKg: null, weighInSkipReason: 'Sick', calories: 1800, proteinG: 150, carbsG: 200, fatG: 45, waterMl: 2000, steps: 4100, activeKcal: 210,
      supplementsTaken: null, supplementsPlanned: 9, supplementsLog: [{ key: 'creatine', time: '07:00' }],
      nutrientsFood: { fiber: 20, protein: 150 }, nutrientsStack: {},
    }),
    emptyExportDay('2026-09-02', 'Wed', {
      nutritionException: 'Illness',
      sleepMin: 600, restingHr: 57, hrvMs: 41, weightKg: 64.4, bmrKcal: 1512, calories: 1900, proteinG: 160, carbsG: 210, fatG: 50, waterMl: 2500, steps: 3000, activeKcal: 150,
      supplementsTaken: 4, supplementsPlanned: 7, nutrientsStack: { vitaminD: 2000, creatine: 5000 },
    }),
    emptyExportDay('2026-09-03', 'Thu', {
      isTrainingDay: true, targetProfile: 'Restaurant', trackCarbs: false, trackFat: false, nutritionEstimated: true,
      sleepMin: 490, deepMin: 50, remMin: 90, coreMin: 330, awakeMin: 20, restingHr: 53, hrvMs: 55, wristTempDeltaC: 0, bloodOxygenPct: 98,
      weightKg: null, calories: 2380, proteinG: 168, carbsG: 290, fatG: 96, waterMl: 2800, steps: 9500, distanceM: 7400, trainingMin: 65, activeKcal: 590,
      supplementsTaken: 8, supplementsPlanned: 9,
    }),
    emptyExportDay('2026-09-04', 'Fri', {
      isTrainingDay: true, nutritionException: 'Refeed',
      sleepMin: 520, restingHr: 52, hrvMs: 60, weightKg: 64.2, bmrKcal: 1511, calories: 2600, proteinG: 170, carbsG: 330, fatG: 70, waterMl: 3000, steps: 10200, trainingMin: 70, activeKcal: 620,
      supplementsTaken: 9, supplementsPlanned: 9,
    }),
    emptyExportDay('2026-09-05', 'Sat', { weighInSkipReason: 'Travel' }),
  ]

  const richSessions: ExportSession[] = [
    {
      date: '2026-08-31', label: 'Legs & Core A', sessionNumber: 41, startedAt: '2026-08-31T09:02:00', endedAt: '2026-08-31T10:20:00',
      volumeKg: 8329.25, setCount: 9, failureSets: 1, durationMin: 78, avgBpm: 118, caloriesBurned: 512, sessionRpe: 8.5,
      exercises: [
        { name: 'Leg Press', topKg: 75, repWindow: '8–12', restTargetSec: 150, restPlanSec: 135, sets: [
          xset(40, 15, { warmup: true }), xset(75, 12, { rpe: 8.5 }), xset(75, 12, { rpe: 9.5, quality: 'momentum' }), xset(75, 10, { rpe: 10, failure: true }),
        ] },
        { name: 'Hack Squat', topKg: 55, repWindow: '10–12', restTargetSec: 135, restPlanSec: 135, sets: [
          xset(55, 12, { rpe: 9 }), xset(55, 12, { ghost: true }), xset(55, 11, { rpe: null, failure: true }),
        ] },
        { name: 'Reverse Crunch', topKg: 0, repWindow: '12–15', sets: [xset(0, 17, { rpe: 8 }), xset(0, 15)] },
        { name: 'Calf Press', topKg: 70, repWindow: null, sets: [] },
      ],
      prs: [
        { name: 'Leg Press', weightKg: 75, reps: 12, axes: ['weight', 'volume', 'e1rm'], volumeKg: 900, e1rmKg: 105 },
        { name: 'Reverse Crunch', weightKg: 0, reps: 17, axes: ['reps'], volumeKg: 0, e1rmKg: null },
      ],
    },
    {
      date: '2026-09-01', label: 'Delts & Arms', sessionNumber: 42,
      volumeKg: 1210.5, setCount: 6, failureSets: 0, durationMin: 55, avgBpm: 110, caloriesBurned: 380, caloriesEstimated: true, avgBpmEstimated: true, sessionRpe: null,
      exercises: [
        { name: SA, topKg: 5, repWindow: '12–20', sets: [
          xset(2.5, 15, { warmup: true, side: 'L', pairId: 'w1' }), xset(2.5, 15, { warmup: true, side: 'R', pairId: 'w1' }),
          xset(5, 15, { rpe: 8, side: 'L', pairId: 'p1' }), xset(5, 17, { rpe: 9, side: 'R', pairId: 'p1' }),
          xset(5, 14, { rpe: 9.5, side: 'L', pairId: 'p2', failure: true }), xset(5, 16, { rpe: null, side: 'R', pairId: 'p2' }),
          xset(5, 14, { rpe: null, side: 'L', pairId: 'p3', ghost: true }), xset(5, 14, { rpe: null, side: 'R', pairId: 'p3', ghost: true }),
          xset(5, 12, { rpe: 9, side: 'L' }),
        ] },
        { name: 'Side Plank', topKg: 0, repWindow: null, sets: [xset(0, 55, { rpe: 9, side: 'L', pairId: 'h1' }), xset(0, 60, { rpe: 9.5, side: 'R', pairId: 'h1' })] },
        { name: 'DB Hammer Curl', topKg: 20, repWindow: '10–12', sets: [xset(20, 12, { rpe: 10 }), xset(20, 10, { rpe: 9, quality: 'form_breakdown' })] },
      ],
      prs: [
        { name: 'Side Plank', weightKg: 0, reps: 60, axes: ['reps'], volumeKg: null, e1rmKg: null },
        { name: SA, weightKg: 5, reps: 17, axes: ['volume', 'e1rm'], volumeKg: 85, e1rmKg: 7.8 },
      ],
    },
    {
      date: '2026-09-03', label: 'Upper B', startedAt: '2026-09-03T18:30:00',
      volumeKg: 5400, setCount: 7, failureSets: 0, durationMin: 65, avgBpm: null, caloriesBurned: null, sessionRpe: 8,
      exercises: [
        { name: 'Preacher Curl (Machine)', topKg: 18.75, repWindow: '8–12', sets: [xset(18.75, 12, { rpe: 9.5 }), xset(12.5, 8, { rpe: 10, dropset: true })] },
        { name: 'Chest Press (Machine)', topKg: 40, repWindow: '10–12', sets: [xset(40, 12), xset(40, 11), xset(40, 10)] },
        { name: 'Leg Press', topKg: 72.5, repWindow: '12–15', sets: [xset(72.5, 14, { rpe: 8 }), xset(72.5, 13, { rpe: 8.5 })] },
      ],
      prs: [],
    },
    {
      date: '2026-09-04', label: 'Legs & Core B', sessionNumber: 43,
      volumeKg: null, setCount: null, failureSets: null, durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: 6.5,
      exercises: [{ name: 'Hip Thrust (Machine)', topKg: null, repWindow: '8–15', sets: [] }],
      prs: [{ name: 'Hip Thrust (Machine)', weightKg: 30, reps: 12, axes: ['weight'], volumeKg: 360, e1rmKg: 42 }],
    },
  ]

  const RICH: WeeklyExportInput = {
    weekStart: '2026-08-30', weekEnd: '2026-09-05', weekLabel: 'Week 7', programLabel: 'Helix-5', phaseLabel: ' Cut ',
    calorieGoal: 2151, proteinGoalG: 170, stepsGoal: 7500, sleepGoalHours: 8, waterGoalMl: 3000,
    targetPeriods: [
      { leverId: 'maintenance-week', label: 'Maintenance Week', goals: { calorie: 2151, protein: 170, carbs: 244, fat: 55, steps: 7500 }, dates: ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'] },
      { leverId: 'custom', label: 'Custom', goals: { calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000 }, dates: ['2026-09-03', '2026-09-04', '2026-09-05'] },
    ],
    days: richDays,
    sessions: richSessions,
    volumeByMuscle: [
      { muscle: 'Quadriceps', sets: 12, target: 10, directSets: 12, indirectSets: 0 },
      { muscle: 'Glutes', sets: 7.5, target: 8, directSets: 3, indirectSets: 4.5 },
      { muscle: 'Side delts', sets: 14, target: 10, directSets: 14 },
      { muscle: 'Adductors', sets: 2, target: 0 },
      { muscle: 'Hamstrings', sets: 3, target: 10, directSets: 1, indirectSets: 2 },
    ],
    tonnageByMuscle: [
      { muscle: 'Quadriceps', volumeKg: 9800.5, directKg: 9800.5 },
      { muscle: 'Glutes', volumeKg: 4200, directKg: 1100.25 },
      { muscle: 'Side delts', volumeKg: 1210.5 },
    ],
    doms: [
      { date: '2026-09-01', muscle: 'Quadriceps', severity: 2, sourceLabel: 'Legs & Core A', sourceDate: '2026-08-31' },
      { date: '2026-09-01', muscle: 'Glutes', severity: 1, sourceLabel: 'Legs & Core B', sourceDate: '2026-08-28' },
      { date: '2026-09-02', muscle: 'Hamstrings', severity: 3 },
      { date: '2026-09-02', muscle: 'Quadriceps', severity: 0 },
      { date: '2026-09-04', muscle: 'Biceps', severity: 1, sourceLabel: 'Delts & Arms' },
    ],
    fatigue: [
      { date: '2026-08-30', slot: 'Waking', level: 1, label: 'Fresh' }, { date: '2026-08-30', slot: 'Midday', level: 2, label: 'Fine' }, { date: '2026-08-30', slot: 'Night', level: 3, label: 'Tired' },
      { date: '2026-08-31', slot: 'Waking', level: 2, label: 'Fine' }, { date: '2026-08-31', slot: 'Before training', level: 2, label: 'Fine' }, { date: '2026-08-31', slot: 'After training', level: 4, label: 'Heavy' },
      { date: '2026-09-01', slot: 'Waking', level: 4, label: 'Heavy' },
      { date: '2026-09-03', slot: 'Before training', level: 3, label: 'Tired' }, { date: '2026-09-03', slot: 'After training', level: 2, label: 'Fine' },
      { date: '2026-09-04', slot: 'Waking', level: 2, label: 'Fine' }, { date: '2026-09-04', slot: 'After training', level: 2, label: 'Fine' },
    ],
    bodyComp: [
      { date: '2026-08-30', weightKg: 64.9, bmi: 22.5, bodyFatPct: 16.8, musclePercent: 77.4, waterPercent: 60.1, visceralFat: 5, bmr: 1516, boneMineral: 4.9, muscleMassKg: 50.2, fatFreeMassKg: 54, fatMassKg: 10.9, proteinMassKg: 11.1, boneMineralKg: 3.18, waterMassKg: 39, proteinPercent: 17.1, skeletalMuscleMassKg: 26.9, estimatedWaistToHipRatio: 0.83 },
      { date: '2026-09-03', weightKg: null, bmi: null, bodyFatPct: null, musclePercent: null, waterPercent: null, visceralFat: null, bmr: null, boneMineral: null, muscleMassKg: null, fatFreeMassKg: null, fatMassKg: null, proteinMassKg: null, boneMineralKg: null, waterMassKg: null, skeletalMuscleMassKg: 26.8, estimatedWaistToHipRatio: 0.83 },
      { date: '2026-09-04', weightKg: 64.2, bmi: 22.2, bodyFatPct: 16.5, musclePercent: 77.6, waterPercent: 60.3, visceralFat: 5, bmr: 1511, boneMineral: 5, muscleMassKg: 49.8, fatFreeMassKg: 53.6, fatMassKg: 10.6, proteinMassKg: 11, boneMineralKg: 3.2, waterMassKg: 38.7, skeletalMuscleMassKg: 26.7, estimatedWaistToHipRatio: null },
    ],
    cardio: [
      { date: '2026-08-31', kind: 'walk', distanceM: 4200, durationMin: 48, kcal: 190, totalKcal: 260, avgHr: 104, effort: 3 },
      { date: '2026-09-03', kind: 'run', distanceM: 5050, durationMin: 25.5, kcal: null, totalKcal: null, avgHr: null, effort: null },
      { date: '2026-09-03', kind: '', distanceM: null, durationMin: 10, kcal: 40, totalKcal: 55, avgHr: 90, effort: 2.5 },
    ],
    supplementProtocol: [
      { time: '07:00', name: 'Creatine', dose: '5 g' },
      { time: '07:00', name: 'Vitamin D3 + K2', dose: '2000 IU', notes: 'with breakfast' },
      { time: '11:45', name: 'L-Citrulline', dose: '3 g', trainingOnly: true },
      { time: '11:45', name: 'Caffeine', dose: '200 mg', trainingDose: '200 mg', restDose: '100 mg', trainingOnly: true, notes: 'not after 14:00' },
      { time: '22:00', name: 'Magnesium', dose: '400 mg', trainingDose: '400 mg', restDose: '400 mg' },
      { time: null, name: 'Omega-3', dose: '2 caps' },
      { time: '07:00', name: 'creatine', dose: '10 g' },
      { time: '09:00', name: '  ', dose: 'x' },
      { time: ' 22:00 ', name: 'Glycine', dose: ' 5 g ', notes: '  ' },
    ],
    ledger: [
      { label: 'Week 5', weekStart: '2026-08-16', totals: { avgKcal: 1885, totalVolumeKg: 26340, avgSteps: 10850, cardioMinutes: 120, avgWaterMl: 3050, avgWeightKg: 65.7 } },
      { label: 'Week 6', weekStart: '2026-08-23', totals: { avgKcal: 1999, totalVolumeKg: 25102.25, avgSteps: 9800, cardioMinutes: null, avgWaterMl: 2900, avgWeightKg: 65.2 } },
      { label: 'Week 7', weekStart: '2026-08-30', totals: { avgKcal: 2165, totalVolumeKg: 14939.75, avgSteps: 7641, cardioMinutes: 83.5, avgWaterMl: 2816.67, avgWeightKg: 64.525 } },
      { label: 'Week 8', weekStart: '2026-09-06', totals: { avgKcal: null, totalVolumeKg: null, avgSteps: null, cardioMinutes: null, avgWaterMl: null, avgWeightKg: null } },
    ],
  }

  type ExportOut = {
    markdown: string
    summary: WeeklySummary
    totals: TrendTotals
    energy: EnergyBalance
    derived: DerivedWeek
    json: unknown
  }
  const run = (input: WeeklyExportInput): ExportOut => ({
    markdown: buildWeeklyExport(input),
    summary: weeklySummary(input),
    totals: trendTotals(input.days, input.sessions, input.cardio ?? []),
    energy: energyBalance(input.days),
    derived: derivedWeek(input),
    json: JSON.parse(weekJsonBlock(input)[1]),
  })

  it('exports whole documents', () => {
    const cases: Array<[string, WeeklyExportInput]> = [
      ['the empty week', BASE],
      ['the rich week — every section lit', RICH],
      ['the rich week without ledger, periods, label, phase or water goal', { ...RICH, ledger: undefined, targetPeriods: undefined, weekLabel: undefined, phaseLabel: undefined, waterGoalMl: undefined }],
      ['the rich week under one rung', { ...RICH, targetPeriods: [RICH.targetPeriods![0]] }],
      ['the rich week with an empty ledger and empty periods', { ...RICH, ledger: [], targetPeriods: [], phaseLabel: '  ' }],
      ['no days at all', { ...BASE, days: [], sessions: [] }],
      ['sessions on a week with empty days', { ...BASE, sessions: richSessions.slice(0, 1), cardio: RICH.cardio, bodyComp: RICH.bodyComp, doms: RICH.doms, fatigue: RICH.fatigue }],
      ['a first week — ledger holds only itself', { ...RICH, ledger: [RICH.ledger![2]] }],
    ]
    emit('weekly-export.json', {
      module: 'reports/weeklyExport + derived + weekJson',
      fn: 'buildWeeklyExport / weeklySummary / trendTotals / energyBalance / derivedWeek / weekJsonBlock',
      note: 'The whole document, byte for byte, plus the aggregates it renders from. `json` is the machine block PARSED — the Swift compares structure, not key order or whitespace.',
      cases: cases.map(([name, input]) => ({ name, input, expected: run(input) })),
    })
  })

  it('exports the small renderers', () => {
    const sparks: Array<[string, Array<number | null>]> = [
      ['empty', []], ['all missing', [null, null]], ['flat', [11200, 11400, 11700]], ['zeros', [0, 0, 0]], ['one day', [5000]],
      ['gap in the middle', [3000, null, 12000, 6000]], ['negative', [-5, 10]], ['rest zeros with volume', [0, 8329.25, 0, 1210.5, 0, 5400, 0]],
    ]
    emit('sparkline.json', {
      module: 'reports/weeklyExport', fn: 'sparkline',
      note: 'Eight bars scaled from ZERO to the max; a missing day is ·; empty when nothing was logged; max ≤ 0 draws the lowest bar.',
      cases: sparks.map(([name, values]) => ({ name, input: { values }, expected: sparkline(values) })),
    })

    const tables: Array<[string, string[], string[][], Array<'left' | 'right' | 'center'>]> = [
      ['three columns', ['Week', 'Kcal', ''], [['Week 5', '1885', '↑'], ['Week 10', '—', '→']], ['left', 'right', 'center']],
      ['code points not utf-16', ['A', 'B'], [['▁▂▃', 'x'], ['—', 'yy'], ['💪🏋️', 'z']], ['left', 'left']],
      ['header only', ['A', 'B'], [], ['center', 'right']],
      ['ragged rows', ['A', 'B', 'C'], [['1'], ['1', '2', '3', '4']], ['left', 'left', 'left']],
    ]
    emit('markdown-table.json', {
      module: 'reports/weeklyExport', fn: 'markdownTable',
      note: 'Padded to a common width counted in CODE POINTS; the rule row carries the alignment colons.',
      cases: tables.map(([name, header, body, align]) => ({ name, input: { header, body, align }, expected: markdownTable(header, body, align) })),
    })

    const paces: Array<[number | null, number | null]> = [[5000, 25.5], [4200, 48], [1000, 5.05], [0, 10], [5000, 0], [null, 10], [5000, null], [1, 60], [10000, 999], [3000, 15]]
    emit('pace.json', {
      module: 'cardio/metrics', fn: 'paceMinPerKm / formatPace',
      note: 'min/km, null unless both inputs are positive; formatted by rounding to the nearest SECOND first; ≥ 100 min/km is a typo and prints —.',
      cases: paces.map(([d, m]) => ({ name: `${d} m in ${m} min`, input: { distanceM: d, durationMin: m }, expected: { pace: paceMinPerKm(d, m), formatted: formatPace(paceMinPerKm(d, m)) } })),
    })

    interface SetFmtIn { weightKg: number | null; reps: number | null; timed: boolean; bare: boolean; unit: string | null }
    const fmts: Case<SetFmtIn, { text: string; unloaded: boolean }>[] = []
    for (const weightKg of [null, 0, -1, 5, 3.75, 60]) for (const reps of [null, 0, 1, 12]) for (const timed of [false, true]) for (const bare of [false, true]) {
      const unit = weightKg === 60 && !bare ? 'lb' : null
      fmts.push({
        name: `${weightKg} × ${reps}${timed ? ' timed' : ''}${bare ? ' bare' : ''}${unit ? ` ${unit}` : ''}`,
        input: { weightKg, reps, timed, bare, unit },
        expected: { text: formatSet(weightKg, reps, { timed, bare, ...(unit ? { unit } : {}) }), unloaded: isUnloadedSet(weightKg) },
      })
    }
    emit('set-format.json', {
      module: 'utils/setFormat', fn: 'formatSet / isUnloadedSet',
      note: '`60kg × 12` · `17 reps` (singular at 1) · `58 sec`; bare drops the unit words; null reps read 0; unloaded is ≤ 0 or absent.',
      cases: fmts,
    })

    const reasons: Array<string | null> = [null, '', '  ', 'No BM', 'Travel', ' Sick ', 'As Planned', 'anything']
    emit('weigh-in-skip.json', {
      module: 'body/weighIn', fn: 'weighInSkipReason / isDefaultSkipReason',
      note: 'Trimmed stored reason, else "As Planned" — the protocol default, not a logging gap.',
      cases: reasons.map((r) => ({ name: JSON.stringify(r), input: { stored: r }, expected: { reason: weighInSkipReason(r), isDefault: isDefaultSkipReason(r) } })),
    })

    emit('nutrient-targets.json', {
      module: 'nutrition/nutrientTargets', fn: 'NUTRIENT_TARGETS',
      note: 'Data: key, label, target, unit, kind, group, fromStack — in table order. The `why` and HealthKit identifiers are documentation.',
      cases: [{ name: 'the table', input: {}, expected: NUTRIENT_TARGETS.map((t) => ({ key: t.key, label: t.label, target: t.target, unit: t.unit, kind: t.kind, group: t.group, fromStack: t.fromStack ?? false })) }],
    })

    const zones: Case<{ sets: number; target: number; direct: number }, VolumeZone>[] = []
    for (const target of [0, 8, 10]) for (const sets of [0, 3, 4, 5, 7.5, 8, 10, 12, 13, 14]) for (const direct of [0, 3, 8, 10, 13, 14]) {
      zones.push({ name: `${sets}/${target} (${direct} direct)`, input: { sets, target, direct }, expected: volumeZone(sets, target, direct) })
    }
    emit('volume-zone.json', {
      module: 'training/landmarks', fn: 'volumeZone',
      note: 'na at target ≤ 0; OVER only when DIRECT/target > 1.3; else the TOTAL grades under (< 0.5) / building (< 1) / optimal.',
      cases: zones,
    })

    const nutrientCases: Array<[string, ExportDay['nutrientsFood'], ExportDay['nutrientsStack']]> = [
      ['nothing', undefined, undefined],
      ['empty maps', {}, {}],
      ['Sunday of the rich week', richDays[0].nutrientsFood, richDays[0].nutrientsStack],
      ['implausible calcium', richDays[1].nutrientsFood, richDays[1].nutrientsStack],
      ['zeros are absent', { fiber: 0, protein: 0 }, { creatine: 0 }],
      ['ceiling overshoot is not flagged', { sodium: 9000, caffeine: 0 }, { caffeine: 1500 }],
      ['stack covers a floor overshoot', { calcium: 3000 }, { calcium: 1 }],
      ['fractional values print exact', { fiber: 30.25, iron: 9.999999 }, { epa: 600.5 }],
    ]
    emit('nutrient-line.json', {
      module: 'reports/weeklyExport', fn: 'nutrientLine + flaggedNutrients',
      note: 'Every target every time in table order; provenance split only when both sides are non-zero; ⚠ on a FOOD-only floor above 2.5× target.',
      cases: nutrientCases.map(([name, food, stack]) => ({
        name, input: { food: food ?? null, stack: stack ?? null },
        expected: { line: nutrientLine(food, stack), flagged: flaggedNutrients([emptyExportDay('2026-09-01', 'Tue', { nutrientsFood: food, nutrientsStack: stack })]) },
      })),
    })

    const details: Array<[string, ExportSet[], string | undefined]> = [
      ['empty', [], 'Leg Press'],
      ['the rich Leg Press', richSessions[0].exercises[0].sets, 'Leg Press'],
      ['the rich Hack Squat — a ghost, an unrated failure', richSessions[0].exercises[1].sets, 'Hack Squat'],
      ['unloaded reverse crunch', richSessions[0].exercises[2].sets, 'Reverse Crunch'],
      ['the mixed lateral raise', richSessions[1].exercises[0].sets, SA],
      ['the timed plank pair', richSessions[1].exercises[1].sets, 'Side Plank'],
      ['hammer curl — failure by rating and a quality flag', richSessions[1].exercises[2].sets, 'DB Hammer Curl'],
      ['a drop set', richSessions[2].exercises[0].sets, 'Preacher Curl (Machine)'],
      ['nothing rated at all', richSessions[2].exercises[1].sets, 'Chest Press (Machine)'],
      ['no exercise name', [xset(40, 12, { rpe: 9 })], undefined],
      ['failure with rating 9 says to failure', [xset(40, 12, { rpe: 9, failure: true })], 'X'],
      ['failure with rating 10 does not repeat itself', [xset(40, 12, { rpe: 10, failure: true })], 'X'],
      ['pair with only a left half', [xset(5, 12, { rpe: 8, side: 'L', pairId: 'p' })], SA],
      ['pair with a sideless half lands on the left', [xset(5, 12, { rpe: 8, pairId: 'p' }), xset(5, 14, { rpe: 9, side: 'R', pairId: 'p' })], SA],
      ['a bare side without a pair is a plain set', [xset(5, 12, { rpe: 8, side: 'R' })], SA],
      ['warm-up pair with a rating', [xset(2, 15, { warmup: true, side: 'L', pairId: 'w', rpe: 5 }), xset(2, 15, { warmup: true, side: 'R', pairId: 'w' })], SA],
      ['quarter-kilo loads', [xset(3.75, 16, { rpe: 8.5 }), xset(5.25, 12)], 'X'],
      ['unknown quality key is ignored', [xset(40, 12, { rpe: 9, quality: 'wobbly' })], 'X'],
      ['one unloaded rep still says reps (as the export does)', [xset(0, 1, { rpe: 8 })], 'Hanging Knee Raise'],
    ]
    emit('set-detail.json', {
      module: 'reports/weeklyExport', fn: 'setDetail',
      note: 'One line per set; warm-ups and ghosts carry no number; per-set rating and word, "RPE not reported" on unrated working sets only when some set was rated, else one closing note.',
      cases: details.map(([name, sets, exerciseName]) => ({ name, input: { sets, exerciseName: exerciseName ?? null }, expected: setDetail(sets, exerciseName) })),
    })

    emit('supplements-consolidate.json', {
      module: 'reports/weeklyExport', fn: 'consolidateSupplements',
      note: 'One chronological list deduped by lower-cased name; a split dose is stated as a rule; blank names dropped; sorted by time with — first.',
      cases: [
        { name: 'the rich protocol', input: { protocol: RICH.supplementProtocol }, expected: consolidateSupplements(RICH.supplementProtocol!) },
        { name: 'empty', input: { protocol: [] }, expected: consolidateSupplements([]) },
        { name: 'same time keeps input order', input: { protocol: [{ time: '07:00', name: 'B', dose: '1' }, { time: '07:00', name: 'A', dose: '2' }] }, expected: consolidateSupplements([{ time: '07:00', name: 'B', dose: '1' }, { time: '07:00', name: 'A', dose: '2' }]) },
      ],
    })

    emit('trend-ledger.json', {
      module: 'reports/weeklyExport', fn: 'trendLedger',
      note: 'One row per week, oldest first; Δ kg to two places against the row above; the arrow is direction only.',
      cases: [
        { name: 'the rich ledger', input: { weeks: RICH.ledger }, expected: trendLedger(RICH.ledger!) },
        { name: 'one week', input: { weeks: [RICH.ledger![0]] }, expected: trendLedger([RICH.ledger![0]]) },
        { name: 'empty', input: { weeks: [] }, expected: trendLedger([]) },
        { name: 'a tie and a fractional volume', input: { weeks: [RICH.ledger![0], { ...RICH.ledger![0], label: 'W', totals: { ...RICH.ledger![0].totals, avgWeightKg: 65.7, totalVolumeKg: 8329.249999999 } }] }, expected: trendLedger([RICH.ledger![0], { ...RICH.ledger![0], label: 'W', totals: { ...RICH.ledger![0].totals, avgWeightKg: 65.7, totalVolumeKg: 8329.249999999 } }]) },
      ],
    })

    emit('report-notes.json', {
      module: 'reports/weeklyExport', fn: 'priorReportNote / fatigueLabelsFor / constants',
      note: 'The closing line per label, the two fatigue slot triples, and the three standing notes verbatim.',
      cases: [{
        name: 'the strings', input: {},
        expected: {
          notes: ([undefined, null, '', '  ', 'Week 7', ' Week 7 '] as Array<string | null | undefined>).map((l) => ({ label: l ?? null, note: priorReportNote(l) })),
          training: fatigueLabelsFor(true), rest: fatigueLabelsFor(false), slots: FATIGUE_SLOT_LABELS,
          unilateral: UNILATERAL_VOLUME_NOTE, epley: EPLEY_NOTE, watch: APPLE_WATCH_DISCLAIMER,
        },
      }],
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Body — composition, the delta verdict, the composition gap
// ─────────────────────────────────────────────────────────────────────────────

describe('golden vectors — body', () => {
  it('exports the InBody engine', () => {
    interface In { weight_kg: number | null; body_fat_pct: number | null; muscle_percent: number | null; water_percent: number | null; bone_mineral: number | null; protein_percent: number | null }
    const cases: Case<In, BodyCompDerived>[] = []
    const push = (name: string, i: Partial<In>) => {
      const input: In = { weight_kg: null, body_fat_pct: null, muscle_percent: null, water_percent: null, bone_mineral: null, protein_percent: null, ...i }
      cases.push({ name, input, expected: deriveBodyComp(input) })
    }
    push('nothing', {})
    push('weight only', { weight_kg: 64.2 })
    push('the live reading', { weight_kg: 64.2, body_fat_pct: 16.8, muscle_percent: 78.3, water_percent: 60.1, bone_mineral: 4.9 })
    push('with a protein % — it wins', { weight_kg: 64.2, body_fat_pct: 16.8, muscle_percent: 78.3, water_percent: 60.1, bone_mineral: 4.9, protein_percent: 17.1 })
    push('protein backed out of the fat-free compartment', { weight_kg: 65, body_fat_pct: 17, water_percent: 58, bone_mineral: 5 })
    push('protein floor at zero', { weight_kg: 65, body_fat_pct: 17, water_percent: 80, bone_mineral: 5 })
    push('no protein without water', { weight_kg: 65, body_fat_pct: 17, bone_mineral: 5 })
    push('no protein without bone', { weight_kg: 65, body_fat_pct: 17, water_percent: 58 })
    push('percentages without a weight', { body_fat_pct: 17, muscle_percent: 78 })
    push('zero weight is a number', { weight_kg: 0, body_fat_pct: 17 })
    push('rounding to two places', { weight_kg: 64.25, body_fat_pct: 16.75, muscle_percent: 77.77, water_percent: 60.125, bone_mineral: 4.95 })
    push('a negative zero rounds away', { weight_kg: 60, body_fat_pct: 0, water_percent: 100, bone_mineral: 0 })
    emit('body-comp-derive.json', {
      module: 'body/composition',
      fn: 'deriveBodyComp',
      note: 'Every mass = weight × % to 2 dp; fat-free = weight × (1 − bf/100); protein from its own % else max(0, FFM − water − bone) when all three exist. Only fields whose inputs are present are returned. Skeletal muscle is NEVER derived.',
      cases,
    })

    const whr: Case<{ ratio: number; sex: 'male' | 'female' }, WhrBand>[] = []
    for (const sex of ['male', 'female'] as const) for (const ratio of [0.7, 0.79, 0.8, 0.84, 0.85, 0.89, 0.9, 0.95, 0.99, 1, 1.1]) {
      whr.push({ name: `${sex} ${ratio}`, input: { ratio, sex }, expected: whrBand(ratio, sex) })
    }
    emit('whr-band.json', {
      module: 'body/composition', fn: 'whrBand',
      note: 'WHO bands on the SCALE\'s own ratio: male low < 0.90 ≤ moderate < 1.00 ≤ high; female 0.80 / 0.85.',
      cases: whr,
    })
    emit('visceral-band.json', {
      module: 'body/composition', fn: 'visceralBand',
      note: 'Stricter than the scale: optimal < 5, elevated 5–7, high above.',
      cases: [0, 3, 4.9, 5, 6, 7, 7.5, 8, 12].map((index) => ({ name: String(index), input: { index }, expected: visceralBand(index) })),
    })
  })

  it('exports the delta verdict', () => {
    const cases: Case<{ metric: Metric; delta: number; phase: 'cut' | 'bulk'; maintenance: boolean }, Verdict>[] = []
    const deltas = [-2, -0.6, -0.5, -0.4, -0.3, -0.29, -0.2, -0.05, -0.01, -0.009, 0, 0.009, 0.01, 0.05, 0.2, 0.29, 0.3, 0.4, 0.5, 0.6, 2]
    for (const metric of ['weight', 'fat', 'muscle', 'water'] as Metric[]) for (const phase of ['cut', 'bulk'] as const) for (const maintenance of [false, true]) for (const delta of deltas) {
      cases.push({ name: `${metric} ${delta} on a ${phase}${maintenance ? ' (maintenance)' : ''}`, input: { metric, delta, phase, maintenance }, expected: deltaVerdict(metric, delta, phase, maintenance) })
    }
    emit('delta-verdict.json', {
      module: 'body/deltaVerdict',
      fn: 'deltaVerdict',
      note: 'Under 0.01 is noise; water is never a verdict; muscle is good up / bad down in every phase; maintenance has a dead band (0.5 weight, 0.3 fat) and judges like a cut outside it; fat loss is good everywhere and fat gain is neutral on a bulk; weight flips with the phase.',
      cases,
    })
    emit('maintenance-band.json', {
      module: 'body/deltaVerdict', fn: 'MAINTENANCE_BAND',
      note: 'The dead band per metric; water is unbounded (never a verdict) and is exported as null.',
      cases: [{ name: 'the band', input: {}, expected: { weight: MAINTENANCE_BAND.weight, fat: MAINTENANCE_BAND.fat, muscle: MAINTENANCE_BAND.muscle, water: null } }],
    })
  })

  it('exports the composition gap', () => {
    const rows: Array<[string, BodyCompFields | null]> = [
      ['null', null],
      ['empty', {}],
      ['weight only', { weight_kg: 64.2 }],
      ['weight with nulls', { weight_kg: 64.2, body_fat_pct: null, muscle_mass_kg: null, skeletal_muscle_mass_kg: null }],
      ['zero weight is no weight', { weight_kg: 0, body_fat_pct: 17 }],
      ['body fat only', { weight_kg: 64.2, body_fat_pct: 16.8 }],
      ['lean soft tissue only', { weight_kg: 64.2, muscle_mass_kg: 50.3 }],
      ['skeletal only', { weight_kg: 64.2, skeletal_muscle_mass_kg: 26.8 }],
      ['two of three', { weight_kg: 64.2, body_fat_pct: 16.8, muscle_mass_kg: 50.3 }],
      ['complete', { weight_kg: 64.2, body_fat_pct: 16.8, muscle_mass_kg: 50.3, skeletal_muscle_mass_kg: 26.8 }],
      ['a zero body fat is not present', { weight_kg: 64.2, body_fat_pct: 0, muscle_mass_kg: 50.3, skeletal_muscle_mass_kg: 26.8 }],
      ['no weight but composition', { body_fat_pct: 16.8, muscle_mass_kg: 50.3 }],
    ]
    emit('body-comp-gap.json', {
      module: 'body/compGap',
      fn: 'bodyCompState / missingBodyCompFields / bodyCompGapLabel / bodyCompGapShort',
      note: 'A weigh-in with an empty composition is a STATE, not an absence. Present means a finite number > 0. The label names the owed fields in entry order, "lean soft tissue" never "muscle".',
      cases: rows.map(([name, row]) => ({
        name, input: { row },
        expected: { state: bodyCompState(row), missing: missingBodyCompFields(row), label: bodyCompGapLabel(row), short: bodyCompGapShort(row) },
      })),
    })
  })
})
