/**
 * DERIVED METRICS — the arithmetic, kept behind a wall.
 *
 * ── WHY THIS IS A SEPARATE MODULE AND A SEPARATE SECTION ─────────────────────
 * `weeklyExport.ts` opens with a rule it has kept for its whole life: every
 * number in the document is one the app MEASURED, and nothing is "derived,
 * averaged into existence, or estimated to fill a column". That rule is the
 * reason the export is trustworthy, and it is not up for renegotiation.
 *
 * But a reader — a coach, a model, a spreadsheet — wants deltas, rates and
 * coverage, and computing them from the raw body every time is work that will
 * be done inconsistently or not at all. So the answer is not to relax the rule;
 * it is to give the derived figures their own fenced-off address, arriving
 * AFTER every measurement they are built from, under a heading that says out
 * loud what they are.
 *
 * Three properties hold for everything in here:
 *
 *  · Every input is a figure already printed in the raw body above. Nothing in
 *    this file reaches for a table the export did not already show the reader.
 *  · Nothing is invented to fill a gap. A metric with no evidence returns null
 *    and its line says so, exactly as the raw body does with `—`.
 *  · It is pure and deterministic — same payload, same numbers, no clock.
 *
 * The one thing this file must never become is a coach. It computes; it does
 * not advise. "Tonnage +8.9%" is arithmetic. "Tonnage is up, keep going" is an
 * opinion, and opinions belong to whoever reads this, not to the exporter.
 */
import type { WeeklyExportInput, ExportDay, ExportFatigue, ExportSession, LedgerWeek } from '@/lib/reports/weeklyExport'
import { SET_QUALITY } from '@/lib/training/setTags'
import { computeMorningCharge, sleepQualityParts, stressParts } from '@/lib/scoring/battery'
import { FATIGUE_SLOTS, SLOT_LABEL, fatigueLevel } from '@/lib/recovery/fatigue'

/** Mean of the values that EXIST. Null when none do — never 0. */
function mean(xs: Array<number | null | undefined>): number | null {
  const ok = xs.filter((v): v is number => v != null && Number.isFinite(v))
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/** Sum of the values that exist. Null when none do. */
function total(xs: Array<number | null | undefined>): number | null {
  const ok = xs.filter((v): v is number => v != null && Number.isFinite(v))
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null
}

/** One week-over-week comparison, with the change stated both ways. */
export interface WeekDelta {
  label: string
  unit: string
  current: number | null
  previous: number | null
  /** Absolute change. Null when either side is missing — not 0. */
  delta: number | null
  /** Percentage change. Null when the previous value is missing OR zero. */
  pct: number | null
  /** Decimal places the figure is worth printing at. */
  digits: number
  /**
   * Print at FULL precision instead, trailing zeros dropped.
   *
   * Tonnage only. It is a sum of quarter-kilogram microloads, so "26340.00" is
   * two digits of noise and "8329.25" is two digits of real work — the same
   * reason `exact()` exists in the renderer, and the same reason a fixed
   * decimal count cannot serve both.
   */
  exact?: boolean
}

/** How many working sets carried each technique flag. */
export interface QualityTally {
  key: string
  label: string
  count: number
}

/** One movement's top-set movement WITHIN this week. */
export interface ExerciseProgression {
  name: string
  firstKg: number
  lastKg: number
  deltaKg: number
  sessions: number
}

/**
 * One day's battery v8 inputs, exactly as the scorer read them.
 *
 * The app shows `appPct`; this is everything behind it. The four `q` terms and
 * the three stress terms are the scorer's own functions run on the day line's
 * figures plus the two baselines the payload carries for the purpose — so a
 * reader can see WHICH input moved the number, which the number cannot say.
 */
export interface BatteryDay {
  date: string
  weekdayLabel: string
  /** `daily_scores.battery_pct`. Null when the app never scored the day. */
  appPct: number | null
  morningCharge: number
  ratio: number
  stagesQ: number
  hrvQ: number
  rhrQ: number
  onsetTrouble: boolean
  stress: number
  rhrTerm: number
  hrvTerm: number
  fatigueTerm: number
  /** The latest fatigue reading's word, or null when none was logged. */
  fatigueLabel: string | null
}

export interface DerivedWeek {
  deltas: WeekDelta[]
  battery: BatteryDay[]
  /** Mean effort across every RATED working set — not the session-level rating. */
  meanWorkingSetRpe: number | null
  ratedSets: number
  workingSets: number
  meanSetsPerSession: number | null
  meanVolumePerSessionKg: number | null
  failureSetShare: number | null
  quality: QualityTally[]
  flaggedSets: number
  supplementsTaken: number | null
  supplementsPlanned: number | null
  fatigueReadings: number
  fatigueSlots: number
  domsDaysLogged: number
  intakeDaysLogged: number
  weighInDays: number
  meanDeepPct: number | null
  meanRemPct: number | null
  meanAwakeMin: number | null
  progression: ExerciseProgression[]
  trainingDayKcal: number | null
  restDayKcal: number | null
}

/**
 * The previous week's totals, from the ledger.
 *
 * The ledger is EVERY week of the programme, oldest first, and the exported
 * week is normally its last row — but not always: a re-export of an older week
 * would leave later rows sitting after it. So the comparison is anchored on the
 * week's own start date rather than on array position, and returns null when
 * this week is the first the programme has (where "no previous week" is the
 * honest answer and a zero would be a fabricated one).
 */
function previousWeek(ledger: readonly LedgerWeek[] | undefined, weekStart: string): LedgerWeek | null {
  if (!ledger?.length) return null
  const earlier = ledger.filter((w) => w.weekStart < weekStart)
  if (!earlier.length) return null
  return earlier.reduce((best, w) => (w.weekStart > best.weekStart ? w : best))
}

function deltaOf(
  label: string, unit: string, digits: number,
  current: number | null, previous: number | null,
  exact = false,
): WeekDelta {
  const both = current != null && Number.isFinite(current)
    && previous != null && Number.isFinite(previous)
  return {
    label, unit, digits, exact, current, previous,
    delta: both ? current - previous : null,
    // A percentage against zero is a division by zero, not an infinite
    // improvement — the raw delta beside it already tells that story.
    pct: both && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null,
  }
}

/**
 * Top-set movement for the movements trained MORE THAN ONCE this week.
 *
 * Deliberately narrow. A real progression reading compares an exercise to the
 * last time it was performed, which may be nine days ago and outside this
 * payload — and reaching for it would mean this module fetching data the raw
 * body never showed, which is the one thing it must not do. So the claim is
 * scoped to what the week can prove: a movement trained twice in seven days,
 * and what its heaviest working set did between the two.
 *
 * Warm-ups and ghosts are excluded — neither defines a top load.
 */
function progressionWithin(sessions: readonly ExportSession[]): ExerciseProgression[] {
  const byName = new Map<string, Array<{ date: string; topKg: number }>>()
  for (const s of sessions) {
    for (const e of s.exercises) {
      const working = e.sets.filter((set) => !set.warmup && !set.ghost)
      const top = working.length ? Math.max(...working.map((set) => set.weightKg)) : null
      // An unloaded movement has no top LOAD to move; its progression lives in
      // reps, which is a different axis and not one this summary claims.
      if (top == null || !Number.isFinite(top) || top <= 0) continue
      const bucket = byName.get(e.name) ?? []
      bucket.push({ date: s.date, topKg: top })
      byName.set(e.name, bucket)
    }
  }
  const out: ExerciseProgression[] = []
  for (const [name, rows] of byName) {
    if (rows.length < 2) continue
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const firstKg = sorted[0].topKg
    const lastKg = sorted[sorted.length - 1].topKg
    out.push({ name, firstKg, lastKg, deltaKg: lastKg - firstKg, sessions: sorted.length })
  }
  // Biggest absolute movement first; ties broken by name so the order is stable.
  return out.sort((a, b) => Math.abs(b.deltaKg) - Math.abs(a.deltaKg) || a.name.localeCompare(b.name))
}

/**
 * The battery's view of each day. The LATEST fatigue slot wins, as
 * `latestFatigue` decides it — slots are compared by their position in the
 * day, not by their label's alphabet.
 */
function batteryDays(input: WeeklyExportInput): BatteryDay[] {
  const slotIndex = (label: string) => FATIGUE_SLOTS.findIndex((s) => SLOT_LABEL[s] === label)
  return input.days.map((d) => {
    const latest = (input.fatigue ?? [])
      .filter((f) => f.date === d.date)
      .reduce<ExportFatigue | null>((best, f) => (best == null || slotIndex(f.slot) > slotIndex(best.slot) ? f : best), null)
    const signals = {
      sleepHours: (d.sleepMin ?? 0) / 60, deepMinutes: d.deepMin ?? 0, remMinutes: d.remMin ?? 0,
      sleepGoalHours: input.sleepGoalHours ?? 8,
      restingHR: d.restingHr ?? undefined, baselineHR: d.restingHrBaseline ?? undefined,
      hrvMs: d.hrvMs ?? undefined, hrvBaseline: d.hrvBaseline ?? undefined,
      fatigueLevel: latest?.level ?? null,
    }
    const q = sleepQualityParts(signals)
    const st = stressParts(signals)
    const onsetTrouble = d.sleepOnsetTrouble === true
    return {
      date: d.date, weekdayLabel: d.weekdayLabel,
      appPct: d.batteryPct ?? null,
      morningCharge: computeMorningCharge(q.quality, onsetTrouble),
      ratio: q.ratio, stagesQ: q.stagesQ, hrvQ: q.hrvQ, rhrQ: q.rhrQ, onsetTrouble,
      stress: st.drain, rhrTerm: st.rhrTerm, hrvTerm: st.hrvTerm, fatigueTerm: st.fatigueTerm,
      fatigueLabel: latest ? (fatigueLevel(latest.level)?.label ?? String(latest.level)) : null,
    }
  })
}

/** Mean intake across the days matching a training/rest predicate. */
function intakeOn(days: readonly ExportDay[], training: boolean): number | null {
  return mean(days.filter((d) => d.isTrainingDay === training).map((d) => d.calories))
}

export function derivedWeek(input: WeeklyExportInput): DerivedWeek {
  const days = input.days
  const sessions = input.sessions
  const prev = previousWeek(input.ledger, input.weekStart)
  const p = prev?.totals

  const totalVolume = total(sessions.map((s) => s.volumeKg))
  const deltas: WeekDelta[] = [
    deltaOf('Total volume', 'kg', 2, totalVolume, p?.totalVolumeKg ?? null, true),
    deltaOf('Intake (avg/day)', 'kcal', 0, mean(days.map((d) => d.calories)), p?.avgKcal ?? null),
    deltaOf('Steps (avg/day)', 'steps', 0, mean(days.map((d) => d.steps)), p?.avgSteps ?? null),
    deltaOf('Bodyweight (avg)', 'kg', 2, mean(days.map((d) => d.weightKg)), p?.avgWeightKg ?? null),
    deltaOf('Water (avg/day)', 'ml', 0, mean(days.map((d) => d.waterMl)), p?.avgWaterMl ?? null),
    deltaOf('Cardio', 'min', 0, total((input.cardio ?? []).map((c) => c.durationMin)), p?.cardioMinutes ?? null),
  ]

  // ── Set-level tallies, in ONE pass ──
  const rpes: number[] = []
  let workingSets = 0, failureSets = 0, flaggedSets = 0
  const qualityCount = new Map<string, number>()
  for (const s of sessions) {
    for (const e of s.exercises) {
      for (const set of e.sets) {
        // Same exclusion the RPE-coverage figure uses upstream: a warm-up is
        // never rated by design and a ghost did not happen.
        if (set.warmup || set.ghost) continue
        workingSets += 1
        if (set.rpe != null && Number.isFinite(set.rpe)) rpes.push(set.rpe)
        if (set.failure) failureSets += 1
        if (set.quality) {
          flaggedSets += 1
          qualityCount.set(set.quality, (qualityCount.get(set.quality) ?? 0) + 1)
        }
      }
    }
  }

  const quality: QualityTally[] = [...qualityCount.entries()]
    .map(([key, count]) => ({ key, label: SET_QUALITY[key]?.label ?? key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  // ── Sleep architecture as SHARES, not minutes ──
  // 39 minutes of deep sleep means one thing after 9h and another after 5h30,
  // and the raw body already prints the minutes. The share is the reading the
  // minutes cannot give on their own.
  const deepPcts: number[] = [], remPcts: number[] = []
  for (const d of days) {
    if (d.sleepMin == null || !(d.sleepMin > 0)) continue
    if (d.deepMin != null) deepPcts.push((d.deepMin / d.sleepMin) * 100)
    if (d.remMin != null) remPcts.push((d.remMin / d.sleepMin) * 100)
  }

  const supplementsTaken = total(days.map((d) => d.supplementsTaken))
  const supplementsPlanned = total(days.map((d) => d.supplementsPlanned))

  return {
    deltas,
    battery: batteryDays(input),
    meanWorkingSetRpe: mean(rpes),
    ratedSets: rpes.length,
    workingSets,
    meanSetsPerSession: sessions.length ? workingSets / sessions.length : null,
    meanVolumePerSessionKg: sessions.length && totalVolume != null ? totalVolume / sessions.length : null,
    failureSetShare: workingSets ? (failureSets / workingSets) * 100 : null,
    quality,
    flaggedSets,
    supplementsTaken,
    supplementsPlanned,
    fatigueReadings: (input.fatigue ?? []).length,
    // Seven days, four slots. The denominator is fixed rather than counted, so
    // a week with no readings at all still reports 0 of 28 instead of 0 of 0.
    // Three slots a day, whichever kind of day it is — a training day asks
    // Waking / Before / After and a rest day asks Waking / Midday / Night, so
    // the denominator does not depend on the week's shape.
    fatigueSlots: days.length * 3,
    domsDaysLogged: new Set(input.doms.map((d) => d.date)).size,
    intakeDaysLogged: days.filter((d) => d.calories != null).length,
    weighInDays: days.filter((d) => d.weightKg != null).length,
    meanDeepPct: mean(deepPcts),
    meanRemPct: mean(remPcts),
    meanAwakeMin: mean(days.map((d) => d.awakeMin)),
    progression: progressionWithin(sessions),
    trainingDayKcal: intakeOn(days, true),
    restDayKcal: intakeOn(days, false),
  }
}
