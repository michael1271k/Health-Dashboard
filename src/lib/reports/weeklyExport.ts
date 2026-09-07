/**
 * "Export Week" — a dense, DRY-DATA payload of one training week (Sunday →
 * Saturday). No prompt, no coaching instructions, no interpretation: just the
 * numbers the app measured, laid out so a model (or a human) can read them.
 *
 * Design rules:
 *  · Deterministic and pure — same input, same string (unit-testable, no clock).
 *  · Explicitly marks MISSING data as "—" rather than omitting the row, so a gap
 *    can't be read as a zero. A day with no weigh-in shows a blank weight.
 *  · Every number is one the app actually measured. Nothing is derived, averaged
 *    into existence, or estimated to fill a column. NO estimated 1RM — a derived
 *    figure has no place in a raw-data export.
 *  · Unilateral work is split per side, L and R on ONE line per numbered set.
 *  · Line-by-line TEXT only for the RAW data — no markdown tables. One line per
 *    day, in a FIXED order — sleep → intake → water → steps — with the deep
 *    body-comp reading and the day's walks/cardio nested under it. The one
 *    exception is the closing week-over-week block, which is a comparison of two
 *    aligned columns and is genuinely a table; see `trendLedger`.
 *
 * DELIBERATE OMISSIONS. Day Score and Battery are not exported: both are HELIX's
 * own derived opinions, not measurements, and this file is raw data only.
 *
 * ACTIVE ENERGY still has no daily line — HealthKit inflates it (700+ kcal days
 * that never happened) and a wrong number sitting beside measured ones gets read
 * as measured. It IS used, once, as an input to the weekly energy-balance
 * ESTIMATE, where it is named as an estimate, its inputs are spelled out, and
 * the closing Apple Watch note covers the accuracy of the whole class. An
 * estimate the reader can audit is a different object from a number pretending
 * to be a fact.
 */
// Pace is the one derived value allowed here: it is arithmetic over two exported
// facts (distance, duration), not an opinion, and it is the unit a run is
// actually read in.
import { paceMinPerKm, formatPace } from '@/lib/cardio/metrics'
import { isTimedExercise } from '@/lib/exercises/timed'
import { SET_QUALITY } from '@/lib/training/setTags'
import { isUnloadedSet } from '@/lib/utils/setFormat'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { rpeLabel } from '@/lib/training/effort'
import { weighInSkipReason } from '@/lib/body/weighIn'
import { TEF_FACTOR, tefKcal, tdeeKcal } from '@/lib/nutrition/energy'
import { NUTRIENT_TARGETS } from '@/lib/nutrition/nutrientTargets'
import { derivedWeek } from '@/lib/reports/derived'
import type { TargetPeriod } from '@/lib/nutrition/levers'

/**
 * One supplement as the export needs it — every field a value the user can
 * change in the app, none of it known to this module.
 */
export interface ExportSupplement {
  /** "HH:MM", or blank for an unscheduled item. */
  time: string | null
  name: string
  dose: string
  /** Present only where the dose genuinely differs by day. */
  trainingDose?: string
  restDose?: string
  trainingOnly?: boolean
  /** A rule the dose can't state: "2 on Monday & Friday", "empty stomach". */
  notes?: string
}

/**
 * Readiness v9's signals for one day, exactly as the scorer read them —
 * `ReadinessSignals` flattened to the figures the Derived block prints.
 * Every field null when the history was too thin to answer.
 */
export interface ExportReadiness {
  /** 7-day rolling ln-HRV against the 42-day baseline, in SDs, SWC-gated, ±2. */
  hrvZ: number | null
  /** The same for resting HR. Positive is BAD. */
  rhrZ: number | null
  /** Today's sRPE load and the two EWMAs behind the ratio. */
  load: number | null
  acute: number | null
  chronic: number | null
  acwr: number | null
  /** Foster's week: the sum, the monotony, the strain, and the strain's z. */
  weeklyLoad: number | null
  monotony: number | null
  strain: number | null
  strainZ: number | null
}

export interface ExportDay {
  date: string                 // YYYY-MM-DD
  weekdayLabel: string         // "Mon"
  isTrainingDay: boolean
  weightKg: number | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  steps: number | null
  distanceM: number | null
  trainingMin: number | null
  sleepMin: number | null
  deepMin: number | null
  remMin: number | null
  restingHr: number | null
  hrvMs: number | null
  /**
   * Wrist temperature DEVIATION from the wearer's own baseline, in °C — which
   * is why it is signed and usually near zero. It was fetched by nothing and
   * printed by nothing until 2026-08-22, despite `daily_logs.wrist_temp_delta`
   * having carried it all along.
   */
  wristTempDeltaC: number | null
  /**
   * Blood oxygen saturation, %. This one was worse than absent: `fetchRange`
   * has always SELECTED `blood_oxygen`, and the value was then dropped on the
   * floor in `toDays` and never mapped onto a field. The column, the query and
   * the reader all existed; only the assignment was missing.
   */
  bloodOxygenPct: number | null
  /**
   * DAYTIME average heart rate — every beat of the waking day, not the resting
   * floor beside it.
   *
   * `restingHr` and this are different instruments pointed at different
   * questions: resting HR is a recovery signal and moves by two or three beats,
   * while the daily average carries the day's activity and moves by fifteen.
   * The column has been populated every day since the sync shipped and the
   * export has never named it.
   */
  avgHr?: number | null
  /** Breaths per minute, sleeping average. An illness signal, like wrist temp. */
  respiratoryRate?: number | null
  /**
   * VO₂ max, ml/kg/min, as the watch estimates it.
   *
   * It moves slowly — 45.7 → 47.0 across one week here — which is exactly why
   * it belongs in a document read week over week: no single day's figure is
   * interesting, and the SERIES is the only cardiovascular trend the app holds.
   */
  vo2max?: number | null
  /** Minutes in daylight. A circadian input, and one the wearer can act on. */
  daylightMin?: number | null
  /** Apple's exercise ring, minutes. */
  exerciseMin?: number | null
  /** Apple's stand ring: whole hours stood, and the minutes underneath it. */
  standHours?: number | null
  standMin?: number | null
  /**
   * ── SLEEP ARCHITECTURE ──────────────────────────────────────────────────────
   * `deepMin` and `remMin` have been declared on this interface since it was
   * written and hardcoded `null` by every builder, with a comment saying the
   * totals suffice. They do not. Two identical 9h30 nights, one with 26 minutes
   * of deep sleep and one with 86, are different nights in every way a coach
   * cares about, and `sleep_sessions` has carried the split all along.
   */
  coreMin?: number | null
  awakeMin?: number | null
  /** Bed and wake CLOCK times, "HH:MM" local. The timing, not just the amount. */
  bedTime?: string | null
  wakeTime?: string | null
  /**
   * Self-reported: it took a long time to fall asleep that night.
   *
   * The one sleep fact on this line that is not a measurement. HealthKit reports
   * when the wearer WAS asleep and has no reading at all for the hour spent
   * trying — so a 6h10 night that took twenty minutes to start and a 6h10 night
   * that took two hours are the same row everywhere else in this document, and
   * they are not the same night. Absent (undefined) on a range built before the
   * column existed; `false` means the question was asked and answered no.
   */
  sleepOnsetTrouble?: boolean | null
  /**
   * The battery's inputs the app read for this day and the raw body cannot
   * show, and the `daily_scores.battery_pct` it stored. Read ONLY by the
   * Derived section, which prints them beside the arithmetic they feed.
   *
   * `restingHrBaseline` / `hrvBaseline` are v8's seven-day trailing means —
   * still carried because the recovery SCORE reads them, but the battery has
   * not since v9. `readiness` is what v9 reads instead: the z-signals and the
   * load figures `computeReadinessSignals` resolved from 49 days of history.
   * Absent on a range built before the field existed; `batteryPct` null when
   * the app never scored the day.
   */
  restingHrBaseline?: number | null
  hrvBaseline?: number | null
  batteryPct?: number | null
  readiness?: ExportReadiness | null
  waterMl: number | null
  supplementsTaken: number | null
  /**
   * How many items the protocol ASKED for that day — the denominator.
   *
   * `supplementsTaken` alone is a number with no scale: 4 is perfect adherence
   * on a rest day and 44% on a training day, and the export printed neither the
   * count nor the target. Null where the protocol is unknown.
   */
  supplementsPlanned?: number | null
  /**
   * What was taken, and when it was DUE.
   *
   * `time` used to be the clock time the item was ticked
   * (`supplement_log.taken_at`), on the reasoning that a pre-workout taken at
   * 19:00 was not taken pre-workout. The reasoning was sound and the data never
   * supported it: half those stamps were written by the auto-log pass using the
   * slot's own scheduled time, so the column mixed the two meanings and the
   * export printed every value as though it were an observation. The scheduled
   * time is the one that is always true, and it is what the protocol is judged
   * against.
   */
  supplementsLog?: Array<{ key: string; time: string | null }>
  /**
   * Doses deliberately dropped — the only thing that now counts as a miss.
   *
   * Names, not keys, because this line is read by a human and `d3k2` is not one.
   */
  supplementsSkipped?: string[]
  /**
   * The day's micronutrients, food and stack kept APART.
   *
   * Not merged into one figure, because "594 mg of vitamin C" means something
   * different when a tablet supplied 470 of it — the Nutrients page has always
   * drawn that line and the export now draws it too. Keys match
   * `NUTRIENT_TARGETS[].key`, so the renderer needs no translation layer.
   */
  nutrientsFood?: Record<string, number | undefined>
  nutrientsStack?: Record<string, number | undefined>
  /**
   * Apple Watch active energy. NOT printed on the daily line — see the file
   * header. Carried solely so the weekly energy-balance estimate has an
   * expenditure side, and named `activeKcal` rather than `calories` so the two
   * halves of the balance can never be confused for each other.
   */
  activeKcal: number | null
  /**
   * Basal metabolic rate as the SCALE reported it — a measurement, not a
   * Mifflin-St Jeor guess, which is why it is only present on weigh-in days.
   * `energyBalance` fills the gaps by carrying the nearest reading across; BMR
   * moves a couple of kcal a week, so that is interpolation of a flat line
   * rather than invention.
   */
  bmrKcal: number | null
  /**
   * WHY there is no weigh-in, when the day was deliberately skipped.
   *
   * A blank weight is ambiguous: it can mean "not weighed", "weighed and the
   * sync dropped it", or "skipped on purpose because the protocol wasn't met"
   * (no bowel movement, ate late, travelling). Those are different data points
   * and only the last one is safe to drop from a trend — so the reason is
   * exported rather than left to be guessed. Null on days that were weighed,
   * and on skipped days with no reason recorded — where null does NOT mean
   * "unknown": it resolves to the protocol default, "As Planned". See
   * `lib/body/weighIn.ts`.
   */
  weighInSkipReason: string | null
  /**
   * A day DECLARED an exception — allowed to miss its calorie target.
   *
   * Tagged on the day line, and deliberately absent from every aggregate: the
   * week's average intake, the energy balance and the weight trend all keep the
   * real number, because they describe physics. A cut that shows a stall must
   * still show the intake that caused it. The tag exists so the reader knows
   * the spike was chosen, not so the spike can be discounted.
   */
  nutritionException: string | null
  /**
   * The day's intake figures are an ESTIMATE — ate out, could not weigh.
   *
   * Tagged on the day line for exactly the same reason as the exception above,
   * and absent from every aggregate for a stronger one: it forgives nothing. An
   * estimate is still the best available knowledge of what was eaten, so it
   * enters the average at full weight. The tag exists so the reader can discount
   * their CONFIDENCE in a single day's number without the arithmetic moving.
   */
  nutritionEstimated: boolean
  /**
   * ── WHAT THE DAY WAS ASKED FOR, AND WHAT IT WAS NOT GRADED ON ──────────────
   * The named shape the day was given — "Home", "Restaurant" — or null for a day
   * that took the rung's numbers unchanged.
   *
   * It reads like a second exception tag and is the opposite of one. An
   * exception explains an intake that MISSED its target; a shape says the target
   * itself was different, chosen in advance, and met or missed on its own terms.
   * A reader meeting "2,380 kcal" inside a 1,999 rung needs to know which of the
   * two they are looking at, and until now the document could only say the first.
   */
  targetProfile?: string | null
  /**
   * Was this macro graded on this day?
   *
   * `false` on a restaurant day, where the split is not knowable at a table and
   * a target inherited from the rung would invent a miss out of nothing. The
   * export must not print `54/55 F` for a day that had no fat target: the ratio
   * would be read as adherence to something nobody was aiming at.
   *
   * Absent (undefined) on a payload built before shapes existed, which is the
   * same as tracked — every day before this was.
   */
  trackCarbs?: boolean | null
  trackFat?: boolean | null
}

/**
 * A walk / run from the cardio ledger. Exported for completeness but explicitly
 * flagged: its steps and calories are ALREADY inside the day's step count and
 * energy, so a reader must not add it on top.
 */
export interface ExportCardio {
  date: string
  kind: string                 // walk | run
  distanceM: number | null
  durationMin: number | null
  /** Active energy. Pace is derived at render time from distance ÷ duration. */
  kcal: number | null
  totalKcal: number | null
  avgHr: number | null
  effort: number | null        // Borg CR10
}

/** One working set, in order. `side` is null on bilateral sets. */
export interface ExportSet {
  weightKg: number
  reps: number
  /**
   * Per-set effort, 1–10 on the 0.5 grid. null = NOT REPORTED, which the export
   * states outright rather than implying — an omitted rating and a set that felt
   * easy are different facts, and a reader with no marker cannot tell them apart.
   */
  rpe: number | null
  side: 'L' | 'R' | null
  failure: boolean
  /** Ramp-up set. Exported and tagged, never silently dropped. */
  warmup?: boolean
  /**
   * Deliberately not performed. The export had no field for this at all, so a
   * ghost took a numbered `Set N:` line and its full tonnage — indistinguishable
   * from work, in the one document that exists to say what the week actually
   * was.
   */
  ghost?: boolean
  /**
   * A drop set — load stripped mid-set and the set continued.
   *
   * The fourth member of `SET_TAGS` and the only one this interface had no
   * field for, so a drop set exported as an ordinary numbered set. It is not a
   * cosmetic distinction: two of them in a row read as a load being outgrown
   * when they are in fact one extended set.
   */
  dropset?: boolean
  /**
   * How the set went — one of the closed `SET_QUALITY` values, or absent.
   *
   * Absent means the question was never asked, NOT that the set was clean. The
   * export says nothing rather than asserting a technique nobody reported.
   */
  quality?: string | null
  /** Unilateral pairs share a pairId so L and R collapse into one numbered set. */
  pairId: string | null
}

export interface ExportExercise {
  name: string
  sets: ExportSet[]
  /**
   * The rest target in force for this exercise, in seconds, and whether it was
   * changed from the plan's own figure.
   *
   * ── WHY A TARGET AND NOT A MEASUREMENT ───────────────────────────────────
   * `workout_sets.rest_sec` is dead — it stopped being written on 2026-08-19
   * and across the whole database it never held a value. Rest in this app is a
   * PRESCRIPTION (`ProgramExercise.restSec`, overridable per exercise), so what
   * the export can honestly report is what you were aiming for, and whether you
   * moved it mid-block. Reporting it as elapsed rest would be a fabrication.
   *
   * The override lives in localStorage, which is why this is assembled
   * client-side in `useWeeklyLoop` and needs no column.
   */
  restTargetSec?: number | null
  restPlanSec?: number | null
  topKg: number | null
  /** Programmed rep window, when the exercise is in the active program. */
  repWindow: string | null
}

export interface ExportSession {
  date: string
  /**
   * When the session started and ended, as full timestamps.
   *
   * ── WHY A DURATION WAS NOT ENOUGH ──────────────────────────────────────────
   * The line carried "87 Minutes" and nothing else, so two sessions of identical
   * length were indistinguishable — and they are not the same session. A leg day
   * at 07:30 is trained on an empty stomach against a night's recovery; the same
   * 87 minutes at 21:00 is trained on a day's fatigue, four hours before the
   * sleep it will be scored against. Every other timed thing in this document
   * (sleep, the supplement slots) already states its clock time.
   *
   * `started_at` was being read and then truncated to a date; `ended_at` was
   * never selected at all. Optional because a session rebuilt from a markdown
   * report has a date and no clock.
   */
  startedAt?: string | null
  endedAt?: string | null
  /**
   * The session's ordinal across the WHOLE history, 1-based — "Session #15".
   * Counted from every session that precedes it, not from the week, so the
   * number means the same thing in every report it ever appears in.
   *
   * Optional: it is derived from a count of everything that came before, which
   * a caller building a session by hand has no way to know. Absent means "not
   * numbered", and the line simply omits the "#" rather than inventing one.
   */
  sessionNumber?: number | null
  label: string                // "Upper A"
  volumeKg: number | null
  setCount: number | null
  /** Working sets taken to failure. */
  failureSets: number | null
  durationMin: number | null
  avgBpm: number | null
  caloriesBurned: number | null
  /**
   * Provenance for the two figures above. A session logged without a watch has
   * them filled by formula (see `sessions/estimates.ts`), and a derived number
   * standing unmarked beside measured ones is read as measured — the one thing
   * this export exists to prevent.
   */
  caloriesEstimated?: boolean | null
  avgBpmEstimated?: boolean | null
  /** Borg CR10 session effort, when rated. */
  sessionRpe: number | null
  exercises: ExportExercise[]
  /**
   * Named PRs set in this session (no est-1RM VALUE — raw lift only).
   *
   * `axes` names WHICH record each lift set — Weight, Reps, Volume, 1RM. "PR on
   * Hack Squat" is four different claims wearing one word: a heavier top load, a
   * longer set at the same load, more total tonnage, or a better estimated max.
   * The axis is the whole meaning, and without it the reader can only guess
   * which number moved. Empty when the ledger holds no row for the movement.
   */
  prs: Array<{
    name: string
    weightKg: number
    reps: number
    axes: PrAxis[]
    /** The set's own tonnage — weight × reps, the volume axis's actual value. */
    volumeKg: number | null
    /**
     * Estimated 1RM, Epley. Read from the stored `est_1rm_kg` where there is
     * one and computed where there is not — with `||`, never `??`, because an
     * unloaded set stores 0 and 0 is not an estimate.
     */
    e1rmKg: number | null
  }>
}

/** One fatigue reading: a day, a slot, and the word. */
export interface ExportFatigue {
  date: string
  slot: string
  level: number
  label: string
}

export interface ExportDoms {
  date: string
  muscle: string
  severity: number
  /**
   * WHICH SESSION the soreness is attributed to, and when that session was.
   *
   * `doms_logs` has carried `source_session_id` and `source_day_key` since they
   * shipped, and the export asked for neither — so a week's soreness arrived as
   * a list of symptoms with no cause attached. Delayed onset is the whole point
   * of the measurement: "Hamstrings 2" says nothing a coach can use, and
   * "Hamstrings 2, from Legs B three days ago" is a dose-response reading.
   *
   * Both optional: rows written before the columns existed carry neither, and
   * the line simply omits the attribution rather than inventing one.
   */
  sourceLabel?: string | null
  /** The source session's date, so the renderer can say how many days out. */
  sourceDate?: string | null
}

/** A day's full InBody / scale reading (only days with a measurement are passed). */
export interface ExportBodyComp {
  date: string
  weightKg: number | null
  bmi: number | null
  bodyFatPct: number | null
  musclePercent: number | null
  waterPercent: number | null
  visceralFat: number | null
  bmr: number | null
  boneMineral: number | null
  /**
   * TWO masses, never one "lean mass". Muscle mass is weight × muscle%;
   * fat-free mass is weight − fat and includes bone, water and organs. They are
   * ~2.6 kg apart, and emitting one field that silently meant either is what
   * made the same week's report contradict itself.
   */
  muscleMassKg: number | null
  fatFreeMassKg: number | null
  /**
   * The rest of the compartments, in ABSOLUTE kg.
   *
   * The report used to print percentages for these and masses for only two, so a
   * reader comparing weeks had to multiply by a bodyweight that was itself
   * moving. A percentage of a falling weight can rise while the tissue shrinks;
   * kilograms cannot lie that way.
   */
  fatMassKg: number | null
  proteinMassKg: number | null
  boneMineralKg: number | null
  waterMassKg: number | null
  /**
   * Protein as a share of bodyweight, %. The mass beside it is proteinMassKg.
   * Optional: older readings predate the column and carry the mass alone.
   */
  proteinPercent?: number | null
  /** Entered from the scale — NOT weight × muscle%. See lib/body/composition.ts. */
  skeletalMuscleMassKg: number | null
  /** The scale's own estimate. Helix tracks no tape measurements. */
  estimatedWaistToHipRatio: number | null
}

export interface WeeklyExportInput {
  weekStart: string            // Sunday YYYY-MM-DD
  weekEnd: string
  weekLabel?: string           // "Week 3" etc, when known
  programLabel: string         // "Helix Cut"
  calorieGoal: number | null
  proteinGoalG: number | null
  stepsGoal: number | null
  sleepGoalHours: number | null
  /** Daily hydration target, ml. Part of the week's instruction like any other. */
  waterGoalMl?: number | null
  /** "Cut" / "Maintenance" — the phase the week was run in. */
  phaseLabel?: string | null
  /**
   * What was actually asked for, day by day, collapsed into runs.
   *
   * The four goal fields above are the week's HEADLINE targets and are kept for
   * the callers that only have those. This is the truth when a lever moved
   * mid-week — see `leverPeriods`. Omit it and the section falls back to the
   * single Targets line, which is what every export looked like before.
   */
  targetPeriods?: TargetPeriod[]
  days: ExportDay[]
  sessions: ExportSession[]
  /**
   * Sets per muscle against the week's target. `sets` is direct + indirect and
   * is the graded figure; the split is carried alongside so the reader can see
   * how much of a muscle's week was assistance work. See SECONDARY_SET_CREDIT.
   */
  volumeByMuscle: Array<{
    muscle: string; sets: number; target: number
    directSets?: number; indirectSets?: number
  }>
  /**
   * Weekly TONNAGE per muscle, pre-aggregated (see `weeklyTonnageByMuscle`).
   * Optional: omit it and the aggregate line is skipped rather than printed
   * empty.
   */
  tonnageByMuscle?: Array<{ muscle: string; volumeKg: number; directKg?: number }>
  doms: ExportDoms[]
  /**
   * Subjective fatigue, up to three readings a day.
   *
   * Reported, never scored — see `useFatigue`. It sits in the export because a
   * coach reading a week wants to know that Thursday's session followed three
   * days that ended "Heavy"; it stays out of `daily_scores` because a number
   * you can talk yourself into is not a measurement.
   */
  fatigue?: ExportFatigue[]
  /** Full body-composition readings for the week's weigh-in days (optional). */
  bodyComp?: ExportBodyComp[]
  /** Walks / runs from the cardio ledger, nested under their day. */
  cardio?: ExportCardio[]
  /** Static protocol — what to take on training vs rest days (derived from the plan). */
  /**
   * The user's supplement stack, straight from `custom_supplements`. Optional:
   * omit it and the section is skipped rather than printed from a constant.
   */
  supplementProtocol?: ExportSupplement[]
  /**
   * EVERY week of the programme, oldest first, for the closing ledger.
   *
   * Passed pre-aggregated rather than as weeks of raw days: the ledger needs six
   * numbers per week, and re-fetching every table for weeks that will never be
   * printed line-by-line is what got the original "vs previous week" block
   * deleted. One narrow query set covers the whole programme regardless of how
   * many weeks it has run — see `fetchTrendLedger`.
   *
   * Omit it and the section is skipped entirely; an empty trend is worse than
   * none.
   */
  ledger?: LedgerWeek[]
}

const n = (v: number | null | undefined, digits = 0): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

/** "Not recorded". Distinct from 0, which would be a claim. */
const DASH = '—'

/**
 * A number at FULL precision — no fixed decimal count, no rounding to a
 * friendlier figure.
 *
 * Session volume is the reason this exists. `n()` printed it at 0 dp, so
 * 8329.25 kg — the exact tonnage the Session Report shows — exported as "8329"
 * and the two surfaces disagreed about the same session. Volume is a sum of
 * quarter-kilogram microloads, so its decimals are real work, not noise.
 *
 * The 1e-6 snap is a float-representation guard, not a rounding rule: it turns
 * 8329.249999999999 back into 8329.25 and changes nothing else. `String()`
 * then drops trailing zeros on its own, so a whole number stays whole.
 */
const exact = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? DASH : String(Math.round(v * 1e6) / 1e6)

/** `walk` → `Walk`, `run` → `Run`; anything else passes through capitalised. */
const cardioLabel = (kind: string): string =>
  kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Cardio'

/** "Thu", from the day rows the export already carries. */
function weekdayOf(date: string, days: readonly ExportDay[]): string {
  return days.find((d) => d.date === date)?.weekdayLabel ?? ''
}

/**
 * The fatigue slot labels, IN THE ORDER A DAY HAPPENS, as the export names them.
 *
 * ── WHY THE LABELS ARE REPEATED HERE ─────────────────────────────────────────
 * `SLOT_LABEL` lives in `useFatigue`, which is a client hook: importing it here
 * would drag React Query into a module whose entire contract is that it is pure
 * and deterministic. The labels are five short strings, so the copy is cheap —
 * and `export-completeness.test.ts` asserts the two lists stay identical, which
 * is what actually keeps them honest.
 *
 * The order matters more than it looks. A string sort gives "After training,
 * Before training, Midday, Night, Waking" — alphabetical, and very nearly the
 * reverse of the day it describes.
 *
 * ── AND WHY A DAY ONLY EVER PRINTS THREE OF THEM ─────────────────────────────
 * The vocabulary is five; a day asks three. The middle and last slots depend on
 * whether the day trained — "Evening" on a leg day and "Evening" on a rest day
 * were the same question in the old four-slot scheme, and the reader could not
 * tell which one had been answered. `fatigueLabelsFor` picks the triple, from
 * `ExportDay.isTrainingDay`, which this payload has always carried.
 */
export const FATIGUE_SLOT_LABELS = ['Waking', 'Midday', 'Before training', 'After training', 'Night'] as const

/** What a training day asks, in order. */
export const FATIGUE_LABELS_TRAINING = ['Waking', 'Before training', 'After training'] as const
/** What a rest day asks, in order. */
export const FATIGUE_LABELS_REST = ['Waking', 'Midday', 'Night'] as const

/** The three slot labels a day of this kind asks for. */
export function fatigueLabelsFor(isTrainingDay: boolean): readonly string[] {
  return isTrainingDay ? FATIGUE_LABELS_TRAINING : FATIGUE_LABELS_REST
}

/** "21:27" from a timestamp, in the log's own local wall clock. */
const clock = (ts: string | null | undefined): string => {
  if (!ts) return DASH
  const m = /T(\d{2}:\d{2})/.exec(ts)
  if (m) return m[1]
  const d = new Date(ts)
  return Number.isFinite(d.getTime())
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : DASH
}

/**
 * ONE MICRONUTRIENT, said in full: what was taken, out of what, from where.
 *
 * Every target in `NUTRIENT_TARGETS` prints on every day, in the table's own
 * order, `—` where nothing was measured — the same rule the rest of this
 * document runs on. A nutrient that silently vanishes on the days it was not
 * logged is a nutrient the reader concludes was never tracked.
 *
 * The provenance split is the part that carries the meaning. "Vitamin C:
 * 594/90 mg" reads as a diet rich in fruit; "594/90 mg (124 food + 470 stack)"
 * says a tablet supplied four fifths of it, which is a different fact about a
 * different week. It is stated ONLY where both sides are non-zero — on a
 * stack-only nutrient the `(stack)` tag already says everything, and on a
 * food-only one there is nothing to split.
 *
 * `kind` is named on ceilings and left silent on floors: a floor is the
 * ordinary case and a ceiling INVERTS the reading of the same arithmetic —
 * 200/400 mg of caffeine is on protocol, while 200/400 mg of magnesium is half
 * a dose.
 */
export function nutrientLine(
  food: Record<string, number | undefined> | undefined,
  stack: Record<string, number | undefined> | undefined,
): string {
  const parts = NUTRIENT_TARGETS.map((t) => {
    const f = food?.[t.key], k = stack?.[t.key]
    const hasF = f != null && Number.isFinite(f) && f > 0
    const hasK = k != null && Number.isFinite(k) && k > 0
    const total = (hasF ? f : 0) + (hasK ? k : 0)
    // Tags describe the TARGET and print whether or not a value exists — they
    // are properties of the goal, not of the day.
    const tags = [
      t.kind === 'ceiling' ? 'ceiling' : null,
      t.fromStack && !hasF ? 'stack' : null,
    ].filter(Boolean).join(', ')
    const suffix = tags ? ` (${tags})` : ''
    if (!hasF && !hasK) return `${t.label}: ${DASH}/${exact(t.target)} ${t.unit}${suffix}`
    const split = hasF && hasK ? ` (${exact(f)} food + ${exact(k)} stack)` : ''
    const flag = implausibleNutrient(t, hasF ? f : 0, hasK ? k : 0) ? '⚠ ' : ''
    return `${t.label}: ${flag}${exact(total)}/${exact(t.target)} ${t.unit}${suffix}${split}`
  })
  return parts.join(' · ')
}

/**
 * How far past a FLOOR target a value has to sit before the document doubts it.
 *
 * ── THE READING THAT PROMPTED THIS ───────────────────────────────────────────
 * `nutrition_entries.micros.calcium` is bimodal on this account: about 155–290 mg
 * on most days, and about 3,070–3,383 mg on seventeen of them. Calories, sodium
 * and potassium are normal on the high days, so it is one ~3,100 mg contributor
 * rather than a duplicated day — and both populations come from the same writer,
 * the HealthKit daily ingest.
 *
 * The export was right every time: 3,074 is what the column holds. But
 * `nutrition_entries` stores a `meal_type = 'daily'` AGGREGATE with no item
 * breakdown, so nothing downstream — this document included — can identify the
 * contributor or correct it. What it can do is stop printing an obviously
 * impossible number in the same voice as a measured one.
 *
 * 2.5× is deliberately loose. A genuine 2,500 mg calcium day is possible if
 * unusual; three times the target on a 1,943 kcal day is not, and a threshold
 * tight enough to catch a merely-high day would flag real food.
 *
 * FLOORS only. A ceiling target (sodium, caffeine) is a limit rather than a
 * goal, and exceeding one is the ordinary thing it exists to report — flagging
 * that as implausible would put a warning on the document's most useful line.
 *
 * FOOD only, and only when the stack contributed nothing. A tablet is entitled
 * to overshoot enormously — the multivitamin here supplies 470 mg of vitamin C
 * against a 90 mg target, which is five times over and completely correct. The
 * calcium readings have no stack source at all (no item in this protocol carries
 * calcium), so "large, and nothing was taken that could explain it" is the shape
 * that separates the real problem from every legitimate overshoot.
 */
const IMPLAUSIBLE_FLOOR_MULTIPLE = 2.5

function implausibleNutrient(t: { kind?: string; target: number }, food: number, stack: number): boolean {
  if (t.kind === 'ceiling') return false
  if (stack > 0) return false
  return t.target > 0 && food > t.target * IMPLAUSIBLE_FLOOR_MULTIPLE
}

/** Every "<Micro> on <date>" the week flagged, for the note at the foot. */
export function flaggedNutrients(days: readonly ExportDay[]): string[] {
  const out: string[] = []
  for (const d of days) {
    for (const t of NUTRIENT_TARGETS) {
      const f = d.nutrientsFood?.[t.key], k = d.nutrientsStack?.[t.key]
      const food = typeof f === 'number' && f > 0 ? f : 0
      const stack = typeof k === 'number' && k > 0 ? k : 0
      if (implausibleNutrient(t, food, stack)) out.push(`${t.label} ${exact(food)} ${t.unit} on ${d.date}`)
    }
  }
  return out
}

/**
 * Render one exercise's sets — ONE LINE PER SET.
 *
 * ── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────────
 * The old form packed a whole exercise onto one line by grouping consecutive
 * same-load sets and hanging the ratings off the rep counts:
 *
 *     60kg × 12,11,10 · 55kg × 12 (Failure)
 *     60kg × 11@8.5, 10@9
 *
 * It is compact and it is close to unreadable. `11@8.5` requires the reader to
 * know that `@` means effort and that 8.5 is on a ten-point scale; the grouping
 * means set three of the exercise is the third number inside the first group
 * unless a load changed, in which case it is somewhere else. A model asked to
 * reason about set-by-set progression has to parse a bespoke notation before it
 * can start.
 *
 * The load grouping existed to show a load being outgrown — 12, 11, 10 down a
 * single line. One set per line shows the same thing in a column, which is if
 * anything easier to read, and each line says what it is in words.
 *
 * ── THE SIDE BUG THIS FIXES ──────────────────────────────────────────────────
 * The old renderer asked ONE question for the whole exercise —
 * `sets.some(s => s.side != null)` — and if any set was sided it ran every set
 * through the unilateral branch, where an unsided set hit `else p.L = s` and was
 * stamped LEFT.
 *
 * That is not a hypothetical. Single Arm Lateral Raise (Cable) on 2026-08-18
 * carries six rows: sets 1–2 paired L/R, sets 3–4 bilateral with no side and no
 * pairId at all, sets 5–6 paired again. The export invented an "L" for sets 3
 * and 4, gave each its own set number, and printed no R for either — reporting a
 * left-arm-only session that never happened.
 *
 * So the question is asked PER SET, where it belongs: a row with a `pairId` is
 * half of a two-sided set, and a row without one is a set. Mixed exercises —
 * which is what a real session looks like when you split some sets and not
 * others — come out right, and no set is ever attributed to a limb the log does
 * not name.
 */

/** "8.5 — Hard". The number AND the word: neither is much use alone. */
function rpeText(rpe: number | null): string {
  // Every rating is on the 0.5 grid, so the natural string is already exact:
  // 8.5 stays "8.5" and 9 stays "9". A fixed 1 dp would print "9.0", which reads
  // as more precision than the scale has.
  return `RPE ${String(rpe)} — ${rpeLabel(rpe)}`
}

/** One display row: a bilateral set, or the two halves of a unilateral one. */
interface SetRow {
  /** Both present only on a genuine pair. */
  left?: ExportSet
  right?: ExportSet
  /** A plain set — no side, no pair. */
  single?: ExportSet
}

/**
 * Group an exercise's rows for display, deciding PER SET rather than per
 * exercise. See the note above for the bug this shape exists to prevent.
 *
 * A `pairId` is what makes a row half of a two-sided set. A bare `side` with no
 * pair is treated as a plain set: the side is an annotation the log happens to
 * carry, not evidence that a partner row exists.
 */
export function toSetRows(sets: readonly ExportSet[]): SetRow[] {
  const rows: SetRow[] = []
  const byPair = new Map<string, SetRow>()
  for (const s of sets) {
    if (s.pairId) {
      let row = byPair.get(s.pairId)
      if (!row) { row = {}; byPair.set(s.pairId, row); rows.push(row) }
      if (s.side === 'R') row.right = s
      else row.left = s
      continue
    }
    rows.push({ single: s })
  }
  return rows
}

export function setDetail(sets: ExportSet[], exerciseName?: string): string[] {
  if (!sets.length) return ['—']

  /**
   * Effort coverage for THIS exercise. Warm-ups are excluded — they are never
   * rated by design, so their silence is not a gap.
   *
   * The marker goes on each unrated WORKING set, so it is clear which sets are
   * missing a rating rather than which are present. When NOTHING was rated the
   * exercise says so once at the end instead, because a note on every line is a
   * note nobody reads.
   */
  const anyRated = sets.some((s) => !s.warmup && !s.ghost && s.rpe != null)
  const noneRated = !anyRated && sets.some((s) => !s.warmup && !s.ghost)
  const NOT_REPORTED = 'RPE not reported'

  const timed = isTimedExercise(exerciseName)
  /** The set's magnitude, in whatever unit the movement actually has. */
  const value = (w: number, reps: number): string =>
    timed ? `${reps} sec`
      : isUnloadedSet(w) ? `${reps} reps`
      : `${w} kg × ${reps}`

  /** The parenthetical after a set's numbers. */
  const notes = (s: ExportSet): string => {
    const bits: string[] = []
    if (s.rpe != null) bits.push(rpeText(s.rpe))
    else if (anyRated && !s.warmup && !s.ghost) bits.push(NOT_REPORTED)
    // "to failure" is suppressed when the rating already says Failure — RPE 10
    // IS the top of the ladder, and `(RPE 10 — Failure, to failure)` states one
    // fact twice in six words.
    if (s.warmup) bits.push('warm-up')
    else if (s.failure && rpeLabel(s.rpe).toLowerCase() !== 'failure') bits.push('to failure')
    // A drop set is not an ordinary set at a lighter load, and unmarked it
    // reads as one — two of them in sequence look exactly like a load being
    // outgrown across two sets rather than one set extended twice.
    if (s.dropset) bits.push('drop set')
    /* Last in the parenthetical, and in the reader's own words rather than the
       stored key: the person reading this is a coach, not a database.

       It is LABELLED rather than dropped in bare. "(RPE 9.5 — Max Effort,
       momentum)" leaves a reader to work out what the third item is and how it
       relates to the second — and on a value like "Cold" or "Assisted" the
       guess goes wrong, because either could be read as a comment on the
       effort. Naming the axis costs twelve characters and removes the question.

       The label keeps its own capitalisation, which is what makes it read as a
       named value rather than a word in a sentence. */
    const q = s.quality ? SET_QUALITY[s.quality] : undefined
    if (q) bits.push(`Set Quality: ${q.label}`)
    return bits.length ? ` (${bits.join(', ')})` : ''
  }

  const rows = toSetRows(sets)

  // Warm-ups do NOT consume a set number — "Set 1" is the first WORKING set,
  // which is what the program prescribes and what the app's own ledger counts.
  // Neither does a ghost, for a different reason: it did not happen.
  let num = 0
  const lines = rows.map((row) => {
    if (row.single) {
      const s = row.single
      if (s.ghost) return `Skipped: ${value(s.weightKg, s.reps)} (planned)`
      if (s.warmup) return `Warm-up: ${value(s.weightKg, s.reps)}${notes(s)}`
      num += 1
      return `Set ${num}: ${value(s.weightKg, s.reps)}${notes(s)}`
    }
    // A pair. Each side keeps its own rating and its own failure tag — a weaker
    // arm can genuinely rate harder at the same load, and collapsing the two
    // would erase the only reason to split the set in the first place.
    const halves = [
      row.left ? `L ${value(row.left.weightKg, row.left.reps)}${notes(row.left)}` : null,
      row.right ? `R ${value(row.right.weightKg, row.right.reps)}${notes(row.right)}` : null,
    ].filter(Boolean)
    const ghosted = (row.left ?? row.right)?.ghost
    if (ghosted) return `Skipped: ${halves.join(' · ')} (planned)`
    const warm = (row.left ?? row.right)?.warmup
    if (warm) return `Warm-up: ${halves.join(' · ')}`
    num += 1
    return `Set ${num}: ${halves.join(' · ')}`
  })

  return noneRated ? [...lines, `_(${NOT_REPORTED} for any working set)_`] : lines
}

/** Mean of the values that exist. Null when none do — never 0. */
/** Mean of the values that EXIST, nulls skipped. Null when none do — never 0.
 *  Distinct from `mean` above, which takes an already-filtered array. */
const meanOf = (xs: Array<number | null | undefined>): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Sum of the values that exist. Null when none do — 0 would be a claim. */
const sum = (xs: Array<number | null | undefined>): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

export interface WeeklySummary {
  avgSleepMin: number | null
  avgRestingHr: number | null
  avgHrvMs: number | null
  cardioMinutes: number | null
  cardioActiveKcal: number | null
  cardioSessions: number
  peakDoms: { muscle: string; severity: number; date: string } | null
  /**
   * Mean Borg CR10 session effort across the sessions that were RATED.
   *
   * Unrated sessions are skipped, not scored 0 — an effort of zero is a claim
   * about how hard a workout was, and "not rated" is a claim about the log. The
   * count of rated sessions rides alongside so a 9.0 from one session out of
   * five cannot read as the week's character.
   */
  avgSessionRpe: number | null
  ratedSessions: number
  /**
   * Per-set coverage. The session average above says how hard the weeks' workouts
   * felt; this says how much of that is actually evidence. 4 of 96 sets rated is
   * a different claim from 90 of 96, and the mean alone hides which one it is.
   * Warm-ups are excluded from both — they are never rated by design.
   */
  ratedSets: number
  workingSets: number
}

/**
 * The handful of week-level facts that are NOT a sum of the daily lines.
 *
 * The export deliberately refuses to pre-chew derived aggregates — every daily
 * number is already printed and a stale summary is worse than none. These four
 * earn their place because reconstructing them costs the reader real work:
 * three means across seven rows, a total across a nested list, and a max across
 * a table sorted by date rather than by severity.
 *
 * Averages ignore missing days rather than counting them as zero: four nights of
 * sleep in a week is a 7.2 h average over four nights, not a 4.1 h average over
 * seven.
 */
export function weeklySummary(input: WeeklyExportInput): WeeklySummary {
  const cardio = input.cardio ?? []
  let peak: WeeklySummary['peakDoms'] = null
  for (const d of input.doms) {
    if (d.severity <= 0) continue
    // Strictly greater, so the FIRST day a peak was reached keeps it.
    if (!peak || d.severity > peak.severity) peak = { muscle: d.muscle, severity: d.severity, date: d.date }
  }
  const rated = input.sessions.filter((s) => s.sessionRpe != null && Number.isFinite(s.sessionRpe))
  return {
    avgSleepMin: meanOf(input.days.map((d) => d.sleepMin)),
    avgRestingHr: meanOf(input.days.map((d) => d.restingHr)),
    avgHrvMs: meanOf(input.days.map((d) => d.hrvMs)),
    cardioMinutes: sum(cardio.map((c) => c.durationMin)),
    cardioActiveKcal: sum(cardio.map((c) => c.kcal)),
    cardioSessions: cardio.length,
    peakDoms: peak,
    avgSessionRpe: meanOf(rated.map((s) => s.sessionRpe)),
    ratedSessions: rated.length,
    ...(() => {
      let ratedSets = 0
      let workingSets = 0
      for (const s of input.sessions) for (const ex of s.exercises) {
        /* ── A UNILATERAL PAIR IS ONE SET HERE, AS IT IS EVERYWHERE ELSE ─────
           This loop used to walk `ex.sets` raw, so a single-arm exercise logged
           per side counted double — and v3 prints the result as `working_sets`
           on the `## WEEK` line, one line above a `## WEEK.MUSCLE` block that
           collapses the same pairs correctly, and a few lines below a
           `## SESSIONS` row whose `sets` comes from the app's own ledger, which
           also collapses them. Three numbers describing the same work, one of
           them disagreeing. `toSetRows` is the single grouper the token
           renderer and the prose renderer already share; using it here makes
           the fourth caller agree by construction rather than by care.

           A pair counts as RATED when EITHER side carries a rating: the set was
           rated, even if only one arm's effort was recorded. Counting it unrated
           would report a coverage gap that the log does not have. */
        for (const row of toSetRows(ex.sets)) {
          const sides = [row.single, row.left, row.right].filter((x): x is ExportSet => x != null)
          if (!sides.length) continue
          // A ghost is not an unrated working set — it is a set that did not
          // happen, and counting it here would drag the RPE-coverage figure down
          // for doing exactly what a maintenance week asks.
          if (sides.some((x) => x.warmup || x.ghost)) continue
          workingSets += 1
          if (sides.some((x) => x.rpe != null && Number.isFinite(x.rpe))) ratedSets += 1
        }
      }
      return { ratedSets, workingSets }
    })(),
  }
}

/**
 * An eight-level ASCII sparkline over a week's daily values.
 *
 * A column of seven numbers states the total; its SHAPE states whether the week
 * was even or carried by one day, and a reader has to hold all seven to see it.
 * The glyph does that in seven characters, next to the mean it summarises.
 *
 * SCALED FROM ZERO, not from the minimum. A floating baseline turns a flat week
 * (11.2k, 11.4k, 11.7k steps) into a dramatic staircase, which is the classic
 * way a sparkline lies. From zero, flat looks flat.
 *
 * A missing day is `·`, never `▁`. The lowest bar is a real, small value; a day
 * that was never logged is not a small value, and the two must not share a
 * glyph. Returns an empty string when nothing was logged at all.
 */
const SPARK_BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const
const SPARK_GAP = '·'

export function sparkline(values: ReadonlyArray<number | null | undefined>): string {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!present.length) return ''
  const max = Math.max(...present, 0)
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return SPARK_GAP
    if (max <= 0) return SPARK_BARS[0]
    const i = Math.round((v / max) * (SPARK_BARS.length - 1))
    return SPARK_BARS[Math.max(0, Math.min(SPARK_BARS.length - 1, i))]
  }).join('')
}

/**
 * The six figures the week-over-week block compares. One shape, computed by ONE
 * function for both weeks, so "this week" and "last week" can never be measured
 * differently — the failure mode that makes a trend table worse than no table.
 */
export interface TrendTotals {
  /** Mean intake across the days that logged food. */
  avgKcal: number | null
  /** TOTAL tonnage lifted — a sum, not a mean: a week with four sessions did more work. */
  totalVolumeKg: number | null
  avgSteps: number | null
  /** TOTAL cardio minutes across every walk and run. */
  cardioMinutes: number | null
  /** Mean intake per day that logged any water. */
  avgWaterMl: number | null
  /** Mean of the week's weigh-ins — the trend figure, immune to one bad morning. */
  avgWeightKg: number | null
}

/**
 * Aggregate a week into the trend shape.
 *
 * MEANS SKIP MISSING DAYS RATHER THAN COUNTING THEM AS ZERO. Three weigh-ins in
 * a week average the three; treating the other four as 0 kg would report a
 * 27 kg bodyweight and a catastrophic "trend". The same rule governs calories,
 * steps and water — a day that was never logged is unknown, not empty.
 *
 * The two TOTALS are honest sums for the opposite reason: volume and cardio
 * minutes are work that either happened or did not, and a rest day really is a
 * zero.
 */
export function trendTotals(
  days: readonly ExportDay[],
  sessions: readonly ExportSession[],
  cardio: readonly ExportCardio[] = [],
): TrendTotals {
  return {
    avgKcal: meanOf(days.map((d) => d.calories)),
    totalVolumeKg: sum(sessions.map((s) => s.volumeKg)),
    avgSteps: meanOf(days.map((d) => d.steps)),
    cardioMinutes: sum(cardio.map((c) => c.durationMin)),
    avgWaterMl: meanOf(days.map((d) => d.waterMl)),
    avgWeightKg: meanOf(days.map((d) => d.weightKg)),
  }
}

/**
 * The week's energy balance — an ESTIMATE, and labelled as one everywhere it
 * appears.
 *
 * expenditure = BMR + Apple Watch active energy + TEF (see nutrition/energy.ts).
 * Both sides are per-day and only days holding an intake AND an expenditure are
 * counted, so a half-logged day cannot masquerade as a 1900 kcal deficit.
 *
 * TEF RIDES ON THE INTAKE, which is why it can never be carried across a gap the
 * way BMR is: a day with no logged food has no thermic effect to count, and the
 * day is already excluded for having no intake. `balanceKcal` is intake − burn:
 * NEGATIVE is a deficit, positive a surplus, and the sign is stated in words at
 * the render site because a bare "−3400" is exactly the number people read
 * backwards.
 *
 * BMR IS CARRIED ACROSS GAPS. It comes off the scale, so it exists only on
 * weigh-in days — three or four in a typical week. Dropping the other days would
 * discard most of the week; treating a missing BMR as zero would report a
 * fictional surplus. Basal rate moves single-digit kcal over a week (1515 → 1517
 * across the live cut), so the nearest reading is the honest fill: forwards
 * first, then backwards for days before the week's first weigh-in.
 */
export interface EnergyBalance {
  /** Days with BOTH an intake and an expenditure — the estimate's real width. */
  daysCounted: number
  intakeKcal: number | null
  expenditureKcal: number | null
  /** intake − expenditure. Negative = deficit. */
  balanceKcal: number | null
  avgBalanceKcal: number | null
  /** Mean BMR actually used, after the carry. */
  avgBmrKcal: number | null
  avgActiveKcal: number | null
  /** Mean thermic effect of food — intake × TEF_FACTOR, per counted day. */
  avgTefKcal: number | null
  /** True when at least one day's BMR was inherited rather than measured. */
  bmrCarried: boolean
  /**
   * The dates that actually entered the estimate, in order.
   *
   * Returned rather than recomputed by the renderer, deliberately. The counted
   * -day rule is three conditions — an intake, a BMR after the carry, and an
   * active-energy reading — and a second implementation of it in the render site
   * would be free to drift, at which point the report would name a day as
   * excluded that the arithmetic had in fact included. One rule, one place, and
   * the caller is handed the answer.
   */
  countedDates: string[]
}

export function energyBalance(days: readonly ExportDay[]): EnergyBalance {
  const empty: EnergyBalance = {
    daysCounted: 0, intakeKcal: null, expenditureKcal: null, balanceKcal: null,
    avgBalanceKcal: null, avgBmrKcal: null, avgActiveKcal: null, avgTefKcal: null,
    bmrCarried: false, countedDates: [],
  }
  const measured = days.map((d) => (d.bmrKcal != null && Number.isFinite(d.bmrKcal) ? d.bmrKcal : null))
  // Forward fill, then backward fill — the nearest reading in either direction.
  // `bmrCarry` is the ONE implementation of the carry; the `## DERIVED tdee`
  // row reads the same array, so the footer cannot disagree with this estimate.
  const filled = bmrCarry(days)

  let intake = 0, burn = 0, bmrSum = 0, activeSum = 0, tefSum = 0, counted = 0, carried = false
  const countedDates: string[] = []
  days.forEach((d, i) => {
    const bmr = filled[i]
    const active = d.activeKcal != null && Number.isFinite(d.activeKcal) ? d.activeKcal : null
    const kcal = d.calories != null && Number.isFinite(d.calories) ? d.calories : null
    // Both sides or neither. An intake with no expenditure is not a balance.
    if (kcal == null || bmr == null || active == null) return
    if (measured[i] == null) carried = true
    // TEF is a function of THIS day's intake, so it is summed per day rather
    // than derived from the week's total at the end — identical arithmetic for a
    // plain sum, but it stays correct if the counted-day rule ever changes.
    const tef = tefKcal(kcal) as number
    intake += kcal
    burn += bmr + active + tef
    bmrSum += bmr
    activeSum += active
    tefSum += tef
    counted += 1
    countedDates.push(d.date)
  })
  if (!counted) return empty
  return {
    daysCounted: counted,
    intakeKcal: Math.round(intake),
    expenditureKcal: Math.round(burn),
    balanceKcal: Math.round(intake - burn),
    avgBalanceKcal: Math.round((intake - burn) / counted),
    avgBmrKcal: Math.round(bmrSum / counted),
    avgActiveKcal: Math.round(activeSum / counted),
    avgTefKcal: Math.round(tefSum / counted),
    bmrCarried: carried,
    countedDates,
  }
}

/**
 * A padded markdown table.
 *
 * Cells are padded to a common column width so the RAW markdown lines up in a
 * plain text editor as well as it does rendered — the export gets pasted into
 * both, and a ragged pipe-table is unreadable in the first.
 *
 * Widths count CODE POINTS, not UTF-16 units, so the ↑ / ↓ / → glyphs and the
 * sparkline bars align like any other character.
 */
export function markdownTable(
  header: readonly string[],
  body: ReadonlyArray<readonly string[]>,
  align: ReadonlyArray<'left' | 'right' | 'center'>,
): string[] {
  const all = [header, ...body]
  const width = header.map((_, c) => Math.max(...all.map((r) => [...(r[c] ?? '')].length)))
  const pad = (s: string, c: number) => {
    const gap = width[c] - [...s].length
    if (align[c] === 'left') return s + ' '.repeat(gap)
    if (align[c] === 'right') return ' '.repeat(gap) + s
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + s + ' '.repeat(gap - left)
  }
  const line = (cells: readonly string[]) => `| ${cells.map((c, i) => pad(c ?? '', i)).join(' | ')} |`
  const rule = `|${width.map((w, c) =>
    align[c] === 'left' ? `:${'-'.repeat(w)}-`
      : align[c] === 'right' ? `-${'-'.repeat(w)}:`
      : `:${'-'.repeat(w)}:`).join('|')}|`
  return [line(header), rule, ...body.map(line)]
}

/** One week in the cumulative ledger: its label and its aggregates. */
export interface LedgerWeek {
  /** "Week 3". Whatever the rest of the app calls it — see `weekLabelOf`. */
  label: string
  weekStart: string
  totals: TrendTotals
}

/**
 * ↑ / ↓ / → — DIRECTION ONLY, never a verdict.
 *
 * No green, no "good", no arrow that means "well done". Whether falling calories
 * are progress or a problem depends on the phase, and this file exports raw data
 * and lets the reader judge. The glyph says which way the number moved and
 * nothing else.
 */
function directionGlyph(cur: number | null, prev: number | null): string {
  if (cur == null || prev == null) return DASH
  const d = cur - prev
  return Math.abs(d) < 1e-9 ? '→' : d > 0 ? '↑' : '↓'
}

/**
 * THE CUMULATIVE LEDGER — one row per week, oldest at the top.
 *
 * PIVOTED from the old two-column layout (2026-08-06). Metric-per-row against
 * this-week/last-week answers "what changed since Sunday", which is the smallest
 * question the data can answer. A programme is a trajectory: whether a 500 kcal
 * deficit is holding, whether volume has been climbing for a month or stalled
 * three weeks ago, whether bodyweight is falling at a rate the training can
 * survive. None of that is visible in two columns, and all of it is visible in a
 * column read downwards.
 *
 * ONE Δ COLUMN, on bodyweight only. A delta beside every metric turns twelve
 * numbers into twenty-four and buries the series in its own first differences —
 * the trajectory IS the table now, and the reader can see it. Bodyweight keeps
 * one because week-to-week weight change is the single number a cut is steered
 * by, and it is a subtraction nobody should have to do in their head.
 */
export function trendLedger(weeks: readonly LedgerWeek[]): string[] {
  const kcal = (v: number | null) => (v == null ? DASH : `${n(v)}`)
  const kg = (v: number | null) => (v == null ? DASH : `${n(v, 1)}`)
  const kgExact = (v: number | null) => (v == null ? DASH : exact(Math.round((v ?? 0) * 100) / 100))
  const steps = (v: number | null) => (v == null ? DASH : n(v))
  const mins = (v: number | null) => (v == null ? DASH : n(v))
  const litres = (v: number | null) => (v == null ? DASH : n((v ?? 0) / 1000, 2))

  const header = ['Week', 'Kcal/day', 'Volume kg', 'Steps/day', 'Cardio min', 'Water L/day', 'Weight kg', 'Δ kg', '']
  const align = ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'center'] as const

  const body = weeks.map((w, i) => {
    const prev = weeks[i - 1]?.totals.avgWeightKg ?? null
    const cur = w.totals.avgWeightKg
    // Weight moves in tenths, so the delta is quoted to two places: a 0.15 kg
    // week rounded to 0.1 or 0.2 is a 33% error on the only number a cut steers by.
    const delta = cur == null || prev == null ? DASH
      : Math.abs(cur - prev) < 1e-9 ? '0.00'
      : `${cur > prev ? '+' : '−'}${Math.abs(cur - prev).toFixed(2)}`
    return [
      w.label,
      kcal(w.totals.avgKcal),
      kgExact(w.totals.totalVolumeKg),
      steps(w.totals.avgSteps),
      mins(w.totals.cardioMinutes),
      litres(w.totals.avgWaterMl),
      kg(cur),
      delta,
      directionGlyph(cur, prev),
    ]
  })

  return markdownTable(header, body, align)
}

/**
 * ── EXPORT v3, THE DENSE TOKEN GRAMMAR ───────────────────────────────────────
 *
 * v2 was ~310 lines of prose and nested bullets for one week. It read well and
 * it spent most of a model's context before the first question could be asked.
 * v3 states the same facts in ≤ 120 lines by giving every record ONE line and
 * naming its columns once, on the heading above it.
 *
 * THE WHOLE GRAMMAR, IN FOUR RULES:
 *
 *  1. A line beginning `#` is a heading. A `##` heading carries its section's
 *     column legend after the heading word, in the same `·`-separated form as
 *     the data under it. Read the legend, then read the rows positionally.
 *  2. Every data line is fields joined by ` · `. No field value ever contains
 *     `·`, so `line.split(' · ')` is the complete parser.
 *  3. A missing value is `—`. Never blank, never 0, never an omitted field —
 *     a section's column count is fixed, so a row can be zipped against its
 *     legend by index.
 *  4. Where a field holds a LIST, its items are joined by `;` and each item's
 *     own parts by `:` (or `@` for a time). Those characters appear nowhere
 *     else, which is what keeps rule 2 true.
 *
 * Sets get a fifth rule of their own, stated on the `## SESSIONS` heading.
 *
 * WHAT IS STILL TRUE FROM v2. Every number is one the app measured; `—` is a
 * gap and never a zero; the document is deterministic and pure; and the only
 * derived figures in it live under `## DERIVED`, below every measurement they
 * are built from, behind a heading that says so.
 *
 * WHAT WENT. The four closing notes — they repeated the same paragraph every
 * week to a reader who had already read it — the per-day battery breakdown, the
 * volume ZONE words (a zone is a verdict, and this document holds no verdicts),
 * and every nested bullet.
 */

/** Every data line is fields joined by this. No value may contain `·`. */
const SEP = ' · '

/** One data line. `null`/empty renders `—`; `0` renders `0`, which is a fact. */
const fields = (...cells: Array<string | number | null | undefined>): string =>
  cells.map((c) => (c == null || c === '' ? DASH : String(c))).join(SEP)

/** A list field: items joined by `;`. Empty renders `—`. */
const items = (xs: readonly string[]): string => (xs.length ? xs.join(';') : DASH)

/** Minutes, whole. EVERY duration in v3 is minutes — one unit, no suffixes. */
const minutes = (v: number | null | undefined): string => n(v, 0)

/** Metres → km, 2 dp. */
const kmOf = (m: number | null | undefined): string =>
  m == null || !Number.isFinite(m) ? DASH : n(m / 1000, 2)

/** Millilitres → litres, 2 dp. */
const litresOf = (ml: number | null | undefined): string =>
  ml == null || !Number.isFinite(ml) ? DASH : n(ml / 1000, 2)

/**
 * ── THE STAND RING IS TWO MEASUREMENTS, SO IT IS TWO COLUMNS ────────────────
 * This was one `12h58` token, which read as "12 hours 58 minutes" and is not
 * what the fields mean: `standHours` is how many hours held a stand, and
 * `standMin` is total standing minutes across the day. They are independent —
 * a real day carries `standHours: 3, standMin: 176`, and the composite
 * rendered `3h176`, a token that is malformed under its own documented shape.
 * It was also the only duration in the document not stated in plain minutes.
 * Two columns, both plain numbers, and the legend names each.
 */

/**
 * BMR carried across the days that have none — ONE implementation.
 *
 * `energyBalance` and the `## DERIVED tdee` row both need it, and two copies of
 * a forward-then-backward fill is exactly the duplication that lets a document
 * disagree with its own footer. Basal rate moves single-digit kcal across a
 * week, so the nearest reading in either direction is a fill of a flat line
 * rather than an invention.
 */
export function bmrCarry(days: readonly ExportDay[]): Array<number | null> {
  const measured = days.map((d) => (d.bmrKcal != null && Number.isFinite(d.bmrKcal) ? d.bmrKcal : null))
  // Forward fill, then backward fill — the nearest reading in either direction.
  const filled = [...measured]
  for (let i = 1; i < filled.length; i++) filled[i] ??= filled[i - 1]
  for (let i = filled.length - 2; i >= 0; i--) filled[i] ??= filled[i + 1]
  return filled
}

/**
 * One set as a token: `75×12@9.5F`, or `L5×15@8|R5×17@9` for a pair.
 *
 * `<load>×<reps>` is the set. `@<rpe>` is present only when the set was RATED —
 * an absent `@` means "not reported", which is a different fact from an easy
 * set and the reason this grammar never prints `@—`. Flags follow with no
 * separator, in a fixed order so one regex reads them all:
 *
 *   W warm-up · G ghost (planned, not performed) · D drop set · F to failure
 *   Q:<key>   the reported set quality, under `SET_QUALITY`'s own key
 *
 * A timed movement carries `t` after the count, which is then seconds: `0×55t`.
 */
function setToken(s: ExportSet, timed: boolean): string {
  const flags = `${s.warmup ? 'W' : ''}${s.ghost ? 'G' : ''}${s.dropset ? 'D' : ''}${s.failure ? 'F' : ''}`
  const quality = s.quality && SET_QUALITY[s.quality] ? `Q:${s.quality}` : ''
  const rpe = s.rpe != null && Number.isFinite(s.rpe) ? `@${String(s.rpe)}` : ''
  return `${exact(s.weightKg)}×${exact(s.reps)}${timed ? 't' : ''}${rpe}${flags}${quality}`
}

/**
 * An exercise's sets in order, pairs collapsed onto one token.
 *
 * `toSetRows` is the same grouper the prose renderer uses, so a unilateral pair
 * is ONE set here exactly as it is one set there — decided per SET by `pairId`,
 * never per exercise.
 */
function setTokens(ex: ExportExercise): string[] {
  const timed = isTimedExercise(ex.name)
  return toSetRows(ex.sets).map((r) => {
    if (r.single) return setToken(r.single, timed)
    return [
      r.left ? `L${setToken(r.left, timed)}` : null,
      r.right ? `R${setToken(r.right, timed)}` : null,
    ].filter(Boolean).join('|')
  })
}

export function buildWeeklyExport(input: WeeklyExportInput): string {
  const { days, sessions } = input
  const cardio = input.cardio ?? []
  const bodyComp = input.bodyComp ?? []
  const L: string[] = []

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Everything the week was ASKED for, on one line: which week, which
  // programme, which phase, which rung. A week run under a single lever names
  // it here and prints no `## LEVERS` section at all.
  const periods = input.targetPeriods ?? []
  const rung = periods.length === 1
    ? `lever=${periods[0].leverId} ${n(periods[0].goals.calorie)}kcal`
      + ` ${n(periods[0].goals.protein)}P ${n(periods[0].goals.carbs)}C`
      + ` ${n(periods[0].goals.fat)}F ${n(periods[0].goals.steps)}st`
    : periods.length > 1 ? 'lever=mixed' : 'lever=—'
  L.push(fields(
    `# ONYX ${input.weekLabel?.trim() || 'WEEK'}`,
    `${input.weekStart}→${input.weekEnd}`,
    input.programLabel,
    input.phaseLabel?.trim() || DASH,
    rung,
    `goals ${n(input.calorieGoal)}kcal ${n(input.proteinGoalG)}P`
      + ` ${n(input.stepsGoal)}st ${n(input.sleepGoalHours, 1)}h`
      + ` ${input.waterGoalMl == null ? DASH : `${n(input.waterGoalMl)}ml`}`,
  ))

  // ── LEVERS ────────────────────────────────────────────────────────────────
  // Printed ONLY when the week ran under more than one rung, which is the one
  // case the header line cannot state. `dates` is a run, first…last.
  if (periods.length > 1) {
    L.push('')
    L.push('## LEVERS' + SEP + ['id', 'label', 'kcal', 'P', 'C', 'F', 'steps', 'dates'].join(SEP))
    for (const p of periods) {
      L.push(fields(
        p.leverId, p.label, n(p.goals.calorie), n(p.goals.protein),
        n(p.goals.carbs), n(p.goals.fat), n(p.goals.steps),
        p.dates.length ? `${p.dates[0]}…${p.dates[p.dates.length - 1]}` : DASH,
      ))
    }
  }

  // ── DAYS ──────────────────────────────────────────────────────────────────
  // One line per day, present even when the day is empty: an omitted row lets a
  // gap read as a zero, which is the thing this document exists to prevent.
  // Every duration is MINUTES, every distance km, every volume litres — one
  // unit per dimension, so no cell needs a suffix to be read.
  const bodyByDate = new Map(bodyComp.map((b) => [b.date, b]))
  L.push('')
  L.push('## DAYS' + SEP + [
    'date', 'day', 'train', 'sleep_min', 'deep_min', 'rem_min', 'core_min', 'awake_min',
    'bed', 'wake', 'onset', 'hrv_ms', 'rhr', 'avg_hr', 'spo2_pct', 'resp_bpm',
    'wrist_temp_c', 'vo2max', 'daylight_min', 'exercise_min', 'stand_hours', 'stand_min',
    'steps', 'dist_km', 'training_min', 'active_kcal',
    'kcal', 'P', 'C', 'F', 'water_l',
    'supp', 'supp_log', 'supp_skipped',
    'weight_kg', 'fat_pct', 'smm_kg', 'bmr_kcal',
    'fatigue', 'doms', 'tags',
  ].join(SEP))
  for (const day of days) {
    const bc = bodyByDate.get(day.date)
    // Each subjective slot NAMED rather than positional: a rest day and a
    // training day ask different questions in the middle slots, and a bare
    // triple cannot say which pair of questions was answered.
    const fatigue = fatigueLabelsFor(day.isTrainingDay).map((slot) => {
      const hit = (input.fatigue ?? []).find((f) => f.date === day.date && f.slot === slot)
      return `${slot}:${hit ? String(hit.level) : DASH}`
    })
    // Soreness carries its cause where the log recorded one. Delayed onset is
    // the whole point of the measurement: a symptom with no session attached is
    // not a dose-response reading.
    const doms = input.doms.filter((x) => x.date === day.date).map((x) =>
      [x.muscle, String(x.severity), x.sourceLabel ?? '', x.sourceDate ?? '']
        .join(':').replace(/:+$/, ''))
    // Flags that change how a number on this line should be READ — never flags
    // that discount it. Every aggregate keeps the real figure: a cut that shows
    // a stall must still show the intake that caused it.
    const tags: string[] = []
    if (day.nutritionException) tags.push(`except:${day.nutritionException}`)
    if (day.nutritionEstimated) tags.push('estimated')
    if (day.targetProfile) tags.push(`profile:${day.targetProfile}`)
    if (day.weightKg == null) tags.push(`skip:${weighInSkipReason(day.weighInSkipReason)}`)
    if (day.trackCarbs === false) tags.push('untracked:C')
    if (day.trackFat === false) tags.push('untracked:F')
    L.push(fields(
      day.date, day.weekdayLabel, day.isTrainingDay ? '1' : '0',
      minutes(day.sleepMin), minutes(day.deepMin), minutes(day.remMin),
      minutes(day.coreMin), minutes(day.awakeMin),
      clock(day.bedTime), clock(day.wakeTime),
      day.sleepOnsetTrouble == null ? DASH : day.sleepOnsetTrouble ? '1' : '0',
      n(day.hrvMs, 1), n(day.restingHr), n(day.avgHr), n(day.bloodOxygenPct),
      // `signedC` appends "°C"; the column is already named `_c`, and a unit
      // inside a cell is the one thing this grammar promised not to do. The
      // SIGN stays — a deviation of +0.2 and one of −0.2 are opposite findings.
      n(day.respiratoryRate, 1), n(day.wristTempDeltaC, 1), n(day.vo2max, 1),
      minutes(day.daylightMin), minutes(day.exerciseMin),
      n(day.standHours), minutes(day.standMin),
      n(day.steps), kmOf(day.distanceM), minutes(day.trainingMin), n(day.activeKcal),
      n(day.calories), n(day.proteinG), n(day.carbsG), n(day.fatG), litresOf(day.waterMl),
      day.supplementsPlanned == null && day.supplementsTaken == null
        ? DASH : `${n(day.supplementsTaken)}/${n(day.supplementsPlanned)}`,
      items((day.supplementsLog ?? []).map((s) => `${s.key}@${s.time ?? DASH}`)),
      items(day.supplementsSkipped ?? []),
      n(day.weightKg, 1), n(bc?.bodyFatPct, 1), n(bc?.skeletalMuscleMassKg, 1), n(day.bmrKcal),
      items(fatigue), items(doms), items(tags),
    ))
  }

  // ── SESSIONS ──────────────────────────────────────────────────────────────
  // A session line, then one line per exercise indented two spaces, then one
  // per PR. That indent is what tells a reader — and a regex — which session an
  // exercise belongs to, and it is the only structure left in the document.
  if (sessions.length) {
    L.push('')
    L.push('## SESSIONS' + SEP + [
      'date', 'day', 'label', 'session_no', 'started', 'ended', 'duration_min',
      'avg_bpm', 'kcal', 'srpe', 'sets', 'failure_sets', 'tonnage_kg', 'prs', 'estimated',
    ].join(SEP))
    L.push('##   exercise' + SEP + ['name', 'rep_window', 'rest_target/plan_s', 'top_kg',
      'set…  — set = load×reps[t][@rpe][W|G|D|F][Q:key], `t` = the count is seconds,'
      + ' a unilateral pair is Lset|Rset'].join(SEP))
    L.push('##   PR' + SEP + ['name', 'load×reps', 'axes', 'volume_kg', 'e1rm_kg (Epley,'
      + ' weight × (1 + reps/30) — an ESTIMATE, not a lift that happened)'].join(SEP))
    for (const s of sessions) {
      L.push(fields(
        s.date, weekdayOf(s.date, days) || DASH, s.label,
        s.sessionNumber == null ? DASH : `#${s.sessionNumber}`,
        clock(s.startedAt), clock(s.endedAt), minutes(s.durationMin),
        n(s.avgBpm), n(s.caloriesBurned), s.sessionRpe == null ? DASH : String(s.sessionRpe),
        n(s.setCount), n(s.failureSets), exact(s.volumeKg), String(s.prs.length),
        items([s.caloriesEstimated ? 'kcal' : '', s.avgBpmEstimated ? 'bpm' : ''].filter(Boolean)),
      ))
      for (const ex of s.exercises) {
        const tokens = setTokens(ex)
        L.push('  ' + fields(
          ex.name,
          ex.repWindow ? `[${ex.repWindow}]` : DASH,
          ex.restTargetSec == null && ex.restPlanSec == null
            ? DASH : `${n(ex.restTargetSec)}/${n(ex.restPlanSec)}`,
          exact(ex.topKg),
          ...(tokens.length ? tokens : [DASH]),
        ))
      }
      for (const p of s.prs) {
        L.push('  ' + fields(
          'PR', p.name, `${exact(p.weightKg)}×${exact(p.reps)}`,
          items(p.axes.map((a) => prAxisLabel(a))),
          exact(p.volumeKg), exact(p.e1rmKg),
        ))
      }
    }
  }

  // ── CARDIO ────────────────────────────────────────────────────────────────
  // Pace is the one derived value the raw body is allowed: arithmetic over two
  // exported facts, and the unit a run is actually read in. `active_kcal` here
  // is ALREADY inside the day's own `active_kcal` and must not be added on top,
  // which is why `total_kcal` sits beside it rather than replacing it.
  if (cardio.length) {
    L.push('')
    L.push('## CARDIO' + SEP + ['date', 'day', 'kind', 'duration_min', 'dist_km',
      'pace_min_km', 'avg_hr', 'active_kcal', 'total_kcal', 'effort_cr10'].join(SEP))
    for (const c of cardio) {
      L.push(fields(
        c.date, weekdayOf(c.date, days) || DASH, cardioLabel(c.kind),
        n(c.durationMin, 1), kmOf(c.distanceM),
        formatPace(paceMinPerKm(c.distanceM, c.durationMin)),
        n(c.avgHr), n(c.kcal), n(c.totalKcal),
        c.effort == null ? DASH : String(c.effort),
      ))
    }
  }

  // ── BODY ──────────────────────────────────────────────────────────────────
  // Every compartment in ABSOLUTE kg beside its percentage. A percentage of a
  // falling bodyweight can rise while the tissue shrinks; kilograms cannot lie
  // that way, and a cut is exactly where that matters.
  if (bodyComp.length) {
    L.push('')
    L.push('## BODY' + SEP + ['date', 'weight_kg', 'bmi', 'fat_pct', 'muscle_pct',
      'water_pct', 'visceral', 'bmr_kcal', 'smm_kg', 'muscle_mass_kg', 'ffm_kg',
      'fat_mass_kg', 'protein_kg', 'protein_pct', 'bone_kg', 'water_kg', 'whr'].join(SEP))
    for (const b of bodyComp) {
      L.push(fields(
        b.date, n(b.weightKg, 1), n(b.bmi, 1), n(b.bodyFatPct, 1), n(b.musclePercent, 1),
        n(b.waterPercent, 1), n(b.visceralFat, 1), n(b.bmr), n(b.skeletalMuscleMassKg, 1),
        n(b.muscleMassKg, 1), n(b.fatFreeMassKg, 1), n(b.fatMassKg, 1), n(b.proteinMassKg, 1),
        n(b.proteinPercent, 1), n(b.boneMineralKg, 2), n(b.waterMassKg, 1),
        n(b.estimatedWaistToHipRatio, 2),
      ))
    }
  }

  // ── NUTRIENTS ─────────────────────────────────────────────────────────────
  // Food and stack kept APART on every key. "594 mg of vitamin C" means
  // something different when a tablet supplied 470 of it, and merging the two
  // is how a supplement gets read as a diet.
  const microDays = days.filter((d) =>
    Object.keys(d.nutrientsFood ?? {}).length || Object.keys(d.nutrientsStack ?? {}).length)
  if (microDays.length) {
    L.push('')
    L.push('## NUTRIENTS' + SEP + 'date' + SEP
      + 'key=food+stack, in NUTRIENT_TARGETS order, each in that target’s own unit;'
      + ' a key with no reading on either side is left off the line')
    for (const day of microDays) {
      L.push(fields(day.date, ...NUTRIENT_TARGETS.map((t) => {
        const food = day.nutrientsFood?.[t.key]
        const stack = day.nutrientsStack?.[t.key]
        if (food == null && stack == null) return null
        return `${t.key}=${exact(food ?? 0)}+${exact(stack ?? 0)}`
      }).filter((x): x is string => x != null)))
    }
    // The doubt, stated once and only when the week actually has one. A ⚠ that
    // appears every week is a caveat nobody reads. These are printed exactly as
    // stored: `nutrition_entries` keeps one aggregate row per day with no item
    // breakdown, so the duplicate is upstream, in the Health source. Treat a
    // flagged figure as unmeasured, not as a day that went badly.
    const flagged = flaggedNutrients(days)
    if (flagged.length) L.push(fields('##   implausible', items(flagged)))
  }

  // ── SUPPS ─────────────────────────────────────────────────────────────────
  // The protocol as `custom_supplements` holds it, never from a constant. What
  // was actually TAKEN rides on each day's line; this is only what was asked
  // for. One list, not a training column and a rest column — the differences
  // ride inside the row they belong to.
  const supps = supplementRows(input.supplementProtocol ?? [])
  if (supps.length) {
    L.push('')
    L.push('## SUPPS' + SEP + ['time', 'name', 'dose', 'training_dose', 'rest_dose',
      'training_only', 'notes'].join(SEP))
    for (const s of supps) {
      L.push(fields(s.time, s.name, s.dose, s.trainingDose, s.restDose,
        s.trainingOnly ? '1' : '0', s.notes))
    }
  }

  // ── WEEK ──────────────────────────────────────────────────────────────────
  // Sums and means over the rows already printed. Means SKIP missing days
  // rather than counting them as zero: three weigh-ins in a week average the
  // three, and treating the other four as 0 kg would report a 27 kg bodyweight.
  // The two totals are honest sums for the opposite reason — tonnage and cardio
  // minutes are work that either happened or did not, and a rest day is a zero.
  const totals = trendTotals(days, sessions, cardio)
  const summary = weeklySummary(input)
  const energy = energyBalance(days)
  const weights = days.map((d) => d.weightKg)
    .filter((v): v is number => v != null && Number.isFinite(v))
  L.push('')
  L.push('## WEEK' + SEP + ['tonnage_kg', 'working_sets', 'rated_sets', 'sessions',
    'kcal_avg', 'P_avg', 'C_avg', 'F_avg', 'water_l_avg', 'steps_avg', 'sleep_min_avg',
    'rhr_avg', 'hrv_avg', 'weight_avg_kg', 'weight_first_to_last_kg',
    'srpe_avg', 'srpe_rated_sessions', 'cardio_min', 'cardio_kcal'].join(SEP))
  L.push(fields(
    exact(totals.totalVolumeKg), String(summary.workingSets), String(summary.ratedSets),
    String(sessions.length),
    n(totals.avgKcal), n(meanOf(days.map((d) => d.proteinG))),
    n(meanOf(days.map((d) => d.carbsG))), n(meanOf(days.map((d) => d.fatG))),
    litresOf(totals.avgWaterMl), n(totals.avgSteps), minutes(summary.avgSleepMin),
    n(summary.avgRestingHr, 1), n(summary.avgHrvMs, 1), n(totals.avgWeightKg, 2),
    // Plain `n()`, with no leading `+` on a gain. Every other signed number in
    // this document — `balance_kcal`, `wrist_temp_c`, `strainZ` — comes out of
    // `n()`, which is `toFixed` and spells only the minus. A second convention
    // four columns away is one more thing a parser has to be told to tolerate,
    // for a character that says nothing the number did not. The `## LEDGER`
    // table keeps its typographic `−`: it is read by people, not split.
    weights.length > 1 ? n(weights[weights.length - 1] - weights[0], 2) : DASH,
    // How hard the week's workouts FELT, and across how many ratings — a mean
    // of 9.0 from one session out of five is not the week's character, and the
    // mean alone cannot say which it is.
    n(summary.avgSessionRpe, 2), String(summary.ratedSessions),
    n(totals.cardioMinutes, 1), n(summary.cardioActiveKcal),
  ))

  // Sets per muscle against the week's target, and the tonnage behind them. The
  // GRADED figure is direct + indirect; the split rides alongside so a reader
  // can see how much of a muscle's week was assistance work. A set credits 1.0
  // to each muscle a movement directly trains and 0.5 to each it assists —
  // assistance can lift a muscle out of under-target, and only direct work can
  // put one over. Unilateral work is scored ONCE at the weaker side,
  // min(weight) × min(reps), and the pair counts as one set.
  if (input.volumeByMuscle.length || input.tonnageByMuscle?.length) {
    const tonnage = new Map((input.tonnageByMuscle ?? []).map((t) => [t.muscle, t]))
    const muscles = [...new Set([
      ...input.volumeByMuscle.map((v) => v.muscle),
      ...(input.tonnageByMuscle ?? []).map((t) => t.muscle),
    ])]
    L.push('## WEEK.MUSCLE' + SEP + ['muscle', 'sets', 'target', 'direct', 'indirect',
      'tonnage_kg', 'direct_kg'].join(SEP))
    for (const muscle of muscles) {
      const v = input.volumeByMuscle.find((x) => x.muscle === muscle)
      const t = tonnage.get(muscle)
      L.push(fields(muscle, n(v?.sets, 1), n(v?.target, 1), n(v?.directSets, 1),
        n(v?.indirectSets, 1), exact(t?.volumeKg), exact(t?.directKg)))
    }
  }

  // ── LEDGER ────────────────────────────────────────────────────────────────
  // The one table in the document, and the one place a table is right: a
  // programme read downwards, oldest week at the top.
  if (input.ledger?.length) {
    L.push('')
    L.push('## LEDGER' + SEP + 'every week of the programme, oldest first')
    L.push(...trendLedger(input.ledger))
  }

  // ── DERIVED ───────────────────────────────────────────────────────────────
  // The fence. Everything above is a measurement; everything here is arithmetic
  // over those measurements, printed so it can be audited or ignored. Nothing
  // here reaches for data the document has not already shown, and a key with no
  // evidence prints `—` rather than a zero.
  const derived = derivedWeek(input)
  const bmrs = bmrCarry(days)
  const batteryByDate = new Map(derived.battery.map((b) => [b.date, b]))
  L.push('')
  L.push('## DERIVED' + SEP + 'computed by Onyx — not measured' + SEP + 'key'
    + SEP + 'then one value per day, in DAYS order')
  const keyRow = (key: string, value: (day: ExportDay, i: number) => string) =>
    L.push(fields(key, ...days.map(value)))
  keyRow('load', (d) => n(d.readiness?.load, 1))
  keyRow('acwr', (d) => n(batteryByDate.get(d.date)?.acwr ?? d.readiness?.acwr, 3))
  keyRow('strainZ', (d) => n(batteryByDate.get(d.date)?.strainZ ?? d.readiness?.strainZ, 2))
  keyRow('wellness', (d) => n(batteryByDate.get(d.date)?.wellness, 2))
  /* The stress index arrives with the E3 engine. Until then the key is present
     and every day answers `—`, which is this document's own word for "no
     reading". Dropping the row instead would let a reader conclude the app does
     not compute stress at all, which is a different and wrong claim. */
  keyRow('stress', () => DASH)
  // `tdeeKcal` and not a fourth hand-rolled `bmr + active + tef`: energy.ts is
  // the canonical arithmetic precisely so the Nexus, the dashboard and this
  // document cannot disagree, and it carries the all-or-nothing null rule that
  // keeps a missing active-energy sync from reading as a 400 kcal deficit.
  keyRow('tdee', (d, i) => n(tdeeKcal(bmrs[i], d.activeKcal, d.calories)))
  // ── DERIVED.WEEK ──────────────────────────────────────────────────────────
  // The energy balance, and it lives HERE rather than in `## WEEK`.
  //
  // It sat above the fence for one draft, which was exactly the mistake the
  // fence exists to prevent: intake is measured, active energy is a watch
  // estimate, BMR is carried across the days that have none and TEF is a
  // coefficient — three of those four are arithmetic, and the heading over
  // `## WEEK` says everything under it was measured. `energy_excluded` names
  // the days that did NOT enter the estimate, so its width is auditable rather
  // than something the reader has to reconstruct from the day lines.
  L.push('## DERIVED.WEEK' + SEP + ['balance_kcal', 'balance_kcal_day', 'tdee_avg',
    'bmr_avg', 'active_avg', 'tef_avg', 'bmr_carried', 'energy_days', 'energy_excluded'].join(SEP))
  L.push(fields(
    n(energy.balanceKcal), n(energy.avgBalanceKcal),
    energy.expenditureKcal == null
      ? DASH : n(energy.expenditureKcal / energy.daysCounted),
    n(energy.avgBmrKcal), n(energy.avgActiveKcal), n(energy.avgTefKcal),
    energy.bmrCarried ? '1' : '0',
    String(energy.daysCounted),
    items(days.filter((d) => !energy.countedDates.includes(d.date)).map((d) => d.date)),
  ))

  L.push(fields('##   how', `tdee = BMR (from the scale, carried across gaps) + Apple Watch`
    + ` active energy + intake × ${TEF_FACTOR}`,
    'load = session RPE × minutes',
    'acwr = EWMA 7:28 of load',
    'strainZ = z of Foster strain against your own rolling normal',
    'wellness = mean of the answered Hooper items, 0–1',
    'heart rate, calories and steps come off the Apple Watch and are estimates'))

  return L.join('\n')
}

/**
 * The stack, deduped and ordered — the shape BOTH renderers read.
 *
 * NOTHING ABOUT ANY PARTICULAR SUPPLEMENT IS KNOWN HERE. An earlier version
 * carried a verbatim multivitamin line and a `/citrulline|caffeine/i` regex, so
 * the export stated two doses and one schedule rule that existed nowhere but in
 * its own source. Every field below arrives from `custom_supplements`.
 *
 * Deduped by NAME so a row that somehow appears twice collapses instead of
 * printing two lines with no way to tell which applied when; ordered by the
 * scheduled time, which is the order the day happens in.
 */
export interface SupplementRow {
  time: string
  name: string
  dose: string
  trainingDose: string | null
  restDose: string | null
  trainingOnly: boolean
  notes: string | null
}

export function supplementRows(protocol: readonly ExportSupplement[]): SupplementRow[] {
  const byName = new Map<string, SupplementRow>()
  for (const s of protocol) {
    const name = s.name.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (byName.has(key)) continue
    byName.set(key, {
      time: s.time?.trim() || DASH,
      name,
      dose: s.dose.trim(),
      trainingDose: s.trainingDose?.trim() || null,
      restDose: s.restDose?.trim() || null,
      trainingOnly: s.trainingOnly === true,
      notes: s.notes?.trim() || null,
    })
  }
  return [...byName.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/**
 * Render the stack as one chronological list.
 *
 * NOTHING ABOUT ANY PARTICULAR SUPPLEMENT IS KNOWN HERE. This function used to
 * carry a verbatim multivitamin line and a `/citrulline|caffeine/i` regex, so
 * the export stated two doses and one schedule rule that existed nowhere but in
 * its own source: correcting L-Citrulline in the app changed the checklist and
 * left the export claiming 3 g, and a supplement added later got neither its
 * rule nor its condition because its name did not match the regex. Every field
 * below now arrives from `custom_supplements`.
 *
 * ONE list, not a training column and a rest column. The stack barely changes
 * with the schedule; printing it twice duplicated a dozen identical lines and
 * invited the reader to believe the whole protocol swaps over. The differences
 * ride INSIDE the line they belong to — a split dose, or a training-day-only
 * condition — which is both shorter and more precise than two headed lists.
 */
export function consolidateSupplements(protocol: readonly ExportSupplement[]): string[] {
  return supplementRows(protocol).map((s) => {
    // A dose that differs by day is stated as the rule it is, rather than
    // arbitrarily picking one of the two columns.
    const dose = s.trainingDose && s.restDose && s.trainingDose !== s.restDose
      ? `${s.trainingDose} on training days / ${s.restDose} on rest days`
      : s.dose
    const parts = [`${s.time} · ${s.name} — ${dose}`]
    if (s.trainingOnly) parts.push('(training days only)')
    if (s.notes) parts.push(`· ${s.notes}`)
    return parts.join(' ')
  })
}
