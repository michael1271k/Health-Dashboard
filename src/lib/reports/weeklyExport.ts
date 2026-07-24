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
 *  · Unilateral work is split per side (L/R weight · reps · failure).
 *  · Real markdown headings and tables so it renders wherever it's pasted.
 */

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
  activeKcal: number | null
  trainingMin: number | null
  sleepMin: number | null
  deepMin: number | null
  remMin: number | null
  restingHr: number | null
  hrvMs: number | null
  waterMl: number | null
  supplementsTaken: number | null
  score: number | null
  batteryPct: number | null
}

/** One working set, in order. `side` is null on bilateral sets. */
export interface ExportSet {
  weightKg: number
  reps: number
  side: 'L' | 'R' | null
  failure: boolean
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
  exercises: ExportExercise[]
  /** Named PRs set in this session (no est-1RM — raw lift only). */
  prs: Array<{ name: string; weightKg: number; reps: number }>
}

export interface ExportDoms {
  date: string
  muscle: string
  severity: number
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
  /** Aggregates for the PREVIOUS week, for the week-over-week block. */
  previous: WeekTotals | null
}

const n = (v: number | null | undefined, digits = 0): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

const sleep = (min: number | null | undefined): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

const km = (m: number | null): string => (m == null ? '—' : (m / 1000).toFixed(2))

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
 * whether a load is being outgrown. A set taken to failure is marked with an F.
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
    const groups: Array<{ w: number; reps: number[]; fail: boolean }> = []
    for (const s of sets) {
      const last = groups[groups.length - 1]
      if (last && last.w === s.weightKg) { last.reps.push(s.reps); last.fail ||= s.failure }
      else groups.push({ w: s.weightKg, reps: [s.reps], fail: s.failure })
    }
    return groups.map((g) => `${g.w}kg × ${g.reps.join(',')}${g.fail ? ' (F)' : ''}`).join(' · ')
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
    s ? `${tag} ${s.weightKg}kg×${s.reps}${s.failure ? '(F)' : ''}` : null
  return order.map((key, i) => {
    const p = pairs.get(key)!
    const cols = [side(p.L, 'L'), side(p.R, 'R')].filter(Boolean).join(' · ')
    return `S${i + 1} ${cols}`
  }).join(' · ')
}

/** "1850 → 1910 (+60)" — or "—" when either side is missing. */
function delta(cur: number | null, prev: number | null, digits = 0): string {
  if (cur == null || prev == null) return cur == null ? '—' : n(cur, digits)
  const d = cur - prev
  const sign = d > 0 ? '+' : ''
  return `${n(cur, digits)} (${sign}${d.toFixed(digits)} vs prev)`
}

export function buildWeeklyExport(input: WeeklyExportInput): string {
  const { days, sessions, volumeByMuscle, doms, previous } = input
  const cur = weekTotals(days, sessions)
  const weightDelta = cur.weightStart != null && cur.weightEnd != null
    ? cur.weightEnd - cur.weightStart : null
  const allPRs = sessions.flatMap((s) => s.prs.map((p) => ({ ...p, date: s.date })))

  const L: string[] = []

  // Pure data — no instruction/prompt header. Starts straight at the week.
  L.push(`# WEEK ${input.weekStart} → ${input.weekEnd}${input.weekLabel ? ` · ${input.weekLabel}` : ''}`)
  L.push('')
  L.push(`**Program:** ${input.programLabel}`)
  L.push(`**Targets:** ${n(input.calorieGoal)} kcal · ${n(input.proteinGoalG)} g protein · `
    + `${n(input.stepsGoal)} steps · ${n(input.sleepGoalHours, 1)} h sleep`)
  L.push('')

  // ── Daily table ──
  L.push('## Daily')
  L.push('')
  L.push('| Day | Date | Type | Weight | kcal | P/C/F | Steps | km | Active | Sleep | Deep/REM | RHR | HRV | Water | Supps | Score | Battery |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const d of days) {
    L.push(
      `| ${d.weekdayLabel} | ${d.date} | ${d.isTrainingDay ? 'Train' : 'Rest'} | ${n(d.weightKg, 1)} | `
      + `${n(d.calories)} | ${n(d.proteinG)}/${n(d.carbsG)}/${n(d.fatG)} | ${n(d.steps)} | ${km(d.distanceM)} | `
      + `${n(d.activeKcal)} | ${sleep(d.sleepMin)} | ${sleep(d.deepMin)}/${sleep(d.remMin)} | `
      + `${n(d.restingHr)} | ${n(d.hrvMs)} | ${n(d.waterMl == null ? null : d.waterMl / 1000, 1)} | `
      + `${n(d.supplementsTaken)} | ${n(d.score)} | ${n(d.batteryPct)} |`,
    )
  }
  L.push('')

  // ── Aggregates ──
  L.push('## Week aggregates')
  L.push('')
  L.push(`- Avg intake: **${n(cur.avgKcal)} kcal** · **${n(cur.avgProtein)} g protein**`)
  L.push(`- Avg steps: **${n(cur.avgSteps)}** · avg sleep: **${sleep(cur.avgSleepMin)}**`)
  L.push(`- Weight: **${n(cur.weightStart, 1)} → ${n(cur.weightEnd, 1)} kg** `
    + `(${weightDelta == null ? '—' : (weightDelta > 0 ? '+' : '') + weightDelta.toFixed(2)} kg)`)
  L.push(`- Training: **${cur.sessions} sessions** · **${n(cur.volumeKg)} kg** total volume · **${n(cur.sets)} sets** · **${allPRs.length} PRs**`)
  L.push('')

  // ── Week over week ──
  if (previous) {
    L.push('## vs previous week')
    L.push('')
    L.push(`- kcal/day: ${delta(cur.avgKcal, previous.avgKcal)}`)
    L.push(`- protein/day: ${delta(cur.avgProtein, previous.avgProtein)} g`)
    L.push(`- steps/day: ${delta(cur.avgSteps, previous.avgSteps)}`)
    L.push(`- sleep/night: ${sleep(cur.avgSleepMin)} (prev ${sleep(previous.avgSleepMin)})`)
    L.push(`- sessions: ${cur.sessions} (prev ${previous.sessions})`)
    L.push(`- volume: ${delta(cur.volumeKg, previous.volumeKg)} kg`)
    L.push(`- sets: ${delta(cur.sets, previous.sets)}`)
    L.push(`- weight end: ${delta(cur.weightEnd, previous.weightEnd, 1)} kg`)
    L.push('')
  }

  // ── Sessions, with every set ──
  L.push('## Sessions')
  L.push('')
  if (!sessions.length) L.push('_None logged this week._')
  for (const s of sessions) {
    L.push(`### ${s.date} · ${s.label}`)
    // Volume · sets · failures · time · kcal burned · avg HR — all metadata.
    L.push(`${n(s.volumeKg)} kg volume · ${n(s.setCount)} sets · ${n(s.failureSets)} to failure`
      + ` · ${n(s.durationMin)} min · ${n(s.caloriesBurned)} kcal`
      + `${s.avgBpm != null ? ` · avg HR ${n(s.avgBpm)}` : ''}`)
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

  // ── Volume vs target ──
  L.push('## Weekly volume vs target (direct sets)')
  L.push('')
  L.push('| Muscle | Sets | Target | Status |')
  L.push('|---|---|---|---|')
  for (const m of volumeByMuscle) {
    const status = m.target <= 0 ? '—'
      : m.sets < m.target ? 'UNDER'
      : m.sets > m.target * 1.3 ? 'OVER'
      : 'on target'
    L.push(`| ${m.muscle} | ${m.sets} | ${m.target} | ${status} |`)
  }
  L.push('')

  // ── Soreness ──
  if (doms.length) {
    const label = ['none', 'mild', 'moderate', 'severe']
    L.push('## Leg soreness (DOMS, 0–3)')
    L.push('')
    for (const d of doms) {
      L.push(`- ${d.date} · ${d.muscle}: ${d.severity} (${label[d.severity] ?? d.severity})`)
    }
    L.push('')
  }

  return L.join('\n')
}
