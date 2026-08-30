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
import { formatSet, isUnloadedSet } from '@/lib/utils/setFormat'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { rpeLabel } from '@/lib/training/effort'
import { weighInSkipReason } from '@/lib/body/weighIn'
import { exceptionTag, estimatedTag } from '@/lib/nutrition/exceptionDay'
import { contextRangesIn, contextRangeLabel, contextFromDayLabel, CONTEXT_META } from '@/lib/nutrition/context'
import { TEF_FACTOR, tefKcal, tdeeBreakdown } from '@/lib/nutrition/energy'
import { volumeZone, type VolumeZone } from '@/lib/training/landmarks'
import { MICRO_TARGETS } from '@/lib/nutrition/microTargets'
import { derivedWeek, type WeekDelta } from '@/lib/reports/derived'
import type { TargetPeriod } from '@/lib/nutrition/levers'

/** The export's wording for each zone. `na` never reaches here (target 0 → "—"). */
const ZONE_WORD: Record<VolumeZone, string> = {
  under: 'UNDER', building: 'building', optimal: 'on target', over: 'OVER', na: '—',
}

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
   * different when a tablet supplied 470 of it — the Micros page has always
   * drawn that line and the export now draws it too. Keys match
   * `MICRO_TARGETS[].key`, so the renderer needs no translation layer.
   */
  microsFood?: Record<string, number | undefined>
  microsStack?: Record<string, number | undefined>
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
   * Subjective fatigue, up to four readings a day.
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

/**
 * The weigh-in cell: the reading, or the stated reason there isn't one.
 *
 * "Skipped, and here is why" and "no data" are different facts. Saying so in
 * plain English keeps a protocol skip from being read as a missed measurement —
 * or, worse, as a plateau.
 *
 * The reason is read DYNAMICALLY from the day's stored value, never hardcoded
 * here: change a day to "Travel" in the Nexus and this line says Travel. An
 * unstated reason resolves to the protocol default rather than to "no reason
 * recorded", because skipping the scale before a bowel movement IS the protocol
 * and reporting it as a logging gap misreads a deliberate week as a sloppy one.
 */
const weighIn = (kg: number | null, skipReason: string | null): string => {
  if (kg != null && Number.isFinite(kg)) return `weight ${n(kg, 1)} kg`
  return `weight ${DASH} [Skip: ${weighInSkipReason(skipReason)}]`
}

/** `walk` → `Walk`, `run` → `Run`; anything else passes through capitalised. */
const cardioLabel = (kind: string): string =>
  kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Cardio'

/** `+70` / `−70` / `0`. A typographic minus, matching the rest of the document. */
const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

/** "Thu", from the day rows the export already carries. */
function weekdayOf(date: string, days: readonly ExportDay[]): string {
  return days.find((d) => d.date === date)?.weekdayLabel ?? ''
}

/**
 * "Sun 16, Mon 17, Tue 18 & Wed 19 Aug" — a run of dates, said the way a person
 * would say it.
 *
 * Weekday AND day number, because neither alone is enough: "Sun–Wed" cannot be
 * checked against the daily rows below, and "16–19" makes the reader count. The
 * month is stated once at the end unless the run crosses one, which a
 * Sunday-start week can do.
 */
function dayRangeLabel(dates: readonly string[], days: readonly ExportDay[]): string {
  if (!dates.length) return '—'
  const month = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const spans = new Set(dates.map(month)).size > 1
  const parts = dates.map((iso) => {
    const day = Number(iso.slice(8, 10))
    const wd = weekdayOf(iso, days)
    return `${wd} ${day}${spans ? ` ${month(iso)}` : ''}`.trim()
  })
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
  return spans ? joined : `${joined} ${month(dates[dates.length - 1])}`
}

/**
 * "7h 20m" — the spoken form, for the day's own vitals line.
 *
 * Distinct from `sleep` below, which packs the same minutes as "7h32" for the
 * weekly average and the trend table where the figure is one cell among many.
 * On a line already carrying five labelled readings the compact form reads as a
 * decimal, which 7h32 is not.
 */
const sleepLong = (min: number | null | undefined): string => {
  if (min == null || !Number.isFinite(min)) return DASH
  const h = Math.floor(min / 60)
  return `${h}h ${String(Math.round(min - h * 60)).padStart(2, '0')}m`
}

/**
 * A wrist-temperature DEVIATION, which is signed and usually near zero.
 * "+0.2°C" and "-0.2°C" are opposite findings; an unsigned "0.2" is neither.
 */
const signedC = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? DASH : `${v > 0 ? '+' : ''}${v.toFixed(1)}°C`

const sleep = (min: number | null | undefined): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

/**
 * The four fatigue slots, IN THE ORDER THE DAY HAPPENS, as the export names
 * them.
 *
 * ── WHY THE LABELS ARE REPEATED HERE ─────────────────────────────────────────
 * `SLOT_LABEL` lives in `useFatigue`, which is a client hook: importing it here
 * would drag React Query into a module whose entire contract is that it is pure
 * and deterministic. The labels are four short strings, so the copy is cheap —
 * and `fatigue-slots.test.ts` asserts the two lists stay identical, which is
 * what actually keeps them honest.
 *
 * The order matters more than it looks. A string sort gives "End of day,
 * Evening, Morning, Noon" — very nearly the reverse of the day it describes.
 */
export const FATIGUE_SLOT_LABELS = ['Morning', 'Noon', 'Evening', 'End of day'] as const

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

/** Whole days between two ISO dates. Null when either is missing. */
function daysBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * ONE MICRONUTRIENT, said in full: what was taken, out of what, from where.
 *
 * Every target in `MICRO_TARGETS` prints on every day, in the table's own
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
export function microLine(
  food: Record<string, number | undefined> | undefined,
  stack: Record<string, number | undefined> | undefined,
): string {
  const parts = MICRO_TARGETS.map((t) => {
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
    const flag = implausibleMicro(t, hasF ? f : 0, hasK ? k : 0) ? '⚠ ' : ''
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

function implausibleMicro(t: { kind?: string; target: number }, food: number, stack: number): boolean {
  if (t.kind === 'ceiling') return false
  if (stack > 0) return false
  return t.target > 0 && food > t.target * IMPLAUSIBLE_FLOOR_MULTIPLE
}

/** Every "<Micro> on <date>" the week flagged, for the note at the foot. */
export function flaggedMicros(days: readonly ExportDay[]): string[] {
  const out: string[] = []
  for (const d of days) {
    for (const t of MICRO_TARGETS) {
      const f = d.microsFood?.[t.key], k = d.microsStack?.[t.key]
      const food = typeof f === 'number' && f > 0 ? f : 0
      const stack = typeof k === 'number' && k > 0 ? k : 0
      if (implausibleMicro(t, food, stack)) out.push(`${t.label} ${exact(food)} ${t.unit} on ${d.date}`)
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
      for (const s of input.sessions) for (const ex of s.exercises) for (const set of ex.sets) {
        // A ghost is not an unrated working set — it is a set that did not
        // happen, and counting it here would drag the RPE-coverage figure down
        // for doing exactly what a maintenance week asks.
        if (set.warmup || set.ghost) continue
        workingSets += 1
        if (set.rpe != null && Number.isFinite(set.rpe)) ratedSets += 1
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
  const filled = [...measured]
  for (let i = 1; i < filled.length; i++) filled[i] ??= filled[i - 1]
  for (let i = filled.length - 2; i >= 0; i--) filled[i] ??= filled[i + 1]

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

export function buildWeeklyExport(input: WeeklyExportInput): string {
  const { days, sessions, volumeByMuscle, doms } = input

  const L: string[] = []

  // Pure data — no instruction/prompt header. Starts straight at the week.
  L.push(`# WEEK ${input.weekStart} → ${input.weekEnd}${input.weekLabel ? ` · ${input.weekLabel}` : ''}`)
  L.push('')
  L.push(`**Program:** ${input.programLabel}`)
  // The phase is the frame every target in this document sits inside — the same
  // 1,955 kcal is an aggressive cut or a light surplus depending on it — and it
  // was nowhere in the payload.
  if (input.phaseLabel?.trim()) L.push(`**Phase:** ${input.phaseLabel.trim()}`)

  // ── The week's CONTEXT, once, as a fact about the week ──
  // Derived from the days themselves rather than from the current setting, so an
  // export of a past week describes that week and not how you feel today. The
  // per-day `[Exception: …]` tags still print; what this removes is the reader
  // having to infer "he was ill from Tuesday" four times from four annotations.
  const ranges = contextRangesIn(days.map((d) => ({ date: d.date, exception: d.nutritionException })))
  for (const r of ranges) L.push(`**Context:** ${contextRangeLabel(r)}`)

  L.push('')

  // ── WHAT WAS ACTUALLY ASKED FOR, AND WHEN ──
  //
  // This was one line: `**Targets:** 1955 kcal · 170 g protein · …`, read off
  // the CURRENT `user_goals` row with no lever applied. Two things were wrong
  // with it, and they compound.
  //
  // A lever changes all four numbers at once, so a week in which one was pulled
  // or released had two sets of targets and the line printed whichever happened
  // to be current — attributing Thursday's numbers to Sunday. And it named no
  // rung at all, so a reader seeing intake 70 kcal under target had no way to
  // know whether that was drift or the plan.
  //
  // `targetPeriods` resolves the rung PER DAY and glues equal neighbours
  // together (see `leverPeriods`), so the section states each instruction, its
  // numbers, and exactly which days it governed.
  L.push('## Targets & Levers')
  L.push('')
  const periods = input.targetPeriods ?? []
  if (periods.length) {
    periods.forEach((p, i) => {
      const g = p.goals
      L.push(`- **${p.label}** — ${n(g.calorie)} kcal · `
        + `${n(g.protein)}P / ${n(g.carbs)}C / ${n(g.fat)}F · ${n(g.steps)} steps`)
      // SPELLED OUT AS A SENTENCE, not a date range in brackets. A reader
      // scanning for "when was Lever 1 on?" needs a clause they can lift whole;
      // "Sun 16, Mon 17 & Tue 18 Aug" answers the question only after they work
      // out that the list is exhaustive rather than a sample.
      L.push(`    - **${p.label} was active on ${dayRangeLabel(p.dates, days)}**`
        + ` — ${p.dates.length} day${p.dates.length === 1 ? '' : 's'}.`)
      // The CHANGE is the interesting fact — a reader scanning the daily rows
      // needs to know the target moved under them, and on which morning.
      if (i > 0) {
        const prev = periods[i - 1]
        L.push(`    - Changed from **${prev.label}** on ${weekdayOf(p.dates[0], days)} ${p.dates[0]}`
          + ` (${signed(g.calorie - prev.goals.calorie)} kcal, ${signed((g.steps ?? 0) - (prev.goals.steps ?? 0))} steps)`)
      }
    })
    if (periods.length === 1) {
      L.push('- Unchanged all week.')
    }
  } else {
    // No resolved periods supplied — the headline goals are all there is.
    L.push(`- **Targets:** ${n(input.calorieGoal)} kcal · ${n(input.proteinGoalG)} g protein · `
      + `${n(input.stepsGoal)} steps`)
  }
  // The two targets no rung governs. They belong in the instruction all the
  // same: a week's adherence cannot be read against goals the document omits.
  L.push(`- Sleep target: ${n(input.sleepGoalHours, 1)} h`
    + `${periods.length > 1 ? ' — unchanged all week' : ''}`)
  if (input.waterGoalMl != null) {
    L.push(`- Water target: ${n(input.waterGoalMl / 1000, 1)} L`
      + `${periods.length > 1 ? ' — unchanged all week' : ''}`)
  }
  L.push('')

  // Session labels per date — for the readable daily log below.
  const labelsByDate = new Map<string, string[]>()
  for (const s of sessions) {
    const arr = labelsByDate.get(s.date) ?? []
    arr.push(s.label)
    labelsByDate.set(s.date, arr)
  }

  // The day's own sessions, so the day block can carry them.
  const sessionsByDate = new Map<string, ExportSession[]>()
  for (const s of sessions) {
    const arr = sessionsByDate.get(s.date) ?? []
    arr.push(s)
    sessionsByDate.set(s.date, arr)
  }

  // Full body-composition reading per weigh-in date (nested under its day below).
  const bodyByDate = new Map<string, ExportBodyComp>()
  for (const b of input.bodyComp ?? []) bodyByDate.set(b.date, b)

  // Walks / runs per date (nested under their day, flagged as already counted).
  const cardioByDate = new Map<string, ExportCardio[]>()
  for (const c of input.cardio ?? []) {
    const arr = cardioByDate.get(c.date) ?? []
    arr.push(c)
    cardioByDate.set(c.date, arr)
  }

  // ── Weekly summary ──
  // Sits ABOVE the daily log on purpose: it is the orientation, and the seven
  // rows underneath are the evidence. Everything here is a mean, a total or a
  // max the reader would otherwise compute by hand.
  {
    const w = weeklySummary(input)
    const dLabel = ['none', 'mild', 'moderate', 'severe']
    L.push('## Weekly summary')
    L.push('')
    L.push(`- Sleep (avg): ${sleep(w.avgSleepMin)}`)
    L.push(`- Resting HR (avg): ${n(w.avgRestingHr, 1)}${w.avgRestingHr != null ? ' bpm' : ''}`)
    L.push(`- HRV (avg): ${n(w.avgHrvMs, 1)}${w.avgHrvMs != null ? ' ms' : ''}`)
    L.push(`- Cardio: ${n(w.cardioMinutes)} min across ${w.cardioSessions} session${w.cardioSessions === 1 ? '' : 's'}`
      + ` · ${n(w.cardioActiveKcal)} active kcal`)
    // Borg CR10, averaged over the sessions that were RATED — the count is
    // stated so one 9/10 out of five sessions can't read as the week's tone.
    L.push(`- Average workout effort: ${w.avgSessionRpe != null
      ? `${n(w.avgSessionRpe, 1)}/10 CR10 across ${w.ratedSessions} rated session${w.ratedSessions === 1 ? '' : 's'}`
      : 'not rated'}`)
    // Coverage, so the average above can be read for what it is worth. Stated
    // even at zero — "0 of 96 rated" is a fact about the log, and silence here
    // would let an unrated week look like a week with nothing to say.
    L.push(`- Per-set effort coverage: ${w.ratedSets} of ${w.workingSets} working set${w.workingSets === 1 ? '' : 's'} rated`)
    L.push(`- Highest DOMS: ${w.peakDoms
      ? `${w.peakDoms.muscle} — ${dLabel[w.peakDoms.severity] ?? w.peakDoms.severity} (${w.peakDoms.date})`
      : 'none reported'}`)
    L.push('')
  }

  /* ── THE DAY IS THE UNIT (restructured 2026-08-22) ──────────────────────────
     `## Days` and `## Sessions` used to be two sections forty lines apart, so
     reading what happened on Monday meant reading Monday's row here and then
     hunting for Monday's session further down. They are one thing: a session
     happens ON a day, against that day's sleep, that day's food and that day's
     weigh-in, and every question worth asking of this document crosses that
     boundary.

     So the day owns everything that happened inside it — vitals, the scale, the
     session with all its sets, and the walk — and the sections below are only
     what genuinely spans the week. */
  L.push('## Days')
  L.push('')
  for (const d of days) {
    // WHAT WAS DONE OUTRANKS WHAT WAS PLANNED. A logged session makes the day a
    // training day whatever the template says, because a swap moves a workout
    // onto a day the static plan calls rest — and calling that day "Rest · Legs
    // & Core B" is the same misattribution that put a Wednesday Delts & Arms
    // session into the Upper A curve. `isTrainingDay` only decides the label
    // when nothing was logged, where the plan is the only evidence there is.
    const performed = labelsByDate.get(d.date)
    const offPlan = performed != null && !d.isTrainingDay
    const workout = performed?.join(' + ') ?? (d.isTrainingDay ? 'not logged' : null)
    const macros = [d.proteinG, d.carbsG, d.fatG].some((v) => v != null)
      ? ` (${n(d.proteinG)}P / ${n(d.carbsG)}C / ${n(d.fatG)}F)` : ''

    L.push(
      // "Workout", not "Train" — the app calls this thing a workout on the tab,
      // the tile, the session and the deck, and the export was the last surface
      // still using a different word for it.
      `- **${d.weekdayLabel} ${d.date}** · ${performed || d.isTrainingDay ? 'Workout' : 'Rest'}`
      + `${offPlan ? ' (off-plan / swapped)' : ''}${workout ? ` · ${workout}` : ''}`,
    )

    // ── Sleep & vitals ──
    // EVERY field named every time, `—` where there is no reading. Wrist
    // temperature and blood oxygen appear here for the first time: the column
    // and the query for the second both already existed and the value was
    // simply never assigned to anything.
    // The five original readings keep their exact wording and position; the four
    // that follow are APPENDED, so a reader (or a parser) built against the old
    // line still finds every field it knew where it left it. Avg HR is the
    // DAYTIME average and sits beside Resting HR deliberately — the pair is the
    // reading, and either one alone has been mistaken for the other.
    L.push(`    - Sleep & Vitals: Sleep: ${sleepLong(d.sleepMin)} · HRV: ${n(d.hrvMs)} ms`
      + ` · Resting HR: ${n(d.restingHr)} bpm`
      + ` · Wrist Temp: ${signedC(d.wristTempDeltaC)}`
      + ` · Blood O2: ${d.bloodOxygenPct != null ? `${n(d.bloodOxygenPct)}%` : DASH}`
      + ` · Avg HR (daytime): ${d.avgHr != null ? `${n(d.avgHr)} bpm` : DASH}`
      + ` · Respiratory Rate: ${d.respiratoryRate != null ? `${n(d.respiratoryRate, 1)} br/min` : DASH}`
      + ` · VO2 Max: ${d.vo2max != null ? `${n(d.vo2max, 1)} ml/kg/min` : DASH}`)

    /* ── SLEEP ARCHITECTURE ────────────────────────────────────────────────────
       Its own line rather than more fields on the one above, because it is a
       different measurement: that line says how the body was, this one says how
       the night was built. Deep, REM and core sum to the duration printed above
       minus time awake, so the reader can check it — and the bed and wake clock
       times are here because WHEN a night happened is a separate fact from how
       long it lasted, and the only one that shows a drifting schedule. */
    L.push(`    - Sleep Stages: Deep: ${sleepLong(d.deepMin)} · REM: ${sleepLong(d.remMin)}`
      + ` · Core: ${sleepLong(d.coreMin)} · Awake: ${sleepLong(d.awakeMin)}`
      + ` · Bed: ${clock(d.bedTime)} · Wake: ${clock(d.wakeTime)}`)

    // The exception tag sits ON the intake it explains, not at the end of the
    // block — a reader meeting "3210 kcal" needs the reason in the same breath.
    L.push(
      `    - Macros: ${n(d.calories)} kcal${macros}`
      + `${exceptionTag(d.nutritionException)}${estimatedTag(d.nutritionEstimated)}`
      + ` · water ${n(d.waterMl == null ? null : d.waterMl / 1000, 1)} L`,
    )

    /* ── MICROS, UNDER THE MACROS THEY BELONG TO ───────────────────────────────
       Every target, every day, in the table's own order — including the ones
       that were never measured, which print `—/target` rather than vanishing.
       A nutrient that only appears on the days it was logged teaches the reader
       that it is not tracked, which is the opposite of true. */
    L.push(`    - Micros: ${microLine(d.microsFood, d.microsStack)}`)
    // Steps, distance and training minutes keep their original conditional
    // form; the three ring metrics are appended and ALWAYS named, because a
    // dropped field and a zero-minute stand day are not the same day.
    L.push(`    - Activity: ${n(d.steps)} steps`
      + `${d.distanceM != null ? ` · ${n(d.distanceM / 1000, 2)} km` : ''}`
      + `${d.trainingMin != null ? ` · ${n(d.trainingMin)} min training` : ''}`
      + ` · Exercise: ${d.exerciseMin != null ? `${n(d.exerciseMin)} min` : DASH}`
      + ` · Stand: ${d.standHours != null ? `${n(d.standHours)} h` : DASH}`
      + `${d.standMin != null ? ` (${n(d.standMin)} min)` : ''}`
      + ` · Daylight: ${d.daylightMin != null ? `${n(d.daylightMin)} min` : DASH}`)

    /* ── WHAT WAS ACTUALLY SWALLOWED ───────────────────────────────────────────
       The protocol section at the foot of this document is a PRESCRIPTION. This
       is compliance, and the two are routinely different — 9 of 9 on Thursday
       and 4 of 9 on Wednesday is the single most likely explanation for a week
       that otherwise looks identical to the one before it.

       The times are the SCHEDULED slots. They used to be the ticks themselves
       (`supplement_log.taken_at`), on the reasoning that a pre-workout taken at
       19:00 was not taken pre-workout — true, and unsupported by the column,
       which was written by the auto-log pass with the slot's own time as often
       as by a tap. A stamp that means two things is worse than one that means
       one, and the schedule is the half that is always true.

       And a MISS is now explicit. Absence of a row used to read as a skip, so a
       night the app was never opened after 22:00 reported three doses missed
       that were swallowed on time — eight days in August 2026 alone. Only a
       deliberate skip writes anything now, and only that reaches this line. */
    {
      const log = d.supplementsLog ?? []
      const taken = d.supplementsTaken ?? (log.length || null)
      const planned = d.supplementsPlanned
      const count = `${taken != null ? n(taken) : DASH} of ${planned != null ? n(planned) : DASH} taken`
      // Grouped by the time they are DUE, because that is how they are actually
      // swallowed: citrulline and caffeine are both 11:45 items because they are
      // one act, and listing them separately described two trips to the cupboard
      // that never happened.
      const byTime = new Map<string, string[]>()
      for (const i of log) {
        const t = i.time ?? '—'
        const bucket = byTime.get(t) ?? []
        bucket.push(i.key)
        byTime.set(t, bucket)
      }
      const items = byTime.size
        ? ` · ${[...byTime.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([t, keys]) => `${t} ${keys.join(', ')}`).join(' · ')}`
        : ''
      const skipped = d.supplementsSkipped?.length
        ? ` · SKIPPED: ${d.supplementsSkipped.join(', ')}`
        : ''
      L.push(`    - Supplements: ${count}${items}${skipped}`)
    }

    // ── The scale ──
    // NO WEIGHT, NO READING. A scale reading is anchored on a bodyweight —
    // every mass below is derived from one — so a row that has lost its weight
    // is not a partial measurement, it is a fragment. 2026-08-02 carries a
    // skeletal-muscle figure and a waist:hip ratio and nothing else, which
    // printed two lines of twenty em-dashes: visually a catastrophic weigh-in,
    // actually a sync that dropped the weight.
    const b = bodyByDate.get(d.date)
    if (b && b.weightKg != null && Number.isFinite(b.weightKg)) {
      /* ── ONE LINE, EVERY COMPARTMENT, IN THE SCALE'S OWN ORDER ──
         Percentage then mass, pair by pair, so a reader comparing weeks never
         has to multiply by a bodyweight that is itself moving.

         "Muscle Mass" carries its gloss because THREE different numbers on this
         line could answer to that name and they are ~23 kg apart: skeletal
         muscle (~27 kg, entered from the scale), lean soft tissue (~50 kg,
         weight × muscle%) and fat-free mass (~53 kg, weight − fat, which
         includes bone and water). Naming one of them "Muscle Mass" unqualified
         is how a report ends up contradicting itself. */
      L.push(
        `    - Weight Data: Weight: ${n(b.weightKg, 1)} kg · BMI: ${n(b.bmi, 1)}`
        + ` · Body Fat Percentage: ${n(b.bodyFatPct, 1)}% · Fat Mass: ${n(b.fatMassKg, 1)} kg`
        + ` · Muscle Percentage: ${n(b.musclePercent, 1)}%`
        + ` · Muscle Mass (Lean Soft Tissue): ${n(b.muscleMassKg, 1)} kg`
        + ` · Water Percentage: ${n(b.waterPercent, 1)}% · Body Water Mass: ${n(b.waterMassKg, 1)} kg`
        + ` · Protein Percentage: ${n(b.proteinPercent, 1)}% · Protein Mass: ${n(b.proteinMassKg, 1)} kg`
        + ` · Bone Mineral Percentage: ${n(b.boneMineral, 1)}%`
        + ` · Bone Mineral Content: ${n(b.boneMineralKg, 2)} kg`
        + ` · Skeletal Muscle Mass: ${n(b.skeletalMuscleMassKg, 1)} kg`
        + ` · Visceral Fat Rating: ${n(b.visceralFat)}`
        + ` · Basal Metabolic Rate: ${n(b.bmr)}`
        + ` · Estimated Waist to Hip Ratio: ${n(b.estimatedWaistToHipRatio, 2)}`
        + ` · Fat-free body weight: ${n(b.fatFreeMassKg, 1)} kg.`,
      )
    } else {
      // A day with no full reading still says what happened to the weigh-in —
      // "skipped, as planned" and "never opened the app" are different facts.
      L.push(`    - Weight Data: ${weighIn(d.weightKg, d.weighInSkipReason)}`)
    }

    // ── The session(s), inside the day ──
    for (const s of sessionsByDate.get(d.date) ?? []) {
      L.push('')
      L.push(`    - **Session${s.sessionNumber != null ? ` #${s.sessionNumber}` : ''}: ${s.label}**`)
      // Volume · sets · failures · time · kcal · avg HR · PRs · effort, in one
      // labelled run. Every segment is printed even when empty: a missing one is
      // indistinguishable from a session logged at zero.
      // Clock times lead: they are the fact the duration cannot carry.
      const window = s.startedAt
        ? `Started: ${clock(s.startedAt)}${s.endedAt ? ` · Ended: ${clock(s.endedAt)}` : ''} · `
        : ''
      L.push(`        - Session Metadata: ${window}Duration: ${n(s.durationMin)} Minutes`
        + ` · Volume: ${exact(s.volumeKg)} kg`
        + ` · Sets: ${n(s.setCount)}${s.failureSets ? ` (${n(s.failureSets)} to failure)` : ''}`
        + ` · Calories: ${n(s.caloriesBurned)} kcal${s.caloriesEstimated ? ' [Estimated]' : ''}`
        + ` · Avg HR: ${s.avgBpm != null ? `${n(s.avgBpm)}${s.avgBpmEstimated ? ' [Estimated]' : ''}` : DASH}`
        + ` · PRs: ${s.prs.length}`
        + ` · Effort: ${s.sessionRpe != null ? `${n(s.sessionRpe, 1)}/10 CR10` : 'Not reported'}`)
      for (const e of s.exercises) {
        // Rest is stated only when it was CHANGED from the plan. The plan's
        // own figure is already in the program the reader has; repeating it on
        // every exercise would be noise on the busiest lines in the document,
        // and the interesting fact is the adjustment.
        const restNote = e.restTargetSec != null && e.restPlanSec != null && e.restTargetSec !== e.restPlanSec
          ? ` · rest ${e.restTargetSec}s (adjusted from ${e.restPlanSec}s)`
          : ''
        L.push(`        - **${e.name}**${e.repWindow ? ` _(target ${e.repWindow})_` : ''}${restNote}:`)
        // One set per line. The old single-line form packed a whole exercise
        // into a bespoke notation (`60kg × 12,11,10`, `11@8.5`) a reader had to
        // decode before they could read it.
        for (const line of setDetail(e.sets, e.name)) L.push(`            - ${line}`)
      }
      if (s.prs.length) {
        L.push('        - PRs:')
        // A record set under a declared context is STILL A RECORD — PR detection
        // deliberately ignores every gating flag, and suppressing one here would
        // repeat that mistake downstream. It is tagged, because "he hit a 1RM on
        // day three of the flu" is the most interesting fact on the page and
        // reads as an ordinary Tuesday without the tag.
        const dayContext = contextFromDayLabel(d.nutritionException)
        const tag = dayContext === 'normal' ? '' : ` _(under ${CONTEXT_META[dayContext].label})_`
        for (const p of s.prs) {
          const timed = isTimedExercise(p.name)
          /* ── THE AXIS IS THE LABEL OF ITS OWN VALUE ──
             Naming the axes and then listing the numbers separately printed
             each record twice — "— Volume, 1RM — Volume: 440, 1RM: 54.67 kg".
             The axis names ARE the labels, so where an axis has a number it
             carries it, and where it does not (a Weight or Reps record, whose
             value is the lift already printed to the left) it stands alone. */
          const axes = p.axes.map((a) => {
            const label = prAxisLabel(a, timed)
            if (a === 'volume' && p.volumeKg != null) return `${label}: ${exact(p.volumeKg)} kg`
            if (a === 'e1rm' && p.e1rmKg != null) return `${label}: ${n(p.e1rmKg, 2)} kg`
            return label
          })
          L.push(`            - **${p.name}** ${formatSet(p.weightKg, p.reps, { timed })}`
            + `${axes.length ? ` — ${axes.join(', ')}` : ''}${tag}`)
        }
      }
    }

    // ── The walk ──
    for (const c of cardioByDate.get(d.date) ?? []) {
      // EVERY metric is named, EVERY time. This used to drop absent fields,
      // which reads fine until you compare two walks: one showing "avg HR 112"
      // and one not, with no way to tell whether the second had no heart-rate
      // reading or the exporter simply didn't carry it. An em-dash says "not
      // recorded" — which is information — while a 0 would be a lie.
      const pace = paceMinPerKm(c.distanceM, c.durationMin)
      const bits = [
        `time ${c.durationMin != null ? `${n(c.durationMin)} min` : DASH}`,
        `distance ${c.distanceM != null ? `${n(c.distanceM / 1000, 2)} km` : DASH}`,
        `pace ${pace != null ? formatPace(pace) : DASH}`,
        `active ${c.kcal != null ? `${n(c.kcal)} kcal` : DASH}`,
        `total ${c.totalKcal != null ? `${n(c.totalKcal)} kcal` : DASH}`,
        `avg HR ${c.avgHr != null ? n(c.avgHr) : DASH}`,
        `effort ${c.effort != null ? `${n(c.effort, 1)}/10` : DASH}`,
      ].join(' · ')
      L.push('')
      // The warning is OUT of its parentheses and emphasised. Parenthesised, it
      // read as a footnote about provenance; it is in fact an instruction not to
      // add these calories and steps to the day's totals, which a reader
      // summing the document will otherwise do.
      L.push(`    - Cardio: ${cardioLabel(c.kind)} · ${bits}`
        + ' **(Already accounted for in daily steps and calories — do NOT add to the day.)**')
    }
    L.push('')
  }

  /* ── SETS PER MUSCLE VS TARGET ──────────────────────────────────────────────
     Vertical, one muscle per line: this is a list of sixteen comparisons and it
     was being read as prose. The tonnage half moved to the aggregates block at
     the foot of the document — sets are the DOSE the programme prescribes and
     belong beside the week's training; kilograms are an aggregate. */
  L.push('## Sets Targets')
  L.push('')
  for (const m of volumeByMuscle) {
    // ONE grading rule, shared with the app (see landmarks.volumeZone): only the
    // TOTAL can clear an UNDER, only the DIRECT work can earn an OVER. Rendering
    // its own comparison here is how the export and the Command Center start
    // disagreeing about the same week.
    const status = m.target <= 0 ? '—'
      : ZONE_WORD[volumeZone(m.sets, m.target, m.directSets ?? m.sets)]
    const split = m.indirectSets != null && m.indirectSets > 0 && m.directSets != null
      ? ` (${m.directSets} direct + ${m.indirectSets} indirect)`
      : ''
    L.push(`- ${m.muscle}: ${m.sets}/${m.target}${split} — ${status}`)
  }
  L.push('')
  L.push('_A set credits 1.0 to each muscle a movement directly trains and 0.5 to'
    + ' each it assists. Half sets are real and are not rounded away. Targets are'
    + ' DIRECT-set landmarks, so the verdict is asymmetric on purpose: assistance'
    + ' can lift a muscle out of UNDER, but only direct work can put one OVER._')
  L.push('')

  /* ── SORENESS ───────────────────────────────────────────────────────────────
     ONE LINE PER DAY, every day of the week, formatted like the Fatigue block
     below it — which is what these two sections should always have had in
     common, being the same kind of reading taken on the same schedule.

     What it replaces was one line per (date, muscle) and nothing at all for a
     day with no rows. Both halves of that were wrong. A reader scanning for
     Wednesday found no Wednesday and could not tell whether the day was
     pain-free or simply never opened, and a week where four muscles were rated
     on one day out-lined a week where one muscle was rated on four.

     Muscles that were never rated are NOT padded in with em-dashes: the app
     asks about the muscles a session trained, so silence on the other twelve is
     the protocol rather than a gap. A day with no ratings at all says so in
     words, once. */
  {
    const label = ['none', 'mild', 'moderate', 'severe']
    L.push('## DOMS (soreness, 0–3)')
    L.push('')
    const byDate = new Map<string, ExportDoms[]>()
    for (const r of doms) {
      const bucket = byDate.get(r.date) ?? []
      bucket.push(r)
      byDate.set(r.date, bucket)
    }
    for (const day of days) {
      const rows = byDate.get(day.date) ?? []
      if (!rows.length) {
        L.push(`- ${day.weekdayLabel} ${day.date}: not logged`)
        continue
      }
      const parts = rows.map((r) => {
        const sev = `${r.muscle}: ${r.severity} (${label[r.severity] ?? r.severity})`
        // The ATTRIBUTION, where the row carries one. Delayed onset is the
        // entire content of the measurement: soreness two days after a session
        // and soreness the morning after it are different readings of different
        // things, and neither is legible without the session named.
        if (!r.sourceLabel) return sev
        const out = daysBetween(r.sourceDate, r.date)
        // Weekday AND date, the way every other date in this document is
        // stamped. A bare "Fri" is ambiguous across a fortnight, and a bare ISO
        // date makes the reader count — and the source session is very often
        // OUTSIDE this week, where the weekday is not even resolvable.
        const wd = r.sourceDate ? weekdayOf(r.sourceDate, days) : ''
        const when = r.sourceDate
          ? `, ${wd ? `${wd} ${r.sourceDate}` : r.sourceDate}${out != null
              ? ` (${out} day${out === 1 ? '' : 's'} out)` : ''}`
          : ''
        return `${sev} — from ${r.sourceLabel}${when}`
      })
      L.push(`- ${day.weekdayLabel} ${day.date}: ${parts.join(' · ')}`)
    }
    L.push('')
  }

  // ── Fatigue ──
  // Grouped by DAY rather than one line per reading: four rows per day would
  // make this the longest section in the document to carry the least, and the
  // shape of a day — where it started and where it ended — is the whole reading.
  const fatigue = input.fatigue ?? []
  {
    L.push('## Fatigue (self-reported, not scored)')
    L.push('')
    const byDate = new Map<string, Map<string, ExportFatigue>>()
    for (const f of fatigue) {
      const bucket = byDate.get(f.date) ?? new Map<string, ExportFatigue>()
      bucket.set(f.slot, f)
      byDate.set(f.date, bucket)
    }
    /* ── SEVEN DAYS, FOUR SLOTS, NO EXCEPTIONS ────────────────────────────────
       This block used to print only the readings that existed, on only the days
       that had one, which quietly broke the rule the whole document is built
       on: a gap must be VISIBLE. A week holding five readings printed two lines,
       and a Saturday rated once in the morning printed a single cheerful
       "Morning fresh" that read as the whole day.

       Now the grid is complete and the em-dashes do the work they do everywhere
       else here — "not asked" is a fact about the week, and on a self-reported
       measure it is very nearly the most important one, because the days a
       person stops logging fatigue are rarely the easy days. */
    for (const day of days) {
      const rows = byDate.get(day.date)
      const parts = FATIGUE_SLOT_LABELS.map((slot) => {
        const r = rows?.get(slot)
        return `${slot} ${r ? r.label.toLowerCase() : DASH}`
      })
      L.push(`- ${day.weekdayLabel} ${day.date}: ${parts.join(' · ')}`)
    }
    L.push('')
    L.push('_Four slots a day, every day. `—` means the question was not answered,'
      + ' which is a fact about the week and not a neutral reading._')
    L.push('')
  }

  // ── Supplements protocol (ONE list) ──
  const protocol = input.supplementProtocol
  if (protocol?.length) {
    L.push('## Supplements protocol')
    L.push('')
    for (const s of consolidateSupplements(protocol)) L.push(`- ${s}`)
    L.push('')
  }

  // ── The cumulative ledger ──
  // The raw week comes first and the trajectory follows it: a reader who starts
  // with the trend anchors on it and reads the evidence to confirm.
  if (input.ledger?.length) {
    const label = input.weekLabel?.trim()
    L.push(`## Week-over-Week Trends (${input.programLabel}${label ? ` · ${label}` : ''})`)
    L.push('')
    L.push(...trendLedger(input.ledger))
    L.push('')
    L.push('_Every week of the programme, oldest first. Averages skip days with no'
      + ' entry rather than counting them as zero; volume and cardio are totals, so'
      + ' a short week is genuinely a smaller number. Δ is the change in average'
      + ' bodyweight from the row above, and the arrow shows direction only —'
      + ' whether a move is progress depends on the phase._')
    L.push('')
  }

  /* ── WEEKLY AGGREGATES ──────────────────────────────────────────────────────
     Everything that is a sum, a mean or a shape across the seven days, gathered
     under one heading instead of scattered across three.

     These sit AFTER the daily log on purpose. Every number here is derived from
     rows already printed above, and a reader who meets the totals first anchors
     on them and reads the evidence to confirm rather than to check. The one
     exception is the Weekly summary at the top, which is orientation — the means
     a reader needs before they can tell whether a given Tuesday was unusual. */
  L.push('## Weekly aggregates')
  L.push('')

  // ── Total volume, and where it landed ──
  {
    const tonnage = input.tonnageByMuscle ?? []
    const totalVolume = sum(sessions.map((s) => s.volumeKg))
    if (totalVolume != null) {
      L.push('### Total volume')
      L.push('')
      L.push(`- **Total volume:** ${exact(totalVolume)} kg across ${sessions.length}`
        + ` session${sessions.length === 1 ? '' : 's'}`)
      L.push('')
      if (tonnage.length) {
        L.push('### Volume by muscle group (kg)')
        L.push('')
        for (const t of tonnage) {
          const assisted = t.directKg != null && t.directKg < t.volumeKg
            ? ` (${exact(t.directKg)} direct)`
            : ''
          L.push(`- ${t.muscle}: ${exact(t.volumeKg)} kg${assisted}`)
        }
        // Said out loud because the arithmetic invites the opposite assumption.
        L.push('')
        L.push('_These rows sum to MORE than the total above: the same kilogram'
          + ' is counted against every muscle that moved it. Unilateral pairs are'
          + ' scored at the weaker side, identically to the session total._')
        L.push('')
      }
    }
  }

  // ── Energy balance ──
  // The answer to the question a cut is actually run on.
  {
    const energy = energyBalance(days)
    if (energy.balanceKcal != null) {
      const deficit = energy.balanceKcal < 0
      const mag = Math.abs(energy.balanceKcal)
      L.push('### Energy balance')
      L.push('')
      L.push(`- **Energy balance (estimated):** ${n(mag)} kcal ${deficit ? 'DEFICIT' : 'SURPLUS'}`
        + ` over ${energy.daysCounted} day${energy.daysCounted === 1 ? '' : 's'}`
        + ` · ${n(Math.abs(energy.avgBalanceKcal ?? 0))} kcal/day`
        + ` ${deficit ? 'under' : 'over'} maintenance`)
      L.push(`    - Intake ${n(energy.intakeKcal)} kcal vs expenditure ${n(energy.expenditureKcal)} kcal`
        + ` (${tdeeBreakdown(energy.avgBmrKcal ?? 0, energy.avgActiveKcal ?? 0, energy.avgTefKcal ?? 0)}`
        + ' kcal/day, averaged)')

      /* ── WHICH DAYS WERE LEFT OUT, BY NAME ──
         The arithmetic was already right — intake − (BMR + active + TEF), both
         sides required per day so a half-logged day cannot masquerade as a
         1,900 kcal deficit. What it did not do was say WHICH days it dropped.
         "over 5 days" in a seven-day week is a fact about the estimate the
         reader cannot act on without knowing whether the missing two were rest
         days or the two biggest sessions of the week. */
      const counted = new Set(energy.countedDates)
      const skipped = days.filter((d) => !counted.has(d.date))
      if (skipped.length) {
        L.push(`    - Excluded: ${skipped.map((d) => `${d.weekdayLabel} ${d.date}`).join(', ')}`
          + ' — no intake, or no Apple Watch active energy, or both. A day missing'
          + ' either side is not a balance.')
      }
      L.push('    - _ESTIMATE, not a measurement. Only days holding both an intake'
        + ' and an expenditure are counted.'
        + ` TEF is the thermic effect of food, ${Math.round(TEF_FACTOR * 1000) / 10}% of intake —`
        + ' the energy spent digesting it, which is expenditure like any other.'
        + (energy.bmrCarried
          ? ' BMR is a scale reading and exists only on weigh-in days; days without'
            + ' one inherit the nearest reading (it moves ~2 kcal a week).'
          : '')
        + '_')
      L.push('')
    }
  }

  // ── Steps, and the week's shape ──
  {
    const stepDays = days.filter((d) => d.steps != null && Number.isFinite(d.steps))
    const avgSteps = meanOf(days.map((d) => d.steps))

    L.push('### Steps & daily shape')
    L.push('')
    // Spelled out because the question was asked directly: the average is over
    // every day that logged a step count. It is read from the day's own step
    // total and has never had anything to do with whether a walk was logged in
    // the cardio ledger — a cardio entry is a subset of the day's steps, not a
    // gate on them.
    L.push(`- **Steps (avg/day):** ${n(avgSteps)} across ${stepDays.length}`
      + ` day${stepDays.length === 1 ? '' : 's'} with a logged count`
      + ' (every such day counts, cardio session or not)')

    // The numbers above are the week's totals; these are its SHAPE. 22 000 kg
    // spread evenly and 22 000 kg carried by one enormous Monday are different
    // weeks that summarise identically, and seven glyphs say which it was
    // without the reader reconstructing seven values from the daily log.
    {
      // Volume is per DAY, not per session, so a double-session day reads as
      // the load it actually was and the bar count matches the step row exactly.
      const volByDate = new Map<string, number>()
      for (const s of sessions) {
        if (s.volumeKg == null || !Number.isFinite(s.volumeKg)) continue
        volByDate.set(s.date, (volByDate.get(s.date) ?? 0) + s.volumeKg)
      }
      // A rest day is a REAL zero here, not a gap — no training happened, which
      // is a measurement. Missing STEPS is a gap, because the day may well have
      // been walked and never synced.
      const volSpark = sparkline(days.map((d) => volByDate.get(d.date) ?? 0))
      const stepSpark = sparkline(days.map((d) => d.steps))
      const dayLetters = days.map((d) => d.weekdayLabel[0] ?? '?').join('')
      if (volSpark || stepSpark) {
        L.push(`- **Daily shape** (${dayLetters}, scaled from zero · \`${SPARK_GAP}\` = not logged):`)
        if (volSpark) L.push(`    - Volume: \`${volSpark}\``)
        if (stepSpark) L.push(`    - Steps:  \`${stepSpark}\``)
      }
    }
    L.push('')
  }

  /* ── DERIVED ────────────────────────────────────────────────────────────────
     THE ONLY PLACE IN THIS DOCUMENT WHERE A NUMBER IS COMPUTED RATHER THAN
     MEASURED, and it says so in its own heading.

     The file's opening rule stands unchanged: nothing above this line is
     derived, averaged into existence or estimated to fill a column. What
     changed is that a reader wanting a week-over-week delta or an adherence
     rate no longer has to recompute it by hand from the raw body — and get it
     subtly different every time — because the arithmetic is stated once, here,
     downstream of every measurement it is built from and behind a fence that
     lets it be ignored entirely.

     `derived.ts` owns the rules; this block only renders them. Every figure it
     prints comes from a row already shown above. */
  {
    const d = derivedWeek(input)
    L.push('## Derived (computed by HELIX — not measured)')
    L.push('')
    L.push('_Everything above this heading is a measurement. Everything below it is'
      + ' arithmetic over those measurements — stated so it can be audited, or'
      + ' ignored. No figure here reaches for data the document has not already'
      + ' shown you, and a metric with no evidence prints `—` rather than a zero._')
    L.push('')

    // ── Week over week ──
    if (d.deltas.some((x) => x.delta != null)) {
      L.push('### Week over week')
      L.push('')
      // Tonnage prints at full precision; everything else at the decimal count
      // its unit deserves. See `WeekDelta.exact`.
      const fmt = (v: number | null, x: WeekDelta) => (x.exact ? exact(v) : n(v, x.digits))
      for (const x of d.deltas) {
        if (x.delta == null) {
          /* WHY BOTH SIDES ARE NAMED WHEN THERE IS NO DELTA.
             This used to print one figure and "no comparable previous week",
             which was frequently a lie: the usual reason a delta is missing is
             that THIS week has no reading, not that the previous week is
             absent. Saying which side is empty is the difference between "the
             programme just started" and "you stopped logging your water". */
          L.push(`- ${x.label}: ${fmt(x.current, x)} this week`
            + ` · ${fmt(x.previous, x)} previous — no comparison`)
          continue
        }
        const pct = x.pct != null ? `, ${x.pct > 0 ? '+' : '−'}${n(Math.abs(x.pct), 1)}%` : ''
        const dir = x.delta > 0 ? '+' : x.delta < 0 ? '−' : ''
        L.push(`- ${x.label}: ${fmt(x.previous, x)} → ${fmt(x.current, x)} ${x.unit}`
          + ` (${dir}${fmt(Math.abs(x.delta), x)}${pct})`)
      }
      L.push('')
      L.push('_Against the most recent EARLIER week in the ledger, which is not always'
        + ' the calendar week before if a week was not trained._')
      L.push('')
    }

    // ── Training load ──
    L.push('### Training load')
    L.push('')
    L.push(`- Mean working-set effort: ${d.meanWorkingSetRpe != null
      ? `${n(d.meanWorkingSetRpe, 2)} RPE across ${d.ratedSets} rated set${d.ratedSets === 1 ? '' : 's'}`
      : DASH}`)
    // Distinct from the session ratings in the Weekly summary: one is how the
    // workout felt afterwards, this is what the sets said at the time, and a
    // week where the two disagree is the interesting kind.
    L.push(`- Working sets: ${d.workingSets}`
      + ` · mean per session: ${n(d.meanSetsPerSession, 1)}`
      + ` · mean tonnage per session: ${exact(d.meanVolumePerSessionKg)} kg`)
    L.push(`- Sets taken to failure: ${d.failureSetShare != null
      ? `${n(d.failureSetShare, 1)}% of working sets` : DASH}`)
    L.push(`- Technique flags: ${d.flaggedSets} set${d.flaggedSets === 1 ? '' : 's'} flagged`
      + `${d.quality.length ? ` — ${d.quality.map((q) => `${q.label} ×${q.count}`).join(', ')}` : ''}`)
    L.push('')

    // ── Progression ──
    if (d.progression.length) {
      L.push('### Top-set movement within the week')
      L.push('')
      for (const e of d.progression) {
        const arrow = e.deltaKg > 0 ? '+' : e.deltaKg < 0 ? '−' : '±'
        L.push(`- ${e.name}: ${exact(e.firstKg)} → ${exact(e.lastKg)} kg`
          + ` (${arrow}${exact(Math.abs(e.deltaKg))}) across ${e.sessions} sessions`)
      }
      L.push('')
      L.push('_Only movements trained more than ONCE inside this week, compared'
        + ' first-to-last. It is not progression against the last time the movement'
        + ' was performed — that session may fall outside this payload, and this'
        + ' section never reaches for data the document has not shown._')
      L.push('')
    }

    // ── Adherence & coverage ──
    // How much of this week is actually evidence. A document full of gaps and a
    // document full of readings summarise identically without it.
    L.push('### Adherence & coverage')
    L.push('')
    L.push(`- Supplements: ${d.supplementsTaken != null && d.supplementsPlanned
      ? `${n(d.supplementsTaken)} of ${n(d.supplementsPlanned)} doses`
        + ` (${n((d.supplementsTaken / d.supplementsPlanned) * 100)}%)`
      : DASH}`)
    L.push(`- Fatigue: ${d.fatigueReadings} of ${d.fatigueSlots} slots answered`)
    L.push(`- Soreness: logged on ${d.domsDaysLogged} of ${days.length} days`)
    L.push(`- Intake: logged on ${d.intakeDaysLogged} of ${days.length} days`)
    L.push(`- Weigh-ins: ${d.weighInDays} of ${days.length} days`)
    L.push(`- Per-set effort: ${d.ratedSets} of ${d.workingSets} working sets rated`)
    L.push('')

    // ── Sleep composition ──
    L.push('### Sleep composition')
    L.push('')
    L.push(`- Deep: ${d.meanDeepPct != null ? `${n(d.meanDeepPct, 1)}% of time asleep` : DASH}`
      + ` · REM: ${d.meanRemPct != null ? `${n(d.meanRemPct, 1)}%` : DASH}`
      + ` · Awake (avg): ${d.meanAwakeMin != null ? `${n(d.meanAwakeMin)} min` : DASH}`)
    L.push('')
    L.push('_Shares, because the minutes are already above: 39 minutes of deep sleep'
      + ' is a different night after 9h than after 5h30._')
    L.push('')

    // ── Intake by day type ──
    if (d.trainingDayKcal != null || d.restDayKcal != null) {
      L.push('### Intake by day type')
      L.push('')
      L.push(`- Training days: ${d.trainingDayKcal != null ? `${n(d.trainingDayKcal)} kcal` : DASH}`
        + ` · Rest days: ${d.restDayKcal != null ? `${n(d.restDayKcal)} kcal` : DASH}`)
      L.push('')
    }
  }

  /* ── THE MACHINE-READABLE WEEK IS GONE ─────────────────────────────────────
     A `## Machine-readable week` section used to sit here: the whole
     `WeeklyExportInput` serialised into a json fence, on the reasoning that a
     tool could read it without parsing prose.

     Nothing ever did. This export has exactly one consumer — it is copied into a
     chat window by hand — and the fence was a verbatim second copy of every
     number already stated above it, several times the length of the document it
     was appended to. It cost the reader the end of the report and cost the model
     its context window, to say nothing that the prose had not.

     `weekJson.ts` survives and is still exercised by the tests: the payload it
     serialises is the right shape for a future tool, and deleting the builder
     because today's document does not print it would be throwing away the part
     that was actually correct. */

  // ── The doubt, stated once ──
  // A ⚠ on a micro line is not an adherence finding and must not be read as one,
  // so it gets a sentence rather than being left to look like a bad day. Printed
  // only when something was actually flagged: a standing caveat about a problem
  // the week does not have is noise.
  const flagged = flaggedMicros(input.days)
  if (flagged.length) {
    L.push('---')
    L.push('')
    L.push(`⚠ **Implausible micronutrient readings this week:** ${flagged.join(' · ')}.`)
    L.push('')
    L.push('_These are printed exactly as stored. `nutrition_entries` keeps one'
      + ' aggregate row per day with no item breakdown, so neither this document nor'
      + ' the app can identify what contributed them — the duplicate is upstream, in'
      + ' the Health source. Treat a flagged figure as unmeasured rather than as a'
      + ' day that went badly._')
    L.push('')
  }

  // ── Provenance ──
  // The absolute last lines, so they govern everything above them. Verbatim and
  // hardcoded on purpose: standing statements about the instrument and about
  // what is NOT in this document, neither of which is data.
  L.push('---')
  L.push('')
  L.push(UNILATERAL_VOLUME_NOTE)
  L.push('')
  L.push(EPLEY_NOTE)
  L.push('')
  L.push(APPLE_WATCH_DISCLAIMER)
  L.push('')
  // ── THE VERY LAST LINE OF THE DOCUMENT ──
  // It points at something OUTSIDE this payload — the prior week's report,
  // pasted alongside by hand — so it is the one statement that has to survive
  // being read last.
  L.push(priorReportNote(input.weekLabel))

  return L.join('\n')
}

/**
 * The closing line that replaces the embedded previous week.
 *
 * It exists so the absence is EXPLICIT. A model handed one week of data with no
 * word about the week before it will either assume none exists or invent a
 * comparison from the trend ledger and present it as a reading — both worse
 * than a sentence saying where the prior week actually is.
 *
 * The label is the one this payload is FOR — `weekLabel`, the same string the
 * document's own H1 carries, so the reader is being pointed at a report they
 * can actually identify. Falls back to unnumbered wording when the payload
 * carries no label, because "Week undefined" is worse than no number at all.
 */
export function priorReportNote(weekLabel?: string | null): string {
  const label = weekLabel?.trim()
  const week = label ? label : 'The previous week\'s'
  return `*Note: ${week} report is provided manually for reference and comparison.*`
}

/**
 * The standing statement of the asymmetry rule.
 *
 * The rule was already stated once, inside the per-muscle tonnage block — but
 * that block only prints when there IS per-muscle tonnage, so a week whose
 * sessions were all bilateral, or whose muscle rows were empty, published every
 * volume figure with no account of how a two-sided set had been counted. A
 * reader comparing "L 5 kg × 10 · R 5 kg × 14" against a 100 kg session total
 * has to be able to find the arithmetic; guessing produces 120.
 *
 * Printed beside the instrument caveat, after the embedded previous week, so it
 * governs every number in the document rather than one section of it.
 */
export const UNILATERAL_VOLUME_NOTE =
  '*Note: Unilateral (single-arm / single-leg) work is logged per side and'
  + ' scored ONCE at the WEAKER side: min(weight) × min(reps).'
  + ' "L 5 kg × 10 · R 5 kg × 14" is 50 kg of volume, not 70 and not 100 —'
  + ' crediting the strong side\'s extra reps to the weak one would inflate the'
  + ' trend without the work being there, and doubling it would make the same'
  + ' physical set weigh twice as much purely for having been recorded per side.'
  + ' Each side keeps its own failure tag, and the pair counts as ONE set.*'

/**
 * The standing caveat about instrument accuracy, printed at the very bottom of
 * every export.
 *
 * Heart rate, calories and steps all come off the watch, and a model reading
 * this data has no other way to know that a 900 kcal active-energy day is a
 * device estimate rather than a measured burn. Stating it once, last, is what
 * lets the numbers above be printed plainly.
 */
/**
 * The estimator behind every "1RM:" figure in this document.
 *
 * The PR lines print the estimate's VALUE now, not only the name of the axis it
 * fell on, and a bare number invites the reader to compare it with Hevy's —
 * which is a different formula. Stating the method once, at the foot, is what
 * makes the numbers above safe to read.
 */
export const EPLEY_NOTE =
  '*Note: every "1RM" here is an ESTIMATE from the Epley formula '
  + '(weight × (1 + reps/30)), not a lift that was performed. Hevy estimates it '
  + 'differently, so the two will not agree exactly. Unloaded work has no 1RM '
  + 'estimate at all and shows none.*'

export const APPLE_WATCH_DISCLAIMER =
  '*Note: Heart rate, calories, and steps data are sourced from the Apple Watch'
  + ' and may not be entirely accurate.*'

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
  // Deduped by NAME, so a row that somehow appears twice collapses instead of
  // printing two lines with no way to tell which applied when.
  const byName = new Map<string, { time: string; line: string }>()
  for (const s of protocol) {
    const name = s.name.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (byName.has(key)) continue
    const time = s.time?.trim() || '—'
    // A dose that differs by day is stated as the rule it is, rather than
    // arbitrarily picking one of the two columns.
    const dose = s.trainingDose && s.restDose && s.trainingDose !== s.restDose
      ? `${s.trainingDose} on training days / ${s.restDose} on rest days`
      : s.dose.trim()
    const parts = [`${time} · ${name} — ${dose}`]
    if (s.trainingOnly) parts.push('(training days only)')
    if (s.notes?.trim()) parts.push(`· ${s.notes.trim()}`)
    byName.set(key, { time, line: parts.join(' ') })
  }
  return [...byName.values()]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((x) => x.line)
}
