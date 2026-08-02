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
 *  · Line-by-line TEXT only — no markdown tables. One line per day, in a FIXED
 *    order — sleep → intake → water → steps — with the deep body-comp reading
 *    and the day's walks/cardio nested under it.
 *
 * DELIBERATE OMISSIONS. Active Energy is not exported: HealthKit inflates it
 * (700+ kcal days that never happened) and a wrong number is worse than none.
 * Day Score and Battery are not exported either — both are HELIX's own derived
 * opinions, not measurements, and this file is raw data only.
 */
// Pace is the one derived value allowed here: it is arithmetic over two exported
// facts (distance, duration), not an opinion, and it is the unit a run is
// actually read in.
import { paceMinPerKm, formatPace } from '@/lib/cardio/metrics'

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
  /** Named PRs set in this session (no est-1RM — raw lift only). */
  prs: Array<{ name: string; weightKg: number; reps: number }>
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
}

/** The same aggregate shape for this week and the one before it. */
export interface WeekTotals {
  avgKcal: number | null
  avgProtein: number | null
  avgSteps: number | null
  avgSleepMin: number | null
  sessions: number
  volumeKg: number
  sets: number
  weightStart: number | null
  weightEnd: number | null
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
  volumeByMuscle: Array<{ muscle: string; sets: number; target: number }>
  doms: ExportDoms[]
  /** Full body-composition readings for the week's weigh-in days (optional). */
  bodyComp?: ExportBodyComp[]
  /** Walks / runs from the cardio ledger, nested under their day. */
  cardio?: ExportCardio[]
  /** Static protocol — what to take on training vs rest days (derived from the plan). */
  supplementProtocol?: { training: string[]; rest: string[] }
  /** Aggregates for the PREVIOUS week, for the week-over-week block. */
}

const n = (v: number | null | undefined, digits = 0): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

const sleep = (min: number | null | undefined): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** The numeric fields of a day, pulled out with the nulls dropped. */
type NumericDayField = {
  [K in keyof ExportDay]: ExportDay[K] extends number | null ? K : never
}[keyof ExportDay]

const pick = (days: ExportDay[], k: NumericDayField): number[] =>
  days.map((d) => d[k]).filter((v): v is number => typeof v === 'number')

/** Aggregate a set of days + sessions into the shape used for week-over-week. */
export function weekTotals(days: ExportDay[], sessions: ExportSession[]): WeekTotals {
  const weights = pick(days, 'weightKg')
  return {
    avgKcal: mean(pick(days, 'calories')),
    avgProtein: mean(pick(days, 'proteinG')),
    avgSteps: mean(pick(days, 'steps')),
    avgSleepMin: mean(pick(days, 'sleepMin')),
    sessions: sessions.length,
    volumeKg: sessions.reduce((s, x) => s + (x.volumeKg ?? 0), 0),
    sets: sessions.reduce((s, x) => s + (x.setCount ?? 0), 0),
    weightStart: weights[0] ?? null,
    weightEnd: weights[weights.length - 1] ?? null,
  }
}

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
 */
export function setDetail(sets: ExportSet[]): string {
  if (!sets.length) return '—'
  const sided = sets.some((s) => s.side != null)

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
      return `${g.w}kg × ${g.reps.join(',')}${tag}`
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
    s ? `${tag} ${s.weightKg}kg×${s.reps}${s.warmup ? ' (Warmup)' : s.failure ? ' (Failure)' : ''}` : null
  return order.map((key, i) => {
    const p = pairs.get(key)!
    const cols = [side(p.L, 'L'), side(p.R, 'R')].filter(Boolean).join(' · ')
    return `S${i + 1} ${cols}`
  }).join(' · ')
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

  // ── Readable per-day log (one line per day, all data · no tables) ──
  // FIXED ORDER: sleep → intake (food) → water → steps, then the vitals and the
  // day's workout. The deep InBody reading and any walks nest under the day.
  L.push('## Days')
  L.push('')
  for (const d of days) {
    const workout = labelsByDate.get(d.date)?.join(' + ') ?? (d.isTrainingDay ? 'not logged' : 'rest')
    const macros = [d.proteinG, d.carbsG, d.fatG].some((v) => v != null)
      ? ` (${n(d.proteinG)}P/${n(d.carbsG)}C/${n(d.fatG)}F)` : ''
    L.push(
      `- **${d.weekdayLabel} ${d.date}** · ${d.isTrainingDay ? 'Train' : 'Rest'} · `
      + `sleep ${sleep(d.sleepMin)} · intake ${n(d.calories)} kcal${macros} · `
      + `water ${n(d.waterMl == null ? null : d.waterMl / 1000, 1)} L · ${n(d.steps)} steps · `
      + `RHR ${n(d.restingHr)} · HRV ${n(d.hrvMs)} · ${workout}`,
    )
    const b = bodyByDate.get(d.date)
    if (b) {
      L.push(
        `    InBody · weight ${n(b.weightKg, 1)} kg · BMI ${n(b.bmi, 1)} · BF ${n(b.bodyFatPct, 1)}% · `
        + `muscle ${n(b.musclePercent, 1)}% · water ${n(b.waterPercent, 1)}% · visceral ${n(b.visceralFat)} · `
        + `BMR ${n(b.bmr)} · bone ${n(b.boneMineral, 1)}% · `
        + `muscle mass ${n(b.muscleMassKg, 1)} kg · fat-free mass ${n(b.fatFreeMassKg, 1)} kg`,
      )
    }
    for (const c of cardioByDate.get(d.date) ?? []) {
      const pace = paceMinPerKm(c.distanceM, c.durationMin)
      const bits = [
        c.durationMin != null ? `${n(c.durationMin)} min` : null,
        c.distanceM != null ? `${n(c.distanceM / 1000, 2)} km` : null,
        pace != null ? formatPace(pace) : null,
        c.kcal != null ? `${n(c.kcal)} active kcal` : null,
        c.totalKcal != null ? `${n(c.totalKcal)} total kcal` : null,
        c.avgHr != null ? `avg HR ${n(c.avgHr)}` : null,
        c.effort != null ? `effort ${n(c.effort, 1)}/10` : null,
      ].filter(Boolean).join(' · ')
      L.push(`    ${c.kind}${bits ? ` · ${bits}` : ''} (Already accounted for in daily steps and calories)`)
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
    L.push(`${n(s.volumeKg)} kg volume · ${n(s.setCount)} sets · ${n(s.failureSets)} to failure`
      + ` · ${n(s.durationMin)} min · ${n(s.caloriesBurned)} kcal`
      + `${s.avgBpm != null ? ` · avg HR ${n(s.avgBpm)}` : ''}`
      // Borg CR10 — the subjective cost of the session, next to its objective cost.
      // Always printed. A missing segment is indistinguishable from a session
      // logged at effort 0, so the absence is stated rather than implied.
      + ` · effort ${s.sessionRpe != null ? `${n(s.sessionRpe, 1)}/10 CR10` : 'Not reported'}`)
    L.push('')
    for (const e of s.exercises) {
      L.push(`- **${e.name}**${e.repWindow ? ` _(target ${e.repWindow})_` : ''}: ${setDetail(e.sets)}`)
    }
    if (s.prs.length) {
      // No est-1RM — the raw lift only.
      L.push(`- PRs: ${s.prs.map((p) => `${p.name} ${p.weightKg}kg × ${p.reps}`).join(' · ')}`)
    }
    L.push('')
  }

  // ── Volume vs target (line-by-line, no table) ──
  L.push('## Weekly volume vs target (direct sets)')
  L.push('')
  for (const m of volumeByMuscle) {
    const status = m.target <= 0 ? '—'
      : m.sets < m.target ? 'UNDER'
      : m.sets > m.target * 1.3 ? 'OVER'
      : 'on target'
    L.push(`- ${m.muscle}: ${m.sets} / ${m.target} sets — ${status}`)
  }
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

  // ── Supplements protocol (training vs rest days) ──
  const protocol = input.supplementProtocol
  if (protocol && (protocol.training.length || protocol.rest.length)) {
    L.push('## Supplements protocol')
    L.push('')
    L.push('**Training days**')
    if (protocol.training.length) for (const s of protocol.training) L.push(`- ${s}`)
    else L.push('- —')
    L.push('')
    L.push('**Rest days**')
    if (protocol.rest.length) for (const s of protocol.rest) L.push(`- ${s}`)
    else L.push('- —')
    L.push('')
  }

  return L.join('\n')
}
