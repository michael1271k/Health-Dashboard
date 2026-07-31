/**
 * SENTINEL-7 — the weekly telemetry audit payload.
 *
 * This builds the text you paste into an LLM. It is NOT the report: it is the
 * complete dataset plus the report's contract. Every number the report needs is
 * computed here, in TypeScript, and handed over pre-calculated — the model's job
 * is verdicts, partitioning and prose, never arithmetic.
 *
 * That split is the whole design. A model asked to compute a TDEE or a weekly
 * mean will produce something plausible, unverifiable, and different next week
 * from identical data. A model asked to interpret figures it was given can be
 * checked line by line.
 *
 * Pure and clock-free, so it is unit-testable and its output is stable.
 */
import { asciiBox, bar, targetBar, mdTable, num, signed, hhmm, pad, padStart } from '@/lib/reports/ascii'
import { tdeeForWeek, KCAL_PER_KG_FAT, TEF_RATE, KCAL_PER_STEP, type TdeeDayInput } from '@/lib/reports/tdee'
import { t4wmSeries, latestT4wm, stallStatus, type WeighIn } from '@/lib/reports/t4wm'
import { integrityReport, type IntegrityDay } from '@/lib/reports/integrity'
import { paceMinPerKm, formatPace } from '@/lib/cardio/metrics'

export const SENTINEL_TYPE = 'sentinel7'

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface SentinelDay {
  date: string
  weekdayLabel: string
  isTrainingDay: boolean
  intakeKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  steps: number | null
  sleepMin: number | null
  waterMl: number | null
  restingHr: number | null
  hrvMs: number | null
  score: number | null
}

export interface SentinelBodyComp {
  date: string
  weightKg: number | null
  bmi: number | null
  bodyFatPct: number | null
  fatMassKg: number | null
  musclePercent: number | null
  muscleMassKg: number | null
  fatFreeMassKg: number | null
  waterPercent: number | null
  visceralFat: number | null
  bmr: number | null
}

export interface SentinelSet {
  weightKg: number
  reps: number
  setType: string | null
  isPr: boolean
  side: 'L' | 'R' | null
  pairId: string | null
}

export interface SentinelExercise {
  name: string
  sets: SentinelSet[]
  /** Programmed prescription, e.g. "4 × 8–12". */
  targetRx: string | null
  /** Top working set from the cycle BEFORE this one, for the baseline column. */
  baseline: string | null
  prAxes: string[]
}

export interface SentinelSession {
  date: string
  label: string
  volumeKg: number | null
  setCount: number | null
  durationMin: number | null
  avgBpm: number | null
  caloriesBurned: number | null
  sessionRpe: number | null
  exercises: SentinelExercise[]
}

export interface SentinelCardio {
  date: string
  kind: string
  distanceM: number | null
  durationMin: number | null
  activeKcal: number | null
  totalKcal: number | null
  avgHr: number | null
  effort: number | null
}

export interface SentinelVolume {
  muscle: string
  sets: number
  target: number
  /** Exercises that reached failure on this muscle, for the failure-policy audit. */
  failureExercises: string[]
}

export interface SentinelTargets {
  calorieGoal: number | null
  proteinGoalG: number | null
  carbsGoalG: number | null
  fatGoalG: number | null
  stepsGoal: number | null
  sleepGoalHours: number | null
  waterGoalMl: number | null
  targetWeightKg: number | null
  targetBodyFatPct: number | null
  /** Signed kg/week, e.g. -0.5 on a cut. */
  rateMinKgWk: number | null
  rateMaxKgWk: number | null
}

export interface SentinelInput {
  weekStart: string
  weekEnd: string
  weekLabel: string | null
  planLabel: string
  phase: string
  days: SentinelDay[]
  bodyComp: SentinelBodyComp[]
  /** Weigh-ins INCLUDING prior weeks — T4WM needs four points. */
  weighInHistory: WeighIn[]
  sessions: SentinelSession[]
  cardio: SentinelCardio[]
  volume: SentinelVolume[]
  targets: SentinelTargets
  /** Findings the previous report raised, for the §0 changelog. */
  priorFindings: string[]
  /** Consecutive weeks already flagged as stalled, from the last report. */
  priorStalledWeeks: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const mean = (xs: Array<number | null | undefined>): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

const pct = (actual: number | null, target: number | null): string => {
  if (actual == null || target == null || target === 0) return '—'
  return `${Math.round((actual / target) * 100)}%`
}

/** "60kg × 12,11,10" / unilateral "L 20×12 · R 20×11". */
function setDetail(sets: readonly SentinelSet[]): string {
  const solo = sets.filter((s) => !s.pairId)
  const pairs = new Map<string, SentinelSet[]>()
  for (const s of sets) if (s.pairId) {
    pairs.set(s.pairId, [...(pairs.get(s.pairId) ?? []), s])
  }
  const parts: string[] = []
  const byLoad = new Map<number, number[]>()
  for (const s of solo) byLoad.set(s.weightKg, [...(byLoad.get(s.weightKg) ?? []), s.reps])
  for (const [w, reps] of byLoad) parts.push(`${w}kg × ${reps.join(',')}`)
  for (const bucket of pairs.values()) {
    const l = bucket.find((x) => x.side === 'L'), r = bucket.find((x) => x.side === 'R')
    parts.push(`L ${l?.weightKg ?? '—'}×${l?.reps ?? '—'} · R ${r?.weightKg ?? '—'}×${r?.reps ?? '—'}`)
  }
  return parts.join(' · ') || '—'
}

const statusOf = (ex: SentinelExercise): string => {
  if (ex.prAxes.length) return `PR (${ex.prAxes.join('+')})`
  if (ex.sets.some((s) => s.setType === 'failure')) return 'To failure'
  return ex.sets.length ? 'Completed' : '—'
}

// ── The builder ──────────────────────────────────────────────────────────────

export function buildSentinelExport(input: SentinelInput): string {
  const {
    weekStart, weekEnd, weekLabel, planLabel, phase, days, bodyComp,
    weighInHistory, sessions, cardio, volume, targets, priorFindings, priorStalledWeeks,
  } = input

  const L: string[] = []
  const cardioByDate = new Map<string, SentinelCardio[]>()
  for (const c of cardio) cardioByDate.set(c.date, [...(cardioByDate.get(c.date) ?? []), c])
  const sessionByDate = new Map(sessions.map((s) => [s.date, s]))

  // ── Deterministic computations ────────────────────────────────────────────
  const integrity = integrityReport(days.map((d): IntegrityDay => ({
    date: d.date, intakeKcal: d.intakeKcal, proteinG: d.proteinG, steps: d.steps,
    sleepMin: d.sleepMin, waterMl: d.waterMl,
    weightKg: bodyComp.find((b) => b.date === d.date)?.weightKg ?? null,
    isTrainingDay: d.isTrainingDay, hasSession: sessionByDate.has(d.date),
  })))

  const tdee = tdeeForWeek(days.map((d): TdeeDayInput => ({
    date: d.date,
    bmrKcal: bodyComp.find((b) => b.date === d.date)?.bmr ?? mean(bodyComp.map((b) => b.bmr)),
    intakeKcal: d.intakeKcal,
    steps: d.steps,
    sessionKcal: sessionByDate.get(d.date)?.caloriesBurned ?? null,
    cardioKcal: (cardioByDate.get(d.date) ?? []).reduce<number | null>(
      (acc, c) => (c.activeKcal == null ? acc : (acc ?? 0) + c.activeKcal), null),
  })))

  const t4Series = t4wmSeries(weighInHistory)
  const t4 = latestT4wm(weighInHistory)
  const targetRate = targets.rateMinKgWk ?? targets.rateMaxKgWk ?? null
  const stall = stallStatus(weighInHistory, targetRate, priorStalledWeeks)

  const avgIntake = mean(days.map((d) => d.intakeKcal))
  const avgProtein = mean(days.map((d) => d.proteinG))
  const avgCarbs = mean(days.map((d) => d.carbsG))
  const avgFat = mean(days.map((d) => d.fatG))
  const avgSteps = mean(days.map((d) => d.steps))
  const avgSleep = mean(days.map((d) => d.sleepMin))
  const avgWater = mean(days.map((d) => d.waterMl))

  // ── HEADER ────────────────────────────────────────────────────────────────
  L.push('```')
  L.push(asciiBox([
    'SENTINEL-7 · WEEKLY TELEMETRY AUDIT',
    '',
    `CYCLE        ${weekStart} → ${weekEnd}${weekLabel ? `  (${weekLabel})` : ''}`,
    `PLAN/PHASE   ${planLabel} · ${phase}`,
    `COMPLETENESS ${integrity.completenessPct}%  ${bar(integrity.completenessPct, 100, 20)}`,
    `INTEGRITY    ${integrity.flags.length} flag${integrity.flags.length === 1 ? '' : 's'} (see below)`,
    '',
    'VERDICT          __ / 100        ← you assign',
    'EXECUTION GRADE  __              ← you assign (A–F)',
    'STRATEGY GRADE   __              ← you assign (A–F)',
  ]))
  L.push('```')
  L.push('')
  L.push('**Integrity flags**')
  for (const f of integrity.flags) L.push(`- ${f}`)
  L.push('')

  // ── HEADLINE ──────────────────────────────────────────────────────────────
  L.push('## HEADLINE')
  L.push('')
  L.push('_2–3 sentences summarising the week. Written by you from the data below._')
  L.push('')

  // ── §0 CHANGELOG ──────────────────────────────────────────────────────────
  L.push('## §0 CHANGELOG')
  L.push('')
  if (priorFindings.length) {
    L.push(mdTable(
      ['#', 'Issue raised last cycle', 'Revised finding this cycle'],
      priorFindings.map((f, i) => [String(i + 1), f, '_your call_']),
    ))
  } else {
    L.push('_No prior findings on record — this is the baseline cycle._')
  }
  L.push('')

  // ── §1 BODY COMP MATRIX ───────────────────────────────────────────────────
  L.push('## §1 BODY COMP MATRIX')
  L.push('')
  if (bodyComp.length) {
    L.push(mdTable(
      ['Date', 'Weight', 'BMI', 'BF%', 'Fat mass', 'Muscle%', 'Muscle mass', 'FFM', 'Water%', 'Visceral', 'BMR'],
      bodyComp.map((b) => [
        b.date, num(b.weightKg, 1), num(b.bmi, 1), num(b.bodyFatPct, 1), num(b.fatMassKg, 1),
        num(b.musclePercent, 1), num(b.muscleMassKg, 1), num(b.fatFreeMassKg, 1),
        num(b.waterPercent, 1), num(b.visceralFat), num(b.bmr),
      ]),
    ))
    L.push('')
    const first = bodyComp[0], last = bodyComp[bodyComp.length - 1]
    const dW = first.weightKg != null && last.weightKg != null ? last.weightKg - first.weightKg : null
    const dF = first.fatMassKg != null && last.fatMassKg != null ? last.fatMassKg - first.fatMassKg : null
    const dM = first.muscleMassKg != null && last.muscleMassKg != null ? last.muscleMassKg - first.muscleMassKg : null
    L.push(`Scale change ${signed(dW, 2)} kg · fat mass ${signed(dF, 2)} kg · muscle mass ${signed(dM, 2)} kg.`)
    L.push('')
    L.push('**Partition the change.** Explain how much of the scale movement is true fat')
    L.push('loss versus water and glycogen. Anchors: each gram of glycogen binds ~3 g of')
    L.push('water; a full glycogen swing is ~1–1.5 kg of scale weight with zero change in')
    L.push('fat mass. Compare the fat-mass and water-percent columns against the scale')
    L.push(`column — and against the theoretical ${signed(tdee.predictedFatKg, 2)} kg from this week's energy balance (§3).`)
  } else {
    L.push('_No InBody readings this cycle — body composition cannot be assessed._')
  }
  L.push('')

  // ── §2 EXECUTIVE DASHBOARD ────────────────────────────────────────────────
  L.push('## §2 EXECUTIVE DASHBOARD')
  L.push('')
  L.push(mdTable(
    ['Metric', 'Target', 'Actual (mean)', 'Compliance'],
    [
      ['Calories', num(targets.calorieGoal), num(avgIntake), pct(avgIntake, targets.calorieGoal)],
      ['Protein (g)', num(targets.proteinGoalG), num(avgProtein), pct(avgProtein, targets.proteinGoalG)],
      ['Carbs (g)', num(targets.carbsGoalG), num(avgCarbs), pct(avgCarbs, targets.carbsGoalG)],
      ['Fat (g)', num(targets.fatGoalG), num(avgFat), pct(avgFat, targets.fatGoalG)],
      ['Steps', num(targets.stepsGoal), num(avgSteps), pct(avgSteps, targets.stepsGoal)],
      ['Sleep', targets.sleepGoalHours != null ? `${targets.sleepGoalHours}h` : '—', hhmm(avgSleep),
        pct(avgSleep, targets.sleepGoalHours != null ? targets.sleepGoalHours * 60 : null)],
      ['Water (ml)', num(targets.waterGoalMl), num(avgWater), pct(avgWater, targets.waterGoalMl)],
    ],
  ))
  L.push('')

  /**
   * Deviation, not just magnitude.
   *
   * A zero-based bar is honest but useless here: a week of 1900–2080 kcal
   * against a 1955 target renders as seven identical full bars, hiding the
   * exact variance the chart is named after. The signed Δ column carries the
   * spread; the bar carries the scale.
   */
  const dev = (v: number | null, target: number | null) =>
    v == null || target == null ? '     —' : padStart(signed(v - target, 0), 6)

  const kcalMax = Math.max(targets.calorieGoal ?? 0, ...days.map((d) => d.intakeKcal ?? 0), 1)
  L.push('**Daily intake stability** (│ marks the target · Δ is vs target)')
  L.push('```')
  for (const d of days) {
    L.push(`${pad(d.weekdayLabel, 4)} ${padStart(num(d.intakeKcal), 5)} kcal  Δ${dev(d.intakeKcal, targets.calorieGoal)}  ${targetBar(d.intakeKcal, targets.calorieGoal ?? 0, kcalMax, 20)}`)
  }
  const logged = days.map((d) => d.intakeKcal).filter((v): v is number => v != null)
  if (logged.length > 1) {
    const spread = Math.max(...logged) - Math.min(...logged)
    L.push(`     spread ${padStart(String(Math.round(spread)), 5)} kcal  (max − min over ${logged.length} logged days)`)
  }
  L.push('```')
  L.push('')

  const stepMax = Math.max(targets.stepsGoal ?? 0, ...days.map((d) => d.steps ?? 0), 1)
  L.push('**Step telemetry** (│ marks the target · Δ is vs target)')
  L.push('```')
  for (const d of days) {
    L.push(`${pad(d.weekdayLabel, 4)} ${padStart(num(d.steps), 6)}       Δ${dev(d.steps, targets.stepsGoal)}  ${targetBar(d.steps, targets.stepsGoal ?? 0, stepMax, 20)}`)
  }
  L.push('```')
  L.push('')

  // ── §3 TDEE & DEFICIT ─────────────────────────────────────────────────────
  L.push('## §3 TDEE & DEFICIT')
  L.push('')
  L.push('```')
  L.push('  BMR              ' + padStart(num(tdee.meanBmr), 6) + '  kcal   (InBody)')
  L.push(`  + TEF            ${padStart(num(tdee.meanTef), 6)}  kcal   (${Math.round(TEF_RATE * 100)}% of intake)`)
  L.push(`  + NEAT           ${padStart(num(tdee.meanNeat), 6)}  kcal   (${KCAL_PER_STEP} kcal/step — estimate)`)
  L.push('  + EAT            ' + padStart(num(tdee.meanEat), 6) + '  kcal   (sessions + cardio)')
  L.push('  ─────────────────────────')
  L.push('  = TDEE           ' + padStart(num(tdee.meanTdee), 6) + '  kcal/day')
  L.push('  − INTAKE         ' + padStart(num(tdee.meanIntake), 6) + '  kcal/day')
  L.push('  ─────────────────────────')
  L.push('  = BALANCE        ' + padStart(signed(tdee.meanBalance, 0), 6) + '  kcal/day')
  L.push('')
  L.push(`  Weekly total     ${padStart(signed(tdee.totalBalance, 0), 6)}  kcal`)
  L.push(`  ÷ ${KCAL_PER_KG_FAT} kcal/kg   ${padStart(signed(tdee.predictedFatKg, 2), 6)}  kg predicted fat change`)
  L.push('```')
  L.push('')
  L.push(mdTable(
    ['Date', 'BMR', 'TEF', 'NEAT', 'EAT', 'TDEE', 'Intake', 'Balance'],
    tdee.days.map((d) => [
      d.date, num(d.bmr), num(d.tef), num(d.neat), num(d.eat), num(d.tdee), num(d.intake), signed(d.balance, 0),
    ]),
  ))
  L.push('')
  L.push('_NEAT uses a per-step coefficient, not a measurement. Treat the TDEE as an')
  L.push('estimate and reconcile it against the observed scale trend in §4 — where the')
  L.push('two disagree, the scale wins and the coefficient is what needs adjusting._')
  L.push('')

  // ── §4 WEIGHT SUMMARY ─────────────────────────────────────────────────────
  L.push('## §4 WEIGHT SUMMARY')
  L.push('')
  L.push('T4WM = Trailing-4 Weigh-in Mean. Daily scale weight swings ±1 kg on gut')
  L.push('content, glycogen and hydration — more than a week of real fat loss — so the')
  L.push('trend is read from the 4-point mean, never from two single mornings.')
  L.push('')
  if (t4Series.length) {
    L.push(mdTable(
      ['Date', 'Weigh-in', 'T4WM'],
      t4Series.slice(-8).map((p) => [p.date, num(p.weightKg, 2), p.t4wm != null ? num(p.t4wm, 2) : '— (needs 4)']),
    ))
  } else {
    L.push('_No weigh-ins on record._')
  }
  L.push('')
  L.push(`Current T4WM **${num(t4, 2)} kg** · target rate ${signed(targetRate, 2)} kg/wk · observed ${signed(stall.deltaKg, 2)} kg over the comparison window.`)
  L.push('')
  L.push(`**Stall protocol: ${stall.label}** — ${stall.detail}`)
  L.push('')
  L.push(mdTable(
    ['Lever', 'Trigger', 'Action'],
    [
      ['1 · NEAT', 'Trend flat 2 weeks', 'Add ~1,500 steps/day. Food untouched.'],
      ['2 · Intake', 'Still flat after Lever 1', 'Cut ~100 kcal/day from carbs. Protein held.'],
      ['3 · Diet break', '3+ weeks stalled, adherence intact', 'A maintenance week — not a deeper cut.'],
    ],
  ))
  L.push('')

  // ── §5 SESSION ANALYTICS ──────────────────────────────────────────────────
  L.push('## §5 SESSION ANALYTICS')
  L.push('')
  if (!sessions.length) L.push('_No sessions logged this cycle._')
  for (const s of sessions) {
    L.push(`### ${s.date} · ${s.label}`)
    L.push(
      `${num(s.volumeKg)} kg volume · ${num(s.setCount)} sets · ${num(s.durationMin)} min`
      + `${s.avgBpm != null ? ` · avg HR ${num(s.avgBpm)}` : ''}`
      + `${s.caloriesBurned != null ? ` · ${num(s.caloriesBurned)} kcal` : ''}`
      + `${s.sessionRpe != null ? ` · effort ${num(s.sessionRpe, 1)}/10 CR10` : ''}`,
    )
    L.push('')
    L.push(mdTable(
      ['Exercise', 'Executed', 'Target Rx', 'Pre-cycle baseline', 'Status'],
      s.exercises.map((e) => [e.name, setDetail(e.sets), e.targetRx ?? '—', e.baseline ?? '—', statusOf(e)]),
    ))
    L.push('')
  }
  if (cardio.length) {
    L.push('### Cardio')
    L.push(mdTable(
      ['Date', 'Kind', 'Duration', 'Distance', 'Pace', 'Active kcal', 'Total kcal', 'Avg HR', 'Effort'],
      cardio.map((c) => [
        c.date, c.kind, c.durationMin != null ? `${num(c.durationMin)} min` : '—',
        c.distanceM != null ? `${num(c.distanceM / 1000, 2)} km` : '—',
        formatPace(paceMinPerKm(c.distanceM, c.durationMin)),
        num(c.activeKcal), num(c.totalKcal), num(c.avgHr), c.effort != null ? `${num(c.effort, 1)}/10` : '—',
      ]),
    ))
    L.push('')
    L.push('_Cardio energy is already inside the day\'s steps and active calories — never add it on top._')
    L.push('')
  }

  // ── §6 MEV TARGET AUDIT ───────────────────────────────────────────────────
  L.push('## §6 MEV TARGET AUDIT')
  L.push('')
  L.push(mdTable(
    ['Muscle', 'Target sets', 'Actual', 'Δ', 'Status'],
    volume.map((v) => {
      const d = v.sets - v.target
      const status = v.target <= 0 ? '—' : d < 0 ? 'UNDER' : d > v.target * 0.3 ? 'OVER' : 'on target'
      return [v.muscle, String(v.target), String(v.sets), signed(d, 0), status]
    }),
  ))
  L.push('')
  const volMax = Math.max(1, ...volume.map((v) => Math.max(v.sets, v.target)))
  L.push('```')
  for (const v of volume) {
    L.push(`${pad(v.muscle, 12)} ${padStart(String(v.sets), 3)}/${padStart(String(v.target), 2)}  ${targetBar(v.sets, v.target, volMax, 20)}`)
  }
  L.push('```')
  L.push('')
  L.push('**Failure policy review.** Failure is bought with recovery, so it is spent only')
  L.push('where the cost is lowest: single-joint and machine work, last set only.')
  L.push('Compounds and anything spinal-loaded stop 1–2 reps short. Rank the list below')
  L.push('against that rule and name any exercise that should not have been taken there.')
  L.push('')
  const failures = volume.filter((v) => v.failureExercises.length)
  if (failures.length) {
    L.push(mdTable(
      ['Muscle', 'Taken to failure'],
      failures.map((v) => [v.muscle, v.failureExercises.join(', ')]),
    ))
  } else {
    L.push('_No sets taken to failure this cycle._')
  }
  L.push('')

  // ── §7 DIRECTIVES ─────────────────────────────────────────────────────────
  L.push('## §7 DIRECTIVES')
  L.push('')
  L.push('_Priority-ranked, actionable next steps. One line each, most important first._')
  L.push('_Each must name the specific number or session it responds to._')
  L.push('')
  L.push('1. …')
  L.push('2. …')
  L.push('3. …')
  L.push('')

  // ── Generation rules ──────────────────────────────────────────────────────
  L.push('---')
  L.push('')
  L.push('## GENERATION RULES')
  L.push('')
  L.push('Return the report using the exact headings above, in order.')
  L.push('')
  L.push('1. **Never invent a number.** Every figure above is pre-computed. Use them as')
  L.push('   given. If something is `—` it was not recorded; write "No data" and move on.')
  L.push('2. **Do not recompute.** Means, TDEE, T4WM and completeness are already correct.')
  L.push('   If you disagree with one, say so in §0 — do not silently substitute your own.')
  L.push('3. **Percentages need both operands.** No baseline, no percentage.')
  L.push('4. **Honour the integrity flags.** A metric with missing days is a weak signal,')
  L.push('   and any verdict resting on it must say so.')
  L.push('5. Fill in VERDICT (/100), EXECUTION GRADE and STRATEGY GRADE in the header box.')
  L.push('   Execution = did he do what the plan asked. Strategy = was the plan right.')
  L.push('   These are independent: perfect execution of a wrong plan is A / D.')
  L.push('6. Keep ASCII tables and charts inside fenced code blocks, unchanged.')
  L.push('')

  return L.join('\n')
}
