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
import { formatSet, isUnloadedSet } from '@/lib/utils/setFormat'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { weighInSkipReason } from '@/lib/body/weighIn'
import { exceptionTag, estimatedTag } from '@/lib/nutrition/exceptionDay'
import { TEF_FACTOR, tefKcal, tdeeBreakdown } from '@/lib/nutrition/energy'
import { volumeZone, type VolumeZone } from '@/lib/training/landmarks'

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
  waterMl: number | null
  supplementsTaken: number | null
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
  side: 'L' | 'R' | null
  failure: boolean
  /** Ramp-up set. Exported and tagged, never silently dropped. */
  warmup?: boolean
  /** Unilateral pairs share a pairId so L and R collapse into one numbered set. */
  pairId: string | null
}

export interface ExportExercise {
  name: string
  sets: ExportSet[]
  topKg: number | null
  /** Programmed rep window, when the exercise is in the active program. */
  repWindow: string | null
}

export interface ExportSession {
  date: string
  label: string                // "Upper A"
  volumeKg: number | null
  setCount: number | null
  /** Working sets taken to failure. */
  failureSets: number | null
  durationMin: number | null
  avgBpm: number | null
  caloriesBurned: number | null
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
  prs: Array<{ name: string; weightKg: number; reps: number; axes: PrAxis[] }>
}

export interface ExportDoms {
  date: string
  muscle: string
  severity: number
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
  /**
   * The PREVIOUS week's complete export, appended verbatim at the bottom under
   * its own heading.
   *
   * One clipboard payload carrying two weeks: a model handed a single week can
   * only describe it, while two weeks let it see a direction. Passed as a
   * finished string rather than as another `WeeklyExportInput` so the recursion
   * is structurally impossible — week X-1's payload is built by a caller that
   * leaves this field unset, so X-2 can never be dragged in behind it.
   */
  previousWeekMarkdown?: string
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

const sleep = (min: number | null | undefined): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

/**
 * Render one exercise's working sets.
 *
 * Bilateral sets group by load — "60kg × 12,11,10" — the pattern that shows
 * whether a load is being outgrown. Sets carry a spelled-out (Failure) or
 * (Warmup) tag: "(F)" and "(W)" are cheap for us to write and ambiguous for
 * whoever (or whatever) reads the export back.
 *
 * Unilateral work (sets carrying a `side`/`pairId`) is split L vs R per numbered
 * set — "S1 L 20kg×12 · R 20kg×11(F)" — because the two sides genuinely differ
 * and collapsing them hides exactly the asymmetry the export exists to surface.
 *
 * UNLOADED WORK IS NOT WRITTEN AS A LOAD. "0kg × 17" states a weight that does
 * not exist and buries the only number the set has; a hold gets seconds and
 * bodyweight work gets reps. `exerciseName` is what tells the two apart — the
 * weight is 0 either way.
 */
export function setDetail(sets: ExportSet[], exerciseName?: string): string {
  if (!sets.length) return '—'
  const sided = sets.some((s) => s.side != null)
  const timed = isTimedExercise(exerciseName)
  // `tight` keeps the L/R columns as narrow as they have always been — that line
  // already carries two sets, and the spacing is the only thing holding it on
  // one row.
  const fmt = (w: number, reps: number | string, tight = false) =>
    timed ? `${reps} sec`
      : isUnloadedSet(w) ? `${reps} reps`
      : tight ? `${w}kg×${reps}` : `${w}kg × ${reps}`

  if (!sided) {
    // Group consecutive same-load sets; append (F) to a group with any failure.
    const groups: Array<{ w: number; reps: number[]; fail: boolean; warm: boolean }> = []
    for (const s of sets) {
      const last = groups[groups.length - 1]
      const warm = s.warmup === true
      // A warm-up never merges into a working group at the same load — that
      // would read as an extra work set.
      if (last && last.w === s.weightKg && last.warm === warm) { last.reps.push(s.reps); last.fail ||= s.failure }
      else groups.push({ w: s.weightKg, reps: [s.reps], fail: s.failure, warm })
    }
    return groups.map((g) => {
      const tag = g.warm ? ' (Warmup)' : g.fail ? ' (Failure)' : ''
      return `${fmt(g.w, g.reps.join(','))}${tag}`
    }).join(' · ')
  }

  // Unilateral: pair L/R by pairId, preserving first-seen order.
  const order: string[] = []
  const pairs = new Map<string, { L?: ExportSet; R?: ExportSet }>()
  let solo = 0
  for (const s of sets) {
    const key = s.pairId ?? `solo-${solo++}`
    if (!pairs.has(key)) { pairs.set(key, {}); order.push(key) }
    const p = pairs.get(key)!
    if (s.side === 'R') p.R = s
    else p.L = s   // 'L' or an unsided straggler both read as the left column
  }
  const side = (s: ExportSet | undefined, tag: 'L' | 'R') =>
    s ? `${tag} ${fmt(s.weightKg, s.reps, true)}${s.warmup ? ' (Warmup)' : s.failure ? ' (Failure)' : ''}` : null
  return order.map((key, i) => {
    const p = pairs.get(key)!
    const cols = [side(p.L, 'L'), side(p.R, 'R')].filter(Boolean).join(' · ')
    return `S${i + 1} ${cols}`
  }).join(' · ')
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
}

export function energyBalance(days: readonly ExportDay[]): EnergyBalance {
  const empty: EnergyBalance = {
    daysCounted: 0, intakeKcal: null, expenditureKcal: null, balanceKcal: null,
    avgBalanceKcal: null, avgBmrKcal: null, avgActiveKcal: null, avgTefKcal: null,
    bmrCarried: false,
  }
  const measured = days.map((d) => (d.bmrKcal != null && Number.isFinite(d.bmrKcal) ? d.bmrKcal : null))
  // Forward fill, then backward fill — the nearest reading in either direction.
  const filled = [...measured]
  for (let i = 1; i < filled.length; i++) filled[i] ??= filled[i - 1]
  for (let i = filled.length - 2; i >= 0; i--) filled[i] ??= filled[i + 1]

  let intake = 0, burn = 0, bmrSum = 0, activeSum = 0, tefSum = 0, counted = 0, carried = false
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
  L.push(`**Targets:** ${n(input.calorieGoal)} kcal · ${n(input.proteinGoalG)} g protein · `
    + `${n(input.stepsGoal)} steps · ${n(input.sleepGoalHours, 1)} h sleep`)
  L.push('')

  // Session labels per date — for the readable daily log below.
  const labelsByDate = new Map<string, string[]>()
  for (const s of sessions) {
    const arr = labelsByDate.get(s.date) ?? []
    arr.push(s.label)
    labelsByDate.set(s.date, arr)
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
    L.push(`- Highest DOMS: ${w.peakDoms
      ? `${w.peakDoms.muscle} — ${dLabel[w.peakDoms.severity] ?? w.peakDoms.severity} (${w.peakDoms.date})`
      : 'none reported'}`)
    L.push('')
  }

  // ── Readable per-day log (one line per day, all data · no tables) ──
  // FIXED ORDER: sleep → intake (food) → water → steps, then the vitals and the
  // day's workout. The deep InBody reading and any walks nest under the day.
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
    const workout = performed?.join(' + ') ?? (d.isTrainingDay ? 'not logged' : 'rest')
    const macros = [d.proteinG, d.carbsG, d.fatG].some((v) => v != null)
      ? ` (${n(d.proteinG)}P/${n(d.carbsG)}C/${n(d.fatG)}F)` : ''
    L.push(
      `- **${d.weekdayLabel} ${d.date}** · ${performed || d.isTrainingDay ? 'Train' : 'Rest'}`
      + `${offPlan ? ' (off-plan / swapped)' : ''} · `
      // The tag sits ON the intake it explains, not at the end of the line —
      // a reader (human or model) meeting "3210 kcal" needs the reason in the
      // same breath, not eight fields later.
      + `sleep ${sleep(d.sleepMin)} · intake ${n(d.calories)} kcal${macros}`
      + `${exceptionTag(d.nutritionException)}${estimatedTag(d.nutritionEstimated)} · `
      + `water ${n(d.waterMl == null ? null : d.waterMl / 1000, 1)} L · ${n(d.steps)} steps · `
      // The daily weigh-in belongs on the daily line. It used to appear ONLY in
      // the nested InBody row, which is emitted for full scale readings — so a
      // weight-only morning exported no weight at all, and a skipped one was
      // indistinguishable from a day that was never opened.
      + `RHR ${n(d.restingHr)} · HRV ${n(d.hrvMs)} · ${weighIn(d.weightKg, d.weighInSkipReason)} · ${workout}`,
    )
    // NO WEIGHT, NO READING. A scale reading is anchored on a bodyweight —
    // every mass below is derived from one — so a row that has lost its weight
    // is not a partial measurement, it is a fragment. 2026-08-02 carries a
    // skeletal-muscle figure and a waist:hip ratio and nothing else, which
    // printed two lines of twenty em-dashes: visually a catastrophic weigh-in,
    // actually a sync that dropped the weight. The day line above already says
    // `weight — [Skip: …]`, which is the whole truth about that day.
    const b = bodyByDate.get(d.date)
    if (b && b.weightKg != null && Number.isFinite(b.weightKg)) {
      // Percentages first (what the scale shows), then every compartment in
      // absolute kg (what actually moved). Both, every day, named every time —
      // an omitted field is indistinguishable from a zero to whoever reads this.
      L.push(
        `    InBody · weight ${n(b.weightKg, 1)} kg · BMI ${n(b.bmi, 1)} · BF ${n(b.bodyFatPct, 1)}% · `
        + `muscle ${n(b.musclePercent, 1)}% · water ${n(b.waterPercent, 1)}% · visceral ${n(b.visceralFat)} · `
        + `BMR ${n(b.bmr)} · bone ${n(b.boneMineral, 1)}%`,
      )
      L.push(
        `    Mass · lean mass ${n(b.muscleMassKg, 1)} kg · skeletal muscle ${n(b.skeletalMuscleMassKg, 1)} kg · `
        + `fat mass ${n(b.fatMassKg, 1)} kg · protein ${n(b.proteinMassKg, 1)} kg · `
        + `bone mineral ${n(b.boneMineralKg, 2)} kg · body water ${n(b.waterMassKg, 1)} kg · `
        + `fat-free mass ${n(b.fatFreeMassKg, 1)} kg · est. waist:hip ${n(b.estimatedWaistToHipRatio, 2)}`,
      )
    }
    for (const c of cardioByDate.get(d.date) ?? []) {
      // EVERY metric is named, EVERY time. This used to drop absent fields from
      // the line, which reads fine until you compare two walks: one showing
      // "avg HR 112" and one not, with no way to tell whether the second had no
      // heart-rate reading or whether the exporter simply didn't carry it. An
      // em-dash says "not recorded" — which is information — while a 0 would be
      // a lie, and printing zeros is still forbidden.
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
      L.push(`    ${cardioLabel(c.kind)} · ${bits} (Already accounted for in daily steps and calories)`)
    }
  }
  L.push('')

  // "Week aggregates" and "vs previous week" USED to sit here. Both were
  // derived: every number in them is a sum or a difference of the daily rows
  // already printed above. Pre-chewing the data invites the reader to trust the
  // summary over the source, and a stale aggregate is worse than none.

  // ── Sessions, with every set ──
  L.push('## Sessions')
  L.push('')
  if (!sessions.length) L.push('_None logged this week._')
  for (const s of sessions) {
    L.push(`### ${s.date} · ${s.label}`)
    // Volume · sets · failures · time · kcal burned · avg HR — all metadata.
    L.push(`${exact(s.volumeKg)} kg volume · ${n(s.setCount)} sets · ${n(s.failureSets)} to failure`
      + ` · ${n(s.durationMin)} min · ${n(s.caloriesBurned)} kcal`
      + `${s.avgBpm != null ? ` · avg HR ${n(s.avgBpm)}` : ''}`
      // Borg CR10 — the subjective cost of the session, next to its objective cost.
      // Always printed. A missing segment is indistinguishable from a session
      // logged at effort 0, so the absence is stated rather than implied.
      + ` · effort ${s.sessionRpe != null ? `${n(s.sessionRpe, 1)}/10 CR10` : 'Not reported'}`)
    L.push('')
    for (const e of s.exercises) {
      L.push(`- **${e.name}**${e.repWindow ? ` _(target ${e.repWindow})_` : ''}: ${setDetail(e.sets, e.name)}`)
    }
    if (s.prs.length) {
      // No est-1RM VALUE — the raw lift only. The 1RM AXIS is named, because
      // "which record" is not the same claim as "what the estimate was".
      //
      // One line per movement, so a session's records read as a list rather
      // than a run-on: "Hack Squat 55kg × 11 — Volume, 1RM".
      L.push('- PRs:')
      for (const p of s.prs) {
        const timed = isTimedExercise(p.name)
        const axes = p.axes.length
          ? ` — ${p.axes.map((a) => prAxisLabel(a, timed)).join(', ')}`
          : ''
        L.push(`    - **${p.name}** ${formatSet(p.weightKg, p.reps, { timed })}${axes}`)
      }
    }
    L.push('')
  }

  // ── Volume vs target (line-by-line, no table) ──
  L.push('## Weekly volume vs target')
  L.push('')
  for (const m of volumeByMuscle) {
    // ONE grading rule, shared with the app (see landmarks.volumeZone): only the
    // TOTAL can clear an UNDER, only the DIRECT work can earn an OVER. Rendering
    // its own comparison here is how the export and the Command Center start
    // disagreeing about the same week.
    const status = m.target <= 0 ? '—'
      : ZONE_WORD[volumeZone(m.sets, m.target, m.directSets ?? m.sets)]
    // The split is only printed where there IS indirect work, so an isolation
    // muscle's line stays a plain count.
    const split = m.indirectSets != null && m.indirectSets > 0 && m.directSets != null
      ? ` (${m.directSets} direct + ${m.indirectSets} indirect)`
      : ''
    L.push(`- ${m.muscle}: ${m.sets} / ${m.target} sets${split} — ${status}`)
  }
  L.push('')
  L.push('_A set counts 1.0 for a muscle the movement is chosen to train and 0.5'
    + ' for one that assists, so an RDL pays hamstrings in full and glutes at'
    + ' half, and a row pays the back in full and the biceps at half. Half sets'
    + ' are real and are not rounded away. The targets are DIRECT-set landmarks,'
    + ' so the verdict is asymmetric on purpose: assistance can lift a muscle out'
    + ' of UNDER, but only direct work can put one OVER._')
  L.push('')

  // ── Soreness ──
  if (doms.length) {
    const label = ['none', 'mild', 'moderate', 'severe']
    L.push('## DOMS (soreness, 0–3)')
    L.push('')
    for (const d of doms) {
      L.push(`- ${d.date} · ${d.muscle}: ${d.severity} (${label[d.severity] ?? d.severity})`)
    }
    L.push('')
  }

  // Body composition is nested under each weigh-in day in "## Days" (no table).

  // ── Supplements protocol (ONE list) ──
  const protocol = input.supplementProtocol
  if (protocol?.length) {
    L.push('## Supplements protocol')
    L.push('')
    for (const s of consolidateSupplements(protocol)) L.push(`- ${s}`)
    L.push('')
  }

  // ── The cumulative ledger (LAST, on purpose) ──
  // The raw week comes first and the trajectory closes it: a reader who starts
  // with the trend anchors on it and reads the evidence to confirm. Sitting at
  // the bottom, this is context for everything already read rather than a
  // verdict announced ahead of it.
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

  // ── Weekly aggregates ──
  // Directly under the trends, and for the same reason: these are the figures a
  // reader would otherwise recompute from the daily rows above, and doing that
  // by hand across seven days and five sessions is where transcription errors
  // enter. Every number here is stated with the rule that produced it.
  {
    const tonnage = input.tonnageByMuscle ?? []
    const energy = energyBalance(days)
    const totalVolume = sum(sessions.map((s) => s.volumeKg))
    const stepDays = days.filter((d) => d.steps != null && Number.isFinite(d.steps))
    const avgSteps = meanOf(days.map((d) => d.steps))

    L.push('## Weekly aggregates')
    L.push('')

    // ── Tonnage per muscle ──
    if (tonnage.length) {
      L.push(`- **Total volume:** ${exact(totalVolume)} kg across ${sessions.length}`
        + ` session${sessions.length === 1 ? '' : 's'}`)
      L.push('- **Volume by muscle group (kg):**')
      for (const t of tonnage) {
        const assisted = t.directKg != null && t.directKg < t.volumeKg
          ? ` (${exact(t.directKg)} direct)`
          : ''
        L.push(`    - ${t.muscle}: ${exact(t.volumeKg)} kg${assisted}`)
      }
      // Said out loud because the arithmetic invites the opposite assumption.
      L.push('    - _Tonnage follows the same rule as the set counts: a movement'
        + ' credits its primary muscles in full and its assisting muscles at half.'
        + ' These rows therefore sum to MORE than the total volume above.'
        + ' Unilateral pairs are scored at the weaker side (×2), identical to the'
        + ' Session._')
    } else if (totalVolume != null) {
      L.push(`- **Total volume:** ${exact(totalVolume)} kg across ${sessions.length}`
        + ` session${sessions.length === 1 ? '' : 's'}`)
    }

    // ── Energy balance ──
    if (energy.balanceKcal != null) {
      const deficit = energy.balanceKcal < 0
      const mag = Math.abs(energy.balanceKcal)
      L.push(`- **Energy balance (estimated):** ${n(mag)} kcal ${deficit ? 'DEFICIT' : 'SURPLUS'}`
        + ` over ${energy.daysCounted} day${energy.daysCounted === 1 ? '' : 's'}`
        + ` · ${n(Math.abs(energy.avgBalanceKcal ?? 0))} kcal/day`
        + ` ${deficit ? 'under' : 'over'} maintenance`)
      L.push(`    - Intake ${n(energy.intakeKcal)} kcal vs expenditure ${n(energy.expenditureKcal)} kcal`
        + ` (${tdeeBreakdown(energy.avgBmrKcal ?? 0, energy.avgActiveKcal ?? 0, energy.avgTefKcal ?? 0)}`
        + ' kcal/day, averaged)')
      L.push('    - _ESTIMATE, not a measurement. Only days holding both an intake'
        + ' and an expenditure are counted.'
        + ` TEF is the thermic effect of food, ${Math.round(TEF_FACTOR * 1000) / 10}% of intake —`
        + ' the energy spent digesting it, which is expenditure like any other.'
        + (energy.bmrCarried
          ? ' BMR is a scale reading and exists only on weigh-in days; days without'
            + ' one inherit the nearest reading (it moves ~2 kcal a week).'
          : '')
        + '_')
    }

    // ── Steps ──
    // Spelled out because the question was asked directly: the average is over
    // every day that logged a step count. It is read from the day's own step
    // total and has never had anything to do with whether a walk was logged in
    // the cardio ledger — a cardio entry is a subset of the day's steps, not a
    // gate on them.
    L.push(`- **Steps (avg/day):** ${n(avgSteps)} across ${stepDays.length}`
      + ` day${stepDays.length === 1 ? '' : 's'} with a logged count`
      + ` (every such day counts, cardio session or not)`)

    // ── Daily shape ──
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

  // ── Previous week, verbatim ──
  // LAST of the current week's own content, so nothing above it is displaced.
  // A horizontal rule and an unmistakable heading, because the failure mode of
  // pasting two weeks into one payload is a reader that averages them together.
  if (input.previousWeekMarkdown?.trim()) {
    L.push('---')
    L.push('')
    L.push('# PREVIOUS WEEK REFERENCE (For AI Context)')
    L.push('')
    L.push('_The complete export for the week before this one, unmodified. It is'
      + ' CONTEXT for the week above, not part of it — do not merge the two when'
      + ' computing this week\'s numbers._')
    L.push('')
    L.push(input.previousWeekMarkdown.trim())
    L.push('')
  }

  // ── Provenance ──
  // The absolute last line, after everything including the previous week, so it
  // governs both. Verbatim and hardcoded on purpose: it is a standing statement
  // about the measuring instrument, not data.
  L.push('---')
  L.push('')
  L.push(APPLE_WATCH_DISCLAIMER)

  return L.join('\n')
}

/**
 * The standing caveat about instrument accuracy, printed at the very bottom of
 * every export.
 *
 * Heart rate, calories and steps all come off the watch, and a model reading
 * this data has no other way to know that a 900 kcal active-energy day is a
 * device estimate rather than a measured burn. Stating it once, last, is what
 * lets the numbers above be printed plainly.
 */
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
