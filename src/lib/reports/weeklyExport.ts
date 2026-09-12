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
import { rpeLabel, cr10Label, RPE_LADDER } from '@/lib/training/effort'
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
  /**
   * The `custom_supplements.schedule.key` each `supplement_log` row is written
   * against. Carried so a day's "taken" list can print NAMES: the log holds
   * keys, and `d3k2@07:00` is not a line a person reads. Optional — a payload
   * built before this existed falls back to printing the key.
   */
  key?: string | null
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
   * The night the wearer says the watch got wrong.
   *
   * HealthKit's sleep is the one reading here that nothing can dispute — a
   * phone left on the bed reads as a night, a nap folds into one, and the
   * figure lands with the same authority as a measured one. This says the
   * reading is not to be trusted, and it deliberately does not CHANGE it:
   * correcting a measurement by self-report is how a log becomes a wish.
   * Absent or false on a night nobody disputed, and omitted from the export
   * entirely in that case.
   */
  sleepInaccurate?: boolean | null
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
  /**
   * The bout's own start, as a timestamp — `cardio_logs.created_at`.
   *
   * ── WHY THE COLUMN CARRIES TWO MEANINGS, AND WHY `source` IS BESIDE IT ─────
   * `cardio_logs` has no start-time column and is not getting one (the table is
   * shared with the web app and adding one is a paste-into-the-SQL-editor step
   * this machine cannot perform). For an IMPORTED row the app stores the bout's
   * start here, because for the one query that reads it — `ORDER BY created_at`
   * — a start is a strictly better sort key than the instant of the import. For
   * a HAND-TYPED row it is still the moment it was typed.
   *
   * So the figure alone cannot be read. `source` says which of the two it is,
   * and a reader that wants "when did the walk happen" must check it first.
   * Exporting the time without the provenance would state a 21:00 walk that
   * happened at 08:00.
   */
  startedAt: string | null
  /** Metres climbed. Most of what separates a hard walk from an easy one. */
  elevationM: number | null
  /** `health` = read from Apple Health, `manual` = typed. Never null. */
  source: 'health' | 'manual'
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

/**
 * One `stress_logs` row — the "Head" reading, self-reported.
 *
 * ── WHY THIS IS NOT A SECOND FATIGUE SCALE ───────────────────────────────────
 * `ExportFatigue` asks what the BODY could do. This asks what is on the mind,
 * and the two answer differently on the same day: a calm week of heavy training
 * and a light week in the middle of a house move both exist, and one
 * self-report cannot separate them. See `OnyxCore/Recovery/PsychStress.swift`,
 * which is where the vocabulary lives and where the rows are written.
 *
 * `slot` is morning / midday / evening and is derived from the clock rather
 * than chosen, so it is a fact about when the answer was given. `label` is
 * `PsychStress.levels`' own word for the level (1 Relaxed … 5 Swamped) — the
 * number alone is not readable and the word alone cannot be compared.
 *
 * `tags` are report-only: nothing scores them, and a reading with none is a
 * complete reading. They are the single most useful thing on the row for a
 * reader asking why a week went the way it did.
 */
export interface ExportStress {
  date: string
  slot: string
  level: number
  label: string
  tags?: string[]
  /** The wearer's own words. Sanitised at the render boundary — see `phrase`. */
  note?: string | null
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
  /**
   * Which side, and which part of the muscle.
   *
   * Both optional and both absent on every row written before 2026-09-12, which
   * is why the token for a whole-muscle bilateral rating is byte-identical to
   * the one v1 produced — a week of old rows re-exports unchanged.
   */
  side?: 'left' | 'right' | 'both' | null
  subRegion?: string | null
}

/**
 * One joint or connective-tissue complaint. Binary: the row IS the flag.
 *
 * It rides in the DAYS row beside `doms` rather than in a section of its own,
 * because it is a per-day list of short tokens and that is exactly what
 * `fatigue`, `doms` and `tags` already are. A section would need a parser; a
 * cell needs none.
 */
export interface ExportJoint {
  date: string
  joint: string
  side?: 'left' | 'right' | 'both' | null
  /** The wearer's own words. Sanitised at the render boundary — see `phrase`. */
  note?: string | null
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
  /** Flagged joints. Optional: a payload built before v2 simply has none. */
  joints?: ExportJoint[]
  /**
   * Subjective fatigue, up to three readings a day.
   *
   * Reported, never scored — see `useFatigue`. It sits in the export because a
   * coach reading a week wants to know that Thursday's session followed three
   * days that ended "Heavy"; it stays out of `daily_scores` because a number
   * you can talk yourself into is not a measurement.
   */
  fatigue?: ExportFatigue[]
  /**
   * Self-reported psychological stress — the "Head" row. Optional: a payload
   * built by a surface that does not write `stress_logs` simply has none, and
   * the day says `no data` rather than claiming a calm week.
   */
  stress?: ExportStress[]
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

/**
 * Free text entering a separator-sensitive document.
 *
 * The grammar reserves ` · ` between fields, `;` between items and `:` between
 * an item's parts; a note carrying any of them would split into cells that look
 * like data. It is stripped rather than escaped because an escape needs a
 * reader that knows about it, and the only thing downstream of this document is
 * a person or a model reading plain text.
 *
 * 60 characters because this sits inside a day row that already carries forty
 * columns — a paragraph in a cell is a paragraph nobody reads.
 */
export function phrase(text: string | null | undefined, max = 60): string {
  if (!text) return ''
  // v3 also stripped `;` and `:` because both delimited list items inside a
  // cell. v4 has no cells, so a note keeps its own punctuation — "barely
  // slept; deadline" was being flattened into "barely slept deadline", which
  // is the document editing the wearer's words. Only `·` still has to go: it
  // separates the fields on the line this note lands in.
  const flat = text.replace(/[·\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * `muscle[/subRegion][@L|@R]` — the name half of a soreness token.
 *
 * `@` and `/` are used because neither can occur in a muscle or a sub-region
 * name and neither is this column's separator. A leading `L`/`R` marker — which
 * is how the SESSIONS section spells a unilateral set — was rejected here for
 * one reason: `Lats` is a sub-region beginning with `L`, so a prefix rule makes
 * the token ambiguous the first time anybody parses it back.
 *
 * A whole-muscle, both-sides rating renders as the bare muscle name, so every
 * row written before v2 exports exactly as it always did.
 */
export function domsName(d: Pick<ExportDoms, 'muscle' | 'side' | 'subRegion'>): string {
  const sub = d.subRegion ? `/${d.subRegion}` : ''
  const side = d.side === 'left' ? '@L' : d.side === 'right' ? '@R' : ''
  return `${d.muscle}${sub}${side}`
}

/** `Knee@L` or `Wrist@R:tight after pressing`. Absence is the "no". */
export function jointToken(j: ExportJoint): string {
  const side = j.side === 'left' ? '@L' : j.side === 'right' ? '@R' : ''
  const note = phrase(j.note)
  return note ? `${j.joint}${side}:${note}` : `${j.joint}${side}`
}

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
 * ── EXPORT v4, THE DOCUMENT ──────────────────────────────────────────────────
 *
 * v3 stated a week in ≤ 120 lines by giving every record one `·`-separated line
 * and naming its columns once on the heading above it. It is complete, it is
 * compact, and `## DAYS` is forty columns wide — a person reading it counts
 * dots to find out what Tuesday's HRV was, and a model reads a legend before it
 * reads a fact. It was built so `line.split(' · ')` was a complete parser, and
 * that constraint is what made every line unreadable.
 *
 * v4 keeps every number and throws away the grammar. THREE RULES:
 *
 *  1. **The week is written day by day.** Everything the app knows about Monday
 *     sits under `## DAY 2 · Mon 31 Aug`, in the order the day happened: sleep,
 *     vitals, body, readiness, head, intake, micros, stack, activity, shape,
 *     the sessions, the cardio, and the day's computed figures last. A reader
 *     asking "what happened on Monday" scrolls to one place. v3's column-major
 *     shape meant answering that question required four sections.
 *
 *  2. **A gap is named, never omitted and never a zero.** A field the app has
 *     no reading for prints `no data`; an empty list prints `none`; and where
 *     the app knows WHY, it says so — `no weigh-in — As Planned`, `no sets
 *     logged`, `RPE not reported`. A row with nothing at all in it is dropped
 *     and named in the day's closing `Not recorded:` line, so a blank Saturday
 *     costs one line rather than twelve that all say the same thing.
 *
 *  3. **Computed values are labelled where they sit.** v3 kept a document-level
 *     fence — everything above `## DERIVED` was measured, everything below was
 *     arithmetic. Day-major layout cannot keep a fence, so the marker moves
 *     onto the line: `**Derived**` and the energy balance both say, in words,
 *     that Onyx computed them and did not measure them.
 *
 * FOUR TABLES, and only four: the programme ledger, sets by muscle, body
 * composition and the weekly micronutrient average. Each is a genuine grid read
 * down a column. Everything else is prose, because a markdown table collapses
 * into one unreadable paragraph in Apple Notes and this document is written to
 * be pasted anywhere.
 *
 * LINES INSIDE A DAY END IN TWO SPACES. That is a markdown HARD BREAK, and
 * without it every row of a day renders as one run-on paragraph. It is
 * invisible in plain text, which is the other half of where this gets pasted.
 *
 * WHAT IS UNCHANGED FROM v3. Every number is one the app measured; the document
 * is deterministic and pure (same input, same string, no clock); there are no
 * verdicts, no zone words and no coaching header. Unilateral work is still
 * scored once at the weaker side, warm-ups still count toward tonnage and not
 * toward working sets, and an estimated 1RM is still named as an estimate.
 *
 * WHAT CAME BACK. The four closing notes. v3 retired them on the grounds that
 * a caveat belongs on the line it qualifies, which is true and which is why the
 * legend above them exists — but the four facts in `## NOTES` are the ones a
 * reader has to be told once and cannot infer from any single line.
 */

/** A markdown hard break. Every line inside a day block ends with one. */
const BR = '  '

/** What the document says instead of a blank. Never `0`, never an empty cell. */
const NO_DATA = 'no data'
/** What it says for an empty LIST, which is a different fact from no reading. */
const NONE = 'none'

/** Month names. Written out rather than localised — this file has no locale. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "30 Aug" from `2026-08-30`. Echoes anything it cannot parse. */
function dayOfMonth(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]}` : date
}

/**
 * Thousands separators on the INTEGER part only.
 *
 * `14939.75` is unreadable and `14,939.75` is the same number. The decimals are
 * left exactly as they arrived: tonnage is a sum of quarter-kilogram microloads
 * and its `.25` is real work, so this groups digits and rounds nothing.
 */
function grp(s: string): string {
  const m = /^([-−+]?)(\d+)(\.\d+)?$/.exec(s)
  return m ? `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${m[3] ?? ''}` : s
}

/** A grouped fixed-dp number, or `null` when there is nothing to print. */
const val = (v: number | null | undefined, digits = 0): string | null =>
  v == null || !Number.isFinite(v) ? null : grp(n(v, digits))

/** A grouped FULL-precision number — tonnage and loads. Null when absent. */
const valExact = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : grp(exact(v))

/**
 * `HRV 61.5 ms`, or `HRV no data`.
 *
 * The label travels with the value because these lines are read left to right
 * rather than zipped against a legend — which is the whole difference between
 * this document and the one it replaces.
 */
function stat(label: string, v: number | null | undefined, unit = '', digits = 0): string {
  const x = val(v, digits)
  return x == null ? `${label} ${NO_DATA}` : `${label} ${x}${unit}`
}

/** A signed figure, where the sign IS the finding: `+0.2 °C`, `−0.1 °C`. */
function signed(v: number | null | undefined, digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null
  const body = grp(Math.abs(v).toFixed(digits))
  return v < 0 ? `−${body}` : `+${body}`
}

/** Minutes as a person says them: `9 h 11 m`, `40 m`, `9 h`. */
function hm(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null
  const total = Math.round(v)
  const h = Math.floor(total / 60), m = total % 60
  if (!h) return `${m} m`
  return m ? `${h} h ${String(m).padStart(2, '0')} m` : `${h} h`
}

/** The non-empty pieces of a line, joined by the document's one separator. */
const line = (...parts: Array<string | null | undefined | false>): string =>
  parts.filter((p): p is string => typeof p === 'string' && p !== '').join(SEP)

/**
 * One labelled row of a day, or `null` when it has nothing to say.
 *
 * The null is load-bearing: a caller collects the names of the rows that came
 * back null and prints them in the day's closing `Not recorded:` line, so an
 * absent row is still stated — just once, and at the foot, rather than as a
 * column of identical dashes.
 */
function dayRow(label: string, body: string): string | null {
  return body ? `**${label}** ${body}${BR}` : null
}

/**
 * A row that prints the readings it HAS and names the ones it LACKS, once.
 *
 * ── WHY NOT A DASH PER FIELD ─────────────────────────────────────────────────
 * A gap must never be omitted silently — that is how a missing weigh-in gets
 * read as a zero, and it is the rule this document is built on. But `Body` has
 * sixteen compartments and a day that carries two of them rendered as fourteen
 * consecutive `no data`s, which is not "stating the gap": it is burying the two
 * real numbers in it, and it is the same unreadability v3 had with dashes.
 *
 * So the gap is stated ONCE, by name, in a trailing clause. Nothing is hidden,
 * the reader can still see exactly which compartments were not measured, and
 * the readings that exist are the part of the line the eye lands on. A row with
 * NOTHING in it returns null and is named in the day's own closing line, one
 * level up — the same rule, applied one level higher.
 */
function partialRow(label: string, entries: Array<[string, string | null]>): string | null {
  const have = entries.filter(([, v]) => v != null).map(([, v]) => v as string)
  if (!have.length) return null
  const lack = entries.filter(([, v]) => v == null).map(([k]) => k)
  return dayRow(label, `${have.join(SEP)}${lack.length ? ` — not measured: ${lack.join(', ')}` : ''}`)
}

/** True when at least one of these readings exists. */
const some = (...vs: Array<number | string | boolean | null | undefined>): boolean =>
  vs.some((v) => v != null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v)))

/**
 * One set, as the line a reader actually wants:
 *
 *     `S1` 75 kg × 12 @ 8.5 Hard
 *     `S2` 75 kg × 12 @ 9.5 Max Effort — momentum
 *     `W` 40 kg × 15 — warm-up
 *     `S1` L 5 kg × 15 @ 8 Challenging · R 5 kg × 17 @ 9 Very Hard → scores 5 kg × 15
 *
 * The ordinal is backticked so it survives as a unit in every renderer and can
 * be scanned down a column. Warm-ups and ghosts consume NO ordinal — `S1` is
 * the first working set, which is the rule the rest of the app already counts
 * by — so they carry `W` and `G` instead.
 *
 * The RPE number is followed by its LADDER WORD. `@8.5` requires the reader to
 * know the scale; `@ 8.5 Hard` does not, and the word is what makes two sets at
 * 8.5 and 9.5 legible as different sets rather than as a rounding.
 *
 * A UNILATERAL PAIR IS ONE LINE and states what it scored. `min(weight) ×
 * min(reps)` is the invariant the whole app counts by, and the one thing a
 * reader consistently gets wrong when they meet two sided rows — so the line
 * does the arithmetic in front of them rather than leaving it implied.
 */
function setValue(s: ExportSet, timed: boolean): string {
  if (timed) return `${grp(exact(s.reps))} sec`
  if (isUnloadedSet(s.weightKg)) return `${grp(exact(s.reps))} reps`
  return `${grp(exact(s.weightKg))} kg × ${grp(exact(s.reps))}`
}

/**
 * One side of a set, written out: the value, its effort, then its tags.
 *
 * The effort rides DIRECTLY on the value (`75 kg × 12 @ 8.5 Hard`) because it is
 * a property of that set's numbers. Everything else follows one em dash and is
 * comma-separated — `·` cannot serve here, since it already separates the two
 * halves of a unilateral pair on this same line.
 */
function setSide(s: ExportSet, timed: boolean, anyRated: boolean): string {
  const effort = s.rpe != null && Number.isFinite(s.rpe)
    ? ` @ ${String(s.rpe)} ${rpeLabel(s.rpe)}`
    : ''
  const tags: string[] = []
  if (!effort && anyRated && !s.warmup && !s.ghost) tags.push('RPE not reported')
  if (s.warmup) tags.push('warm-up')
  if (s.ghost) tags.push('ghost')
  if (s.dropset) tags.push('drop set')
  // RPE 10 IS the top of the ladder — "Failure, to failure" states one fact
  // twice, so the tag is suppressed when the rating already carries the word.
  if (s.failure && !s.warmup && rpeLabel(s.rpe).toLowerCase() !== 'failure') tags.push('to failure')
  const q = s.quality ? SET_QUALITY[s.quality] : undefined
  if (q) tags.push(q.label.toLowerCase())
  return `${setValue(s, timed)}${effort}${tags.length ? ` — ${tags.join(', ')}` : ''}`
}

function setLine(row: SetRow, ordinal: string, timed: boolean, anyRated: boolean): string {
  const one = (s: ExportSet) => setSide(s, timed, anyRated)
  if (row.single) return `\`${ordinal}\` ${one(row.single)}`
  const sides = [
    row.left ? `L ${one(row.left)}` : null,
    row.right ? `R ${one(row.right)}` : null,
  ].filter((x): x is string => x != null)
  // The scored figure only where there are genuinely two sides to reconcile. A
  // lone side is a set as logged and restating it would be noise.
  const scored = row.left && row.right
    ? ` → scores ${setValue(
        {
          ...row.left,
          weightKg: Math.min(row.left.weightKg, row.right.weightKg),
          reps: Math.min(row.left.reps, row.right.reps),
        },
        timed,
      )}`
    : ''
  return `\`${ordinal}\` ${sides.join(SEP)}${scored}`
}

/** Every set of one exercise, in order, warm-ups and ghosts outside the count. */
function exerciseLines(ex: ExportExercise): string[] {
  const timed = isTimedExercise(ex.name)
  const anyRated = ex.sets.some((s) => !s.warmup && !s.ghost && s.rpe != null)
  let working = 0
  return toSetRows(ex.sets).map((row) => {
    const sides = [row.single, row.left, row.right].filter((x): x is ExportSet => x != null)
    const warm = sides.some((s) => s.warmup)
    const ghost = !warm && sides.some((s) => s.ghost)
    const ordinal = warm ? 'W' : ghost ? 'G' : `S${++working}`
    return `${setLine(row, ordinal, timed, anyRated)}${BR}`
  })
}

/** How a session's sets divide, counted the way each figure is counted. */
interface SetTally { working: number; warmup: number; ghost: number; failure: number }

function tallySets(session: ExportSession): SetTally {
  const t: SetTally = { working: 0, warmup: 0, ghost: 0, failure: 0 }
  for (const ex of session.exercises) {
    for (const row of toSetRows(ex.sets)) {
      const sides = [row.single, row.left, row.right].filter((x): x is ExportSet => x != null)
      if (!sides.length) continue
      if (sides.some((s) => s.warmup)) { t.warmup += 1; continue }
      if (sides.some((s) => s.ghost)) { t.ghost += 1; continue }
      t.working += 1
      // A pair counts once here as it does everywhere: one side reaching
      // failure is the set reaching failure.
      if (sides.some((s) => s.failure)) t.failure += 1
    }
  }
  return t
}

/** `Arms/Biceps left`, `Quadriceps` — the soreness name, spelled for a reader. */
function domsReadable(d: Pick<ExportDoms, 'muscle' | 'side' | 'subRegion'>): string {
  const sub = d.subRegion ? `/${d.subRegion}` : ''
  const side = d.side === 'left' ? ' left' : d.side === 'right' ? ' right' : ''
  return `${d.muscle}${sub}${side}`
}

/**
 * `Knee left`, `Wrist right: tight after pressing`.
 *
 * The note hangs off a COLON and not an em dash. The readiness row already
 * divides its three clauses — fatigue, DOMS, joints — with ` — `, so a note
 * carrying one would end the joints clause halfway through itself and drop the
 * wearer's own words on the floor.
 */
function jointReadable(j: ExportJoint): string {
  const side = j.side === 'left' ? ' left' : j.side === 'right' ? ' right' : ''
  const note = phrase(j.note)
  return note ? `${j.joint}${side}: ${note}` : `${j.joint}${side}`
}

/**
 * The week's micronutrients, averaged over the days that carried a reading.
 *
 * Over the days that HAVE one, never over seven. A key logged on two days is a
 * two-day average; dividing it by seven would report a deficiency the week does
 * not have, which is the same class of error as reading a gap as a zero.
 *
 * Food and stack stay apart for the reason they always have: "594 mg of vitamin
 * C" is a different fact about a different week when a tablet supplied 470 of
 * it.
 */
export interface WeeklyNutrient {
  key: string
  label: string
  unit: string
  /** `ceiling` inverts the reading of the same arithmetic — see NUTRIENT_TARGETS. */
  kind?: string
  food: number
  stack: number
  total: number
  target: number
  /** Mean as a share of target, %. Null when the target is 0. */
  pct: number | null
  days: number
  /** True where any single day's reading was judged implausible. */
  flagged: boolean
}

/**
 * Decimals a micronutrient average is worth printing at.
 *
 * A whole number prints whole: `0.0` mg of a supplement reads as a tenth of a
 * milligram that was measured, when what happened is that nothing was taken.
 * A fraction under ten keeps one place, where the tenth is most of the figure.
 */
const microDp = (v: number): number => (Number.isInteger(v) ? 0 : v < 10 ? 1 : 0)

export function weeklyNutrients(days: readonly ExportDay[]): WeeklyNutrient[] {
  const out: WeeklyNutrient[] = []
  for (const t of NUTRIENT_TARGETS) {
    let food = 0, stack = 0, counted = 0, flagged = false
    for (const d of days) {
      const f = d.nutrientsFood?.[t.key]
      const k = d.nutrientsStack?.[t.key]
      if (f == null && k == null) continue
      const fv = typeof f === 'number' && Number.isFinite(f) && f > 0 ? f : 0
      const kv = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : 0
      if (implausibleNutrient(t, fv, kv)) flagged = true
      food += fv
      stack += kv
      counted += 1
    }
    if (!counted) continue
    const mf = food / counted, mk = stack / counted
    out.push({
      key: t.key, label: t.label, unit: t.unit, kind: t.kind,
      food: mf, stack: mk, total: mf + mk, target: t.target,
      pct: t.target > 0 ? ((mf + mk) / t.target) * 100 : null,
      days: counted, flagged,
    })
  }
  return out
}

/**
 * One day's micronutrients, reduced to what a reader has to act on.
 *
 * The full eighteen-key line ran to four wrapped lines a day and was a quarter
 * of the whole document, most of it restating that an ordinary day was
 * ordinary. What survives per day is the exception: a floor that was missed, a
 * ceiling that was exceeded, and anything the document itself doubts. The
 * complete picture moves to one weekly table, which is where an average belongs.
 */
function microExceptions(day: ExportDay): string[] {
  const out: string[] = []
  for (const t of NUTRIENT_TARGETS) {
    const f = day.nutrientsFood?.[t.key]
    const k = day.nutrientsStack?.[t.key]
    if (f == null && k == null) continue
    const fv = typeof f === 'number' && Number.isFinite(f) && f > 0 ? f : 0
    const kv = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : 0
    const total = fv + kv
    const bad = t.kind === 'ceiling' ? total > t.target : t.target > 0 && total < t.target
    const flag = implausibleNutrient(t, fv, kv)
    if (!bad && !flag) continue
    const over = t.kind === 'ceiling' ? ' (ceiling)' : ''
    out.push(`${t.label} ${flag ? '⚠ ' : ''}${grp(exact(total))} / ${grp(exact(t.target))} ${t.unit}${over}${flag ? ' — implausible' : ''}`)
  }
  return out
}

/**
 * ── THE LEGEND ───────────────────────────────────────────────────────────────
 * Every convention the document uses that a reader could not infer from a line.
 * It sits at the FOOT rather than the head: a model reading top to bottom meets
 * the week first, and a person looking a symbol up scrolls to the end, which is
 * where a legend has always lived.
 *
 * The RPE ladder is read from `RPE_LADDER` rather than spelled here, so the
 * document cannot state a scale the logger does not offer.
 */
function legendLines(): string[] {
  const ladder = RPE_LADDER.map((s) => `${s.value} ${s.label} *(${s.hint})*`).join(SEP)
  return [
    '## LEGEND',
    '',
    // The legend is rows like any other, so its lines need the same hard break:
    // without it `**RPE**` and the ladder under it render as one paragraph.
    `**RPE** — how many reps were left at the end of the set.${BR}`,
    `${ladder}${BR}`,
    'Session sRPE uses Borg CR10, the same scale at session level: '
      + '1 Very light, 5 Hard, 7 Very hard, 10 Maximal.',
    '',
    '**Set counts** — `sets logged` includes warm-ups and ghosts; `working` excludes both. '
      + 'Tonnage INCLUDES warm-ups and EXCLUDES ghosts — a warm-up is work that was done and '
      + 'a ghost is work that was not. Set numbers skip both: `S1` is the first working set.',
    '',
    '**Set marks** — `W` warm-up · `G` ghost, planned and not performed · `drop set` · '
      + '`to failure` · a trailing word is the reported set quality.',
    '',
    '**Sets by muscle** — a set credits 1.0 to each muscle the movement trains directly and '
      + '0.5 to each it assists. Per-muscle tonnage does NOT sum to the week’s total: a '
      + 'compound lift is counted once against every muscle it trains.',
    '',
    `**Soreness** — 0–3, logged per muscle and per side, with the session it is attributed to.${BR}`,
    `**Head** — self-reported psychological stress, 1 Relaxed to 5 Swamped, with what it was about.${BR}`,
    '**Fatigue** — 1–5, three times a day. Reported, never scored.',
    '',
    `**Derived** — computed by Onyx, not measured. tdee = BMR (from the scale, carried across `
      + `gaps) + Apple Watch active energy + intake × ${TEF_FACTOR}. load = session RPE × minutes. `
      + 'acwr = EWMA 7:28 of load. strainZ = z of Foster strain against your own rolling normal. '
      + 'wellness = mean of the answered Hooper items, 0–1.',
    '',
    `**"${NO_DATA}" / "${NONE}"** — the reading was never recorded. It is never a zero.${BR}`,
    'A row states the readings it has and names the rest after **not measured:**. A row with '
      + 'nothing in it at all is dropped, and named in that day’s closing **Not recorded:** line. '
      + 'Nothing is ever silently omitted.',
  ]
}

/**
 * ── THE FOUR NOTES ───────────────────────────────────────────────────────────
 * Verbatim, and last. v3 retired the closing notes on the grounds that a caveat
 * belongs on the line it qualifies — which is right, and is why the legend
 * above exists. These four are the exception: each is a fact about how a number
 * in this document was ARRIVED AT, which no single line can carry and which a
 * reader who has not been told will get wrong in a specific, predictable way.
 *
 * They are stored as one array and asserted byte for byte by
 * `export-layout.test.ts`. Do not reword them here without moving that test.
 */
export const EXPORT_NOTES: readonly string[] = [
  'Note: Unilateral (single-arm / single-leg) work is logged per side and scored ONCE at the WEAKER side: min(weight) × min(reps). ‘L 5 kg × 10 · R 5 kg × 14’ is 50 kg of volume, not 70 and not 100 — crediting the strong side’s extra reps to the weak one would inflate the trend without the work being there, and doubling it would make the same physical set weigh twice as much purely for having been recorded per side. Each side keeps its own failure tag, and the pair counts as ONE set.',
  'Note: every ‘1RM’ here is an ESTIMATE from the Epley formula (weight × (1 + reps/30)), not a lift that was performed. Hevy estimates it differently, so the two will not agree exactly. Unloaded work has no 1RM estimate at all and shows none.',
  'Note: Heart rate, calories, and steps data are sourced from the Apple Watch and may not be entirely accurate.',
  'Note: Week 7 report is provided manually for reference and comparison.',
] as const

export function buildWeeklyExport(input: WeeklyExportInput): string {
  const { days, sessions } = input
  const cardio = input.cardio ?? []
  const bodyComp = input.bodyComp ?? []
  const L: string[] = []

  // ── HEADER ────────────────────────────────────────────────────────────────
  const label = input.weekLabel?.trim() || 'WEEK'
  L.push(`# ONYX · ${label.toUpperCase()}`)
  L.push(line(
    `${input.weekStart} → ${input.weekEnd}`,
    input.programLabel,
    input.phaseLabel?.trim() || null,
    sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'no sessions',
    `${days.length} day${days.length === 1 ? '' : 's'}`,
  ))

  // ── THE WEEK ──────────────────────────────────────────────────────────────
  const periods = input.targetPeriods ?? []
  const totals = trendTotals(days, sessions, cardio)
  const summary = weeklySummary(input)
  const energy = energyBalance(days)
  const weights = days.map((d) => d.weightKg)
    .filter((v): v is number => v != null && Number.isFinite(v))

  L.push('', '## THE WEEK', '')
  /** A rung's four numbers — what it actually asked for. */
  const rungGoals = (p: TargetPeriod): string => line(
    `${val(p.goals.calorie) ?? NO_DATA} kcal`,
    `${val(p.goals.protein) ?? NO_DATA} P / ${val(p.goals.carbs) ?? NO_DATA} C / ${val(p.goals.fat) ?? NO_DATA} F`,
    `${val(p.goals.steps) ?? NO_DATA} steps`,
  )
  L.push(line(
    `**Plan** ${input.programLabel}`,
    `**Phase** ${input.phaseLabel?.trim() || NO_DATA}`,
    // A week under ONE rung states it here, numbers and all — a bulleted list
    // of a single item is a line that says what the line above it just said.
    // A week under more than one cannot: naming one would be a claim about the
    // days the other governed, so the count goes here and the runs below.
    periods.length === 1 ? `**Lever** ${periods[0].label} — ${rungGoals(periods[0])}`
      : periods.length > 1 ? `**Levers** ${periods.length} rungs this week`
      : `**Lever** ${NO_DATA}`,
  ) + BR)
  // The rungs are spelled out only when more than one was in force — the single
  // -rung case is already named on the line above, and a bullet restating it is
  // a line that says nothing.
  if (periods.length > 1) {
    for (const p of periods) {
      const span = p.dates.length
        ? `${dayOfMonth(p.dates[0])} → ${dayOfMonth(p.dates[p.dates.length - 1])}`
        : NO_DATA
      L.push(`- **${p.label}** — ${line(rungGoals(p), span)}`)
    }
  }
  L.push('')
  L.push(`**Standing goals** ${line(
    stat('', input.calorieGoal, ' kcal').trim(),
    `${val(input.proteinGoalG) ?? NO_DATA} P`,
    `${val(input.stepsGoal) ?? NO_DATA} steps`,
    `${val(input.sleepGoalHours, 1) ?? NO_DATA} h sleep`,
    `${val(input.waterGoalMl) ?? NO_DATA} ml water`,
  )}`)

  L.push('')
  L.push(`**Training** ${line(
    `${valExact(totals.totalVolumeKg) ?? NO_DATA} kg`,
    `${summary.workingSets} working sets, ${summary.ratedSets} rated`,
    `${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
    summary.avgSessionRpe == null ? 'sRPE not reported'
      : `sRPE ${val(summary.avgSessionRpe, 1)} avg over ${summary.ratedSessions}`,
  )}${BR}`)
  L.push(`**Cardio** ${cardio.length ? line(
    `${val(summary.cardioMinutes, 1) ?? NO_DATA} min`,
    `${val(summary.cardioActiveKcal) ?? NO_DATA} kcal`,
    `${summary.cardioSessions} bout${summary.cardioSessions === 1 ? '' : 's'}`,
  ) : NONE}${BR}`)
  L.push(`**Intake** ${line(
    // The unit stays even where the figure is missing: `no data` alone in a
    // row that goes on to say `no data P` reads as a different KIND of gap.
    `${val(totals.avgKcal) ?? NO_DATA} kcal/day`,
    `${val(meanOf(days.map((d) => d.proteinG))) ?? NO_DATA} P`,
    `${val(meanOf(days.map((d) => d.carbsG))) ?? NO_DATA} C`,
    `${val(meanOf(days.map((d) => d.fatG))) ?? NO_DATA} F`,
    `${val(totals.avgWaterMl == null ? null : totals.avgWaterMl / 1000, 2) ?? NO_DATA} L water`,
  )}${BR}`)
  L.push(`**Activity** ${val(totals.avgSteps) == null
    ? `steps ${NO_DATA}` : `${val(totals.avgSteps)} steps/day`}${BR}`)
  L.push(`**Sleep** ${line(
    summary.avgSleepMin == null ? `${NO_DATA}` : `${hm(summary.avgSleepMin)}/day`,
    stat('RHR', summary.avgRestingHr, '', 1),
    stat('HRV', summary.avgHrvMs, ' ms', 1),
  )}${BR}`)
  L.push(`**Body** ${weights.length ? line(
    `${val(totals.avgWeightKg, 2) ?? NO_DATA} kg avg`,
    weights.length > 1
      ? `${val(weights[0], 1)} → ${val(weights[weights.length - 1], 1)} kg (${signed(weights[weights.length - 1] - weights[0], 2)} kg)`
      : `one weigh-in`,
  ) : `no weigh-in this week`}`)

  // ── ENERGY BALANCE ────────────────────────────────────────────────────────
  // Labelled as computed ON THE LINE. v3 kept a document-level fence; day-major
  // layout cannot, so the marker travels with the figure.
  L.push('')
  if (energy.daysCounted) {
    const excluded = days.filter((d) => !energy.countedDates.includes(d.date)).map((d) => d.date)
    L.push(`**Energy balance** ${line(
      `${signed(energy.balanceKcal, 0)} kcal over the week`,
      `${signed(energy.avgBalanceKcal, 0)} kcal/day`,
    )} — *computed by Onyx, an estimate*${BR}`)
    L.push(line(
      `TDEE ${val(energy.expenditureKcal == null ? null : energy.expenditureKcal / energy.daysCounted)}/day`
        + ` = BMR ${val(energy.avgBmrKcal)}`
        + ` + Apple Watch active ${val(energy.avgActiveKcal)}`
        + ` + TEF ${val(energy.avgTefKcal)} (intake × ${TEF_FACTOR})`,
      `${energy.daysCounted} day${energy.daysCounted === 1 ? '' : 's'} counted`,
      energy.bmrCarried ? 'BMR carried across the days with no weigh-in' : null,
      excluded.length ? `excluded ${excluded.join(', ')}` : null,
    ))
  } else {
    L.push(`**Energy balance** ${NO_DATA} — no day carried both an intake and an expenditure.`)
  }

  // ── SETS BY MUSCLE ────────────────────────────────────────────────────────
  // A genuine grid: one row per muscle, read down the target column. Unilateral
  // work is already scored once at the weaker side upstream — see the notes.
  if (input.volumeByMuscle.length || input.tonnageByMuscle?.length) {
    const tonnage = new Map((input.tonnageByMuscle ?? []).map((t) => [t.muscle, t]))
    const muscles = [...new Set([
      ...input.volumeByMuscle.map((v) => v.muscle),
      ...(input.tonnageByMuscle ?? []).map((t) => t.muscle),
    ])]
    L.push('', '### Sets by muscle', '')
    L.push(...markdownTable(
      ['Muscle', 'Sets', 'Target', 'Δ', 'Direct', 'Indirect', 'Tonnage kg'],
      muscles.map((muscle) => {
        const v = input.volumeByMuscle.find((x) => x.muscle === muscle)
        const t = tonnage.get(muscle)
        // No target is not a target of zero: `Adductors` genuinely carries 0 on
        // a cut, and a muscle the plan never named carries none at all.
        const delta = v && v.target > 0 ? signed(v.sets - v.target, 1) : '—'
        return [
          muscle,
          val(v?.sets, 1) ?? '—',
          v == null ? '—' : v.target > 0 ? (val(v.target, 1) ?? '—') : 'none',
          delta ?? '—',
          val(v?.directSets, 1) ?? '—',
          val(v?.indirectSets, 1) ?? '—',
          valExact(t?.volumeKg) ?? '—',
        ]
      }),
      ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    ))
  }

  // ── BODY COMPOSITION ──────────────────────────────────────────────────────
  // Every compartment in ABSOLUTE kg beside its percentage. A percentage of a
  // falling bodyweight can rise while the tissue shrinks; kilograms cannot lie
  // that way, and a cut is exactly where that matters.
  if (bodyComp.length) {
    L.push('', '### Body composition', '')
    L.push(...markdownTable(
      ['Date', 'Weight', 'BMI', 'Fat %', 'Fat kg', 'Muscle %', 'Muscle kg', 'SMM', 'FFM',
        'Water %', 'Water kg', 'Protein %', 'Protein kg', 'Bone kg', 'Visceral', 'BMR', 'WHR'],
      bodyComp.map((b) => [
        dayOfMonth(b.date),
        val(b.weightKg, 1) ?? '—', val(b.bmi, 1) ?? '—',
        val(b.bodyFatPct, 1) ?? '—', val(b.fatMassKg, 1) ?? '—',
        val(b.musclePercent, 1) ?? '—', val(b.muscleMassKg, 1) ?? '—',
        val(b.skeletalMuscleMassKg, 1) ?? '—', val(b.fatFreeMassKg, 1) ?? '—',
        val(b.waterPercent, 1) ?? '—', val(b.waterMassKg, 1) ?? '—',
        val(b.proteinPercent, 1) ?? '—', val(b.proteinMassKg, 1) ?? '—',
        val(b.boneMineralKg, 2) ?? '—', val(b.visceralFat, 1) ?? '—',
        val(b.bmr) ?? '—', val(b.estimatedWaistToHipRatio, 2) ?? '—',
      ]),
      ['left', ...Array<'right'>(16).fill('right')],
    ))
    const noWeighIn = days.filter((d) => !bodyComp.some((b) => b.date === d.date))
    if (noWeighIn.length) {
      L.push('')
      L.push(`*No weigh-in: ${noWeighIn.map((d) =>
        `${dayOfMonth(d.date)} — ${weighInSkipReason(d.weighInSkipReason)}`).join(SEP)}.*`)
    }
  }

  // ── MICRONUTRIENTS ────────────────────────────────────────────────────────
  const micros = weeklyNutrients(days)
  if (micros.length) {
    L.push('', '### Micronutrients — weekly average vs target', '')
    L.push(...markdownTable(
      ['Nutrient', 'Food', 'Stack', 'Total', 'Target', '%', 'Days'],
      micros.map((m) => [
        m.kind === 'ceiling' ? `${m.label} (ceiling)` : m.label,
        val(m.food, microDp(m.food)) ?? '—',
        val(m.stack, microDp(m.stack)) ?? '—',
        `${m.flagged ? '⚠ ' : ''}${val(m.total, microDp(m.total)) ?? '—'}`,
        `${valExact(m.target) ?? '—'} ${m.unit}`,
        m.pct == null ? '—' : `${val(m.pct)} %`,
        String(m.days),
      ]),
      ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    ))
    L.push('')
    L.push('*Averaged over the days that carried a reading, not over seven. '
      + '⚠ marks a day whose figure the document judged implausible for the intake logged '
      + 'beside it — treat it as unmeasured, not as a day that went badly.*')
  }

  // ── THE STACK ─────────────────────────────────────────────────────────────
  // What the protocol ASKS for. What was actually taken rides on each day.
  const supps = consolidateSupplements(input.supplementProtocol ?? [])
  if (supps.length) {
    L.push('', '### The stack', '')
    for (const s of supps) L.push(`- ${s}`)
  }

  // ── WEEK OVER WEEK ────────────────────────────────────────────────────────
  const derived = derivedWeek(input)
  if (input.ledger?.length) {
    L.push('', '### Week over week', '')
    L.push(...trendLedger(input.ledger))
    const moved = derived.deltas.filter((d) => d.delta != null)
    if (moved.length) {
      L.push('')
      L.push(`**vs the previous week** — ${moved.map((d) => {
        const size = d.exact ? grp(exact(d.delta)) : grp(n(d.delta as number, d.digits))
        const sign = (d.delta as number) < 0 ? '' : '+'
        const pct = d.pct == null ? '' : ` (${signed(d.pct, 0)} %)`
        return `${d.label.toLowerCase()} ${sign}${size.replace(/^-/, '−')} ${d.unit}${pct}`
      }).join(SEP)}`)
    }
  }

  // ── THE DAYS ──────────────────────────────────────────────────────────────
  const bodyByDate = new Map(bodyComp.map((b) => [b.date, b]))
  const batteryByDate = new Map(derived.battery.map((b) => [b.date, b]))
  const bmrs = bmrCarry(days)

  /**
   * One session, written out under whatever heading it belongs to.
   *
   * Extracted because a session can land in two places. Normally it sits
   * inside its day; but a payload can carry a session on a date the `days`
   * array does not cover — a week assembled from a partial range, or a session
   * whose day row failed to fetch — and a day-major document would then drop it
   * on the floor. v3 could not have this bug: it printed every session in one
   * flat section regardless. Losing a whole workout is a strictly worse defect
   * than printing it somewhere slightly odd, so it is printed below the days,
   * under a heading that says exactly why it is there.
   */
  const pushSession = (s: ExportSession): void => {
        const t = tallySets(s)
        L.push('')
        L.push(`### Session${s.sessionNumber == null ? '' : ` #${s.sessionNumber}`} · ${s.label}`)
        L.push(line(
          s.startedAt || s.endedAt
            ? `${s.startedAt ? clock(s.startedAt) : NO_DATA} → ${s.endedAt ? clock(s.endedAt) : NO_DATA}`
            : `start ${NO_DATA}`,
          stat('', s.durationMin, ' min').trim(),
          s.avgBpm == null ? `avg HR ${NO_DATA}`
            : `avg ${val(s.avgBpm)} bpm${s.avgBpmEstimated ? ' *(estimated)*' : ''}`,
          s.caloriesBurned == null ? `${NO_DATA} kcal`
            : `${val(s.caloriesBurned)} kcal${s.caloriesEstimated ? ' *(estimated)*' : ''}`,
          s.sessionRpe == null ? 'sRPE not reported'
            : `sRPE ${String(s.sessionRpe)} ${cr10Label(s.sessionRpe)}`,
        ) + BR)
        /* ── COUNTED FROM THE ROWS, NOT FROM THE LEDGER ────────────────────────
           `workout_sessions.set_count` is the app's own stored figure and it
           counts committed rows INCLUDING warm-ups, which is the right rule for
           the ledger and the wrong number to print above a list the reader can
           count. Where the two disagree — a payload assembled by hand, a session
           edited after it was saved — the document would state one total and
           then show another, which is the "three numbers describing the same
           work" defect this file has already been bitten by twice.
           So every figure on this line comes from `tallySets`, over the same
           rows printed below it. The stored count is the fallback for a session
           that carries no exercises at all. */
        const logged = s.exercises.length ? t.working + t.warmup + t.ghost : (s.setCount ?? 0)
        L.push(line(
          `${val(logged) ?? NO_DATA} sets logged`,
          `${t.working} working`,
          t.warmup ? `${t.warmup} warm-up` : null,
          t.ghost ? `${t.ghost} ghost` : null,
          `${t.failure} to failure`,
          `${valExact(s.volumeKg) ?? NO_DATA} kg tonnage`,
          `${s.prs.length} PR${s.prs.length === 1 ? '' : 's'}`,
        ))
        for (const ex of s.exercises) {
          L.push('')
          L.push(`**${ex.name}** · ${line(
            ex.repWindow ? `target ${ex.repWindow} reps` : `target ${NO_DATA}`,
            ex.restTargetSec == null && ex.restPlanSec == null ? `rest ${NO_DATA}`
              : ex.restTargetSec === ex.restPlanSec ? `rest ${val(ex.restTargetSec)} s`
              : `rest ${val(ex.restTargetSec) ?? NO_DATA} s (plan ${val(ex.restPlanSec) ?? NO_DATA})`,
            ex.topKg == null ? `top ${NO_DATA}`
              : isUnloadedSet(ex.topKg) ? 'bodyweight'
              : `top ${valExact(ex.topKg)} kg`,
            ex.sets.length ? null : '**no sets logged**',
          )}${ex.sets.length ? BR : ''}`)
          L.push(...exerciseLines(ex))
        }
        if (s.prs.length) {
          L.push('')
          L.push('**PRs**')
          for (const p of s.prs) {
            L.push(`- ${line(
              `${p.name} ${isTimedExercise(p.name) ? `${grp(exact(p.reps))} sec`
                : isUnloadedSet(p.weightKg) ? `${grp(exact(p.reps))} reps`
                : `${grp(exact(p.weightKg))} kg × ${grp(exact(p.reps))}`}`,
              p.axes.map((a) => prAxisLabel(a)).join(', '),
              p.volumeKg == null ? null : `${valExact(p.volumeKg)} kg volume`,
              // An unloaded lift has no estimate at all, and says so rather than
              // printing a dash a reader could take for a missing number.
              p.e1rmKg == null ? 'no 1RM estimate (unloaded)' : `e1RM ${valExact(p.e1rmKg)} kg`,
            )}`)
          }
        }
  }

  days.forEach((day, index) => {
    const sessionsToday = sessions.filter((s) => s.date === day.date)
    const cardioToday = cardio.filter((c) => c.date === day.date)
    const bc = bodyByDate.get(day.date)

    L.push('', '---', '')
    /* The heading carries the WEEKDAY, the ISO DATE and what the day was for.
       The date is spelled in full rather than as "30 Aug": every other date in
       this document is ISO, a reader pasting the week into a model will ask
       about `2026-09-03` and not about "3 Sep", and a friendly date with no
       year makes the reader infer one. `dayOfMonth` still serves the places a
       date is a label rather than a key — a lever's span, the body-composition
       table, a soreness attribution. */
    L.push(`## DAY ${index + 1} · ${day.weekdayLabel} · ${day.date} · ${
      day.isTrainingDay ? 'TRAIN' : 'REST'}${
      sessionsToday.length ? ` — ${sessionsToday.map((s) => s.label).join(' + ')}` : ''}`)
    L.push('')

    /** Rows that had nothing at all, named once at the foot of the day. */
    const missing: string[] = []
    const put = (name: string, row: string | null) => {
      if (row) L.push(row)
      else missing.push(name)
    }

    // SLEEP
    put('sleep', some(day.sleepMin, day.deepMin, day.remMin, day.bedTime, day.wakeTime)
      ? dayRow('Sleep', line(
        hm(day.sleepMin) ?? NO_DATA,
        some(day.deepMin, day.remMin, day.coreMin, day.awakeMin)
          ? `deep ${hm(day.deepMin) ?? NO_DATA} · REM ${hm(day.remMin) ?? NO_DATA}`
            + ` · core ${hm(day.coreMin) ?? NO_DATA} · awake ${hm(day.awakeMin) ?? NO_DATA}`
          : null,
        day.bedTime || day.wakeTime ? `${clock(day.bedTime)} → ${clock(day.wakeTime)}` : null,
        day.sleepOnsetTrouble == null ? null
          : day.sleepOnsetTrouble ? 'trouble falling asleep' : 'fell asleep easily',
        day.sleepInaccurate ? '⚠ the wearer disputes this night' : null,
      ))
      : null)

    // VITALS
    put('vitals', partialRow('Vitals', [
      ['HRV', val(day.hrvMs, 1) == null ? null : `HRV ${val(day.hrvMs, 1)} ms`],
      ['RHR', val(day.restingHr) == null ? null : `RHR ${val(day.restingHr)}`],
      ['avg HR', val(day.avgHr) == null ? null : `avg HR ${val(day.avgHr)}`],
      ['SpO₂', val(day.bloodOxygenPct) == null ? null : `SpO₂ ${val(day.bloodOxygenPct)} %`],
      ['respiratory rate', val(day.respiratoryRate, 1) == null ? null : `resp ${val(day.respiratoryRate, 1)} /min`],
      // The SIGN is the finding: +0.2 °C and −0.2 °C are opposite readings.
      ['wrist temp', signed(day.wristTempDeltaC) == null ? null : `wrist temp ${signed(day.wristTempDeltaC)} °C`],
      ['VO₂max', val(day.vo2max, 1) == null ? null : `VO₂max ${val(day.vo2max, 1)}`],
    ]))

    // BODY
    // A compartment stated as a PERCENTAGE and a MASS together. A percentage of
    // a falling bodyweight can rise while the tissue shrinks; kilograms cannot
    // lie that way, and a cut is exactly where that matters.
    const both = (word: string, pct: number | null | undefined, kg: number | null | undefined, dp = 1): string | null =>
      pct == null && kg == null ? null
        : pct == null ? `${word} ${val(kg, dp)} kg`
        : kg == null ? `${word} ${val(pct, 1)} %`
        : `${word} ${val(pct, 1)} % (${val(kg, dp)} kg)`
    const bodyRow = bc
      ? partialRow('Body', [
        ['weight', ((w) => (w == null ? null : `${w} kg`))(val(bc.weightKg, 1) ?? val(day.weightKg, 1))],
        ['body fat', both('BF', bc.bodyFatPct, bc.fatMassKg)],
        ['muscle', both('muscle', bc.musclePercent, bc.muscleMassKg)],
        ['skeletal muscle', val(bc.skeletalMuscleMassKg, 1) == null ? null : `SMM ${val(bc.skeletalMuscleMassKg, 1)} kg`],
        ['fat-free mass', val(bc.fatFreeMassKg, 1) == null ? null : `FFM ${val(bc.fatFreeMassKg, 1)} kg`],
        ['water', both('water', bc.waterPercent, bc.waterMassKg)],
        ['protein', both('protein', bc.proteinPercent, bc.proteinMassKg)],
        ['bone', val(bc.boneMineralKg, 2) == null ? null : `bone ${val(bc.boneMineralKg, 2)} kg`],
        ['visceral fat', val(bc.visceralFat, 1) == null ? null : `visceral ${val(bc.visceralFat, 1)}`],
        ['BMI', val(bc.bmi, 1) == null ? null : `BMI ${val(bc.bmi, 1)}`],
        ['waist-to-hip', val(bc.estimatedWaistToHipRatio, 2) == null ? null : `WHR ${val(bc.estimatedWaistToHipRatio, 2)}`],
        ['BMR', val(bc.bmr) == null ? null : `BMR ${val(bc.bmr)} kcal`],
      ])
      : day.weightKg != null
        ? dayRow('Body', line(`${val(day.weightKg, 1)} kg`, stat('BMR', day.bmrKcal, ' kcal')))
        // The reason, not a blank. A skipped weigh-in with no stored reason
        // resolves to the protocol default rather than to "unknown".
        : dayRow('Body', line(
          `no weigh-in — ${weighInSkipReason(day.weighInSkipReason)}`,
          day.bmrKcal != null ? stat('BMR', day.bmrKcal, ' kcal')
            : bmrs[index] != null ? `BMR ${val(bmrs[index])} kcal *(carried)*` : null,
        ))
    put('body composition', bodyRow)

    // READINESS
    const fatigue = fatigueLabelsFor(day.isTrainingDay).map((slot) => {
      const hit = (input.fatigue ?? []).find((f) => f.date === day.date && f.slot === slot)
      return `${slot.toLowerCase()} ${hit ? `${hit.level} ${hit.label}` : NO_DATA}`
    })
    const doms = input.doms.filter((x) => x.date === day.date).map((x) => {
      const from = x.sourceLabel
        ? ` *(from ${x.sourceLabel}${x.sourceDate ? `, ${dayOfMonth(x.sourceDate)}` : ''})*`
        : ''
      return `${domsReadable(x)} ${x.severity}${from}`
    })
    const joints = (input.joints ?? []).filter((x) => x.date === day.date).map(jointReadable)
    put('readiness', dayRow('Readiness', [
      `fatigue ${fatigue.join(SEP)}`,
      `DOMS ${doms.length ? doms.join(SEP) : NONE}`,
      `joints ${joints.length ? joints.join(SEP) : NONE}`,
    ].join(' — ')))

    // HEAD
    const head = (input.stress ?? []).filter((x) => x.date === day.date)
    put('head', dayRow('Head', head.length
      ? head.map((h) => {
        const tags = h.tags?.length ? ` — ${h.tags.join(', ')}` : ''
        const note = phrase(h.note)
        return `${h.slot} ${h.level} ${h.label}${tags}${note ? ` — “${note}”` : ''}`
      }).join(SEP)
      : NO_DATA))

    // INTAKE
    // The rung in force ON THIS DAY, not the goal row as it stands today. A
    // lever pulled on Wednesday does not retroactively re-target Sunday.
    const goalOf = (d: ExportDay, pick: (g: TargetPeriod['goals']) => number | null): number | null => {
      const period = periods.find((p) => p.dates.includes(d.date))
      return period ? pick(period.goals) : null
    }
    // A macro the day was NOT graded on prints its figure and says so. A target
    // inherited from the rung would invent a miss out of a restaurant meal.
    const macro = (what: string, got: number | null, goal: number | null, tracked?: boolean | null) =>
      tracked === false ? `${val(got) ?? NO_DATA} ${what} *(not tracked)*`
        : goal == null ? `${val(got) ?? NO_DATA} ${what}`
        : `${val(got) ?? NO_DATA} / ${val(goal)} ${what}`
    put('intake', some(day.calories, day.proteinG, day.carbsG, day.fatG, day.waterMl)
      ? dayRow('Intake', line(
        macro('kcal', day.calories, goalOf(day, (g) => g.calorie) ?? input.calorieGoal),
        macro('P', day.proteinG, goalOf(day, (g) => g.protein) ?? input.proteinGoalG),
        macro('C', day.carbsG, goalOf(day, (g) => g.carbs), day.trackCarbs),
        macro('F', day.fatG, goalOf(day, (g) => g.fat), day.trackFat),
        `water ${val(day.waterMl == null ? null : day.waterMl / 1000, 2) ?? NO_DATA}`
          + ` / ${val(input.waterGoalMl == null ? null : input.waterGoalMl / 1000, 2) ?? NO_DATA} L`,
      ))
      : null)

    // MICROS — the exceptions only. The full picture is the weekly table.
    const hasMicros = Object.keys(day.nutrientsFood ?? {}).length
      || Object.keys(day.nutrientsStack ?? {}).length
    const exceptions = microExceptions(day)
    put('micronutrients', hasMicros
      ? dayRow('Micros', exceptions.length ? exceptions.join(SEP)
        : 'every logged key on or above target')
      : null)

    // STACK
    const taken = (day.supplementsLog ?? []).map((s) =>
      `${supplementName(input.supplementProtocol, s.key)}${s.time ? ` ${s.time}` : ''}`)
    const skipped = day.supplementsSkipped ?? []
    put('stack', some(day.supplementsTaken, day.supplementsPlanned) || taken.length || skipped.length
      ? dayRow('Stack', [
        day.supplementsTaken != null && day.supplementsPlanned != null
          ? `${val(day.supplementsTaken)} of ${val(day.supplementsPlanned)}`
          : day.supplementsPlanned != null ? `${val(day.supplementsPlanned)} planned, ticks ${NO_DATA}`
          : day.supplementsTaken != null ? `${val(day.supplementsTaken)} taken`
          : null,
        // A missing `supplement_log` row means TAKEN, not skipped — which is
        // why an empty list here cannot say "none". It says the per-item ticks
        // were never written, and the count beside it is the fact.
        `**taken** ${taken.length ? taken.join(SEP) : 'no per-item log'}`,
        // Absence is NOT a skip: only an explicit `taken = false` is one. The
        // export once read a missing row as a miss and reported eight clean
        // days of August as failures.
        `**skipped** ${skipped.length ? skipped.join(SEP) : 'none logged'}`,
      ].filter((x): x is string => x != null).join(' — '))
      : null)

    // ACTIVITY
    put('activity', partialRow('Activity', [
      ['steps', val(day.steps) == null ? null : `${val(day.steps)} steps`],
      ['distance', val(day.distanceM == null ? null : day.distanceM / 1000, 2) == null
        ? null : `${val(day.distanceM as number / 1000, 2)} km`],
      ['exercise minutes', val(day.exerciseMin) == null ? null : `exercise ${val(day.exerciseMin)} min`],
      // Two independent measurements, never one `12h58` token: `standHours` is
      // how many hours held a stand, `standMin` is total standing minutes.
      ['stand ring', day.standHours == null && day.standMin == null ? null
        : `stand ${val(day.standHours) ?? NO_DATA} h (${val(day.standMin) ?? NO_DATA} min)`],
      ['daylight', val(day.daylightMin) == null ? null : `daylight ${val(day.daylightMin)} min`],
      ['active energy', val(day.activeKcal) == null ? null : `active ${val(day.activeKcal)} kcal`],
      ['training minutes', val(day.trainingMin) == null ? null : `training ${val(day.trainingMin)} min`],
    ]))

    // SHAPE — what the day was ASKED for, and what it was not graded on.
    const shape = line(
      day.targetProfile ? `${day.targetProfile}` : null,
      day.nutritionException ? `${day.nutritionException} — excepted from grading` : null,
      day.nutritionEstimated ? 'intake is an estimate' : null,
    )
    // "standard day" is a claim about a day that was LOGGED. On a day the app
    // never heard from it would assert that nothing unusual happened, which is
    // not something an empty record can say.
    put('shape', dayRow('Shape', shape
      || (some(day.calories, day.proteinG, day.steps, day.weightKg) ? 'standard day' : '')))

    // SESSIONS
    for (const s of sessionsToday) pushSession(s)
    if (!sessionsToday.length) missing.push('training')

    // CARDIO
    if (cardioToday.length) {
      L.push('')
      L.push('**Cardio**')
      for (const c of cardioToday) {
        L.push(`- ${line(
          // A hand-typed row's `created_at` is the instant it was typed, not a
          // start. Printing 21:00 for an 08:00 walk is the export inventing one.
          c.source === 'health' ? clock(c.startedAt) : `start ${NO_DATA}`,
          `**${cardioLabel(c.kind)}**`,
          `${val(c.durationMin, 1) ?? NO_DATA} min`,
          c.distanceM == null ? null : `${val(c.distanceM / 1000, 2)} km`,
          c.distanceM == null ? null : formatPace(paceMinPerKm(c.distanceM, c.durationMin)) || null,
          c.elevationM == null ? null : `${signed(c.elevationM, 0)} m`,
          stat('avg HR', c.avgHr),
          // Already inside the day's own active energy — never add it on top.
          c.kcal == null ? null : `${val(c.kcal)} kcal active${c.totalKcal == null ? '' : ` (${val(c.totalKcal)} total)`}`,
          c.effort == null ? null : `CR10 ${String(c.effort)} ${cr10Label(c.effort)}`,
          c.source === 'health' ? 'Apple Watch' : 'typed',
        )}`)
      }
    } else missing.push('cardio')

    // DERIVED — named as computed, on the line, because there is no fence here.
    const battery = batteryByDate.get(day.date)
    const tdee = tdeeKcal(bmrs[index], day.activeKcal, day.calories)
    const derivedRow = line(
      stat('load', day.readiness?.load, '', 1),
      stat('ACWR', battery?.acwr ?? day.readiness?.acwr, '', 3),
      `strain z ${signed(battery?.strainZ ?? day.readiness?.strainZ, 2) ?? NO_DATA}`,
      stat('wellness', battery?.wellness, '', 2),
      stat('TDEE', tdee, ' kcal'),
    )
    if (some(day.readiness?.load, battery?.acwr, battery?.strainZ, battery?.wellness, tdee)) {
      L.push('')
      L.push(`**Derived** *(computed by Onyx, not measured)* ${derivedRow}`)
    } else missing.push('derived figures')

    if (missing.length) {
      L.push('')
      L.push(`*Not recorded: ${missing.join(', ')}.*`)
    }
  })

  // ── WORK THE DAYS COULD NOT HOLD ──────────────────────────────────────────
  // A session or a bout dated outside the `days` array. It should not happen —
  // `fetchRange` builds both from one window — but a day-major document that
  // silently dropped a whole workout would be strictly worse than v3, which
  // printed every session in one flat section and could not have this bug.
  const dayDates = new Set(days.map((d) => d.date))
  const strandedSessions = sessions.filter((s) => !dayDates.has(s.date))
  const strandedCardio = cardio.filter((c) => !dayDates.has(c.date))
  if (strandedSessions.length || strandedCardio.length) {
    L.push('', '---', '')
    L.push('## OUTSIDE THE LOGGED DAYS')
    L.push('')
    L.push('*These fall on dates this week has no day record for. They are the '
      + 'week’s work and are counted in every total above; they simply have no '
      + 'day to sit under.*')
    // Grouped by date, not one header per session: three sessions on one day
    // printed the same date three times, and a reader counting dates would
    // have counted three days.
    for (const date of [...new Set(strandedSessions.map((s) => s.date))]) {
      L.push('')
      L.push(`**${date}**${BR}`)
      for (const s of strandedSessions.filter((x) => x.date === date)) pushSession(s)
    }
    for (const c of strandedCardio) {
      L.push('')
      L.push(`**${c.date}** · ${cardioLabel(c.kind)} · ${val(c.durationMin, 1) ?? NO_DATA} min`)
    }
  }

  // ── LEGEND AND NOTES ──────────────────────────────────────────────────────
  L.push('', '---', '')
  L.push(...legendLines())
  L.push('', '## NOTES', '')
  for (const note of EXPORT_NOTES) L.push(`- ${note}`)

  return L.join('\n')
}

/**
 * A stack item's NAME from the key its log row carries.
 *
 * The day line used to print `d3k2@07:00` — the storage key, in a document read
 * by a person. `ExportSupplement.key` is the same `schedule.key` the log is
 * written against, so the lookup is exact; an item whose key matches nothing in
 * the protocol (archived since, or logged before it was renamed) falls back to
 * the key rather than vanishing.
 */
function supplementName(
  protocol: readonly ExportSupplement[] | undefined,
  key: string,
): string {
  return protocol?.find((s) => s.key === key)?.name ?? key
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
