/**
 * "Export Week" — builds a dense, structured plain-text payload of one training
 * week for pasting straight into an AI as a Weekly Summary prompt.
 *
 * Design rules:
 *  · Deterministic and pure — same input, same string (unit-testable, no clock).
 *  · Explicitly marks MISSING data as "—" rather than omitting the row, so the
 *    model can't silently assume a gap was a zero.
 *  · Leads with a role + task instruction so the paste works with no extra typing.
 */

export interface ExportDay {
  date: string                 // YYYY-MM-DD
  weekdayLabel: string         // "Mon"
  weightKg: number | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  steps: number | null
  sleepMin: number | null
  waterMl: number | null
  score: number | null
}

export interface ExportSession {
  date: string
  label: string                // "Upper A"
  volumeKg: number | null
  setCount: number | null
  durationMin: number | null
  prCount: number | null
  exercises: Array<{ name: string; sets: number; topKg: number | null; bestE1rm: number | null }>
}

export interface WeeklyExportInput {
  weekStart: string            // Sunday YYYY-MM-DD
  weekEnd: string
  programLabel: string         // "Helix Cut"
  calorieGoal: number | null
  days: ExportDay[]
  sessions: ExportSession[]
  volumeByMuscle: Array<{ muscle: string; sets: number; target: number }>
}

const n = (v: number | null | undefined, digits = 0): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

const sleep = (min: number | null): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function buildWeeklyExport(input: WeeklyExportInput): string {
  const { days, sessions, volumeByMuscle } = input
  const kcal = days.map((d) => d.calories).filter((v): v is number => v != null)
  const prot = days.map((d) => d.proteinG).filter((v): v is number => v != null)
  const steps = days.map((d) => d.steps).filter((v): v is number => v != null)
  const slept = days.map((d) => d.sleepMin).filter((v): v is number => v != null)
  const weights = days.map((d) => d.weightKg).filter((v): v is number => v != null)
  const totalVolume = sessions.reduce((s, x) => s + (x.volumeKg ?? 0), 0)
  const totalSets = sessions.reduce((s, x) => s + (x.setCount ?? 0), 0)
  const totalPRs = sessions.reduce((s, x) => s + (x.prCount ?? 0), 0)
  const weightDelta = weights.length >= 2 ? weights[weights.length - 1] - weights[0] : null

  const L: string[] = []
  L.push('You are an elite physique coach. Analyse the training week below and write a WEEKLY SUMMARY.')
  L.push('Be strictly quantitative, cite the numbers given, and never invent data — "—" means genuinely missing.')
  L.push('Cover: (1) adherence verdict, (2) what the weight trend actually means vs water noise,')
  L.push('(3) training quality + volume vs targets, (4) the single highest-leverage change for next week.')
  L.push('')
  L.push(`## WEEK ${input.weekStart} → ${input.weekEnd}  ·  ${input.programLabel}`)
  L.push(`Calorie target: ${n(input.calorieGoal)} kcal`)
  L.push('')

  L.push('### DAILY')
  L.push('day  | date       | weight | kcal | P/C/F           | steps  | sleep | water | score')
  for (const d of days) {
    L.push(
      `${d.weekdayLabel.padEnd(4)} | ${d.date} | ${n(d.weightKg, 1).padStart(6)} | ${n(d.calories).padStart(4)} | ` +
      `${n(d.proteinG)}/${n(d.carbsG)}/${n(d.fatG)}`.padEnd(15) + ` | ${n(d.steps).padStart(6)} | ` +
      `${sleep(d.sleepMin).padStart(5)} | ${n(d.waterMl == null ? null : d.waterMl / 1000, 1).padStart(5)} | ${n(d.score).padStart(5)}`,
    )
  }
  L.push('')

  L.push('### WEEK AGGREGATES')
  L.push(`avg kcal: ${n(mean(kcal))}   avg protein: ${n(mean(prot))} g   avg steps: ${n(mean(steps))}   avg sleep: ${sleep(mean(slept))}`)
  L.push(`weight: ${n(weights[0] ?? null, 1)} → ${n(weights[weights.length - 1] ?? null, 1)} kg (${weightDelta == null ? '—' : (weightDelta > 0 ? '+' : '') + weightDelta.toFixed(2)} kg)`)
  L.push(`sessions: ${sessions.length}   total volume: ${n(totalVolume)} kg   total sets: ${n(totalSets)}   PRs: ${n(totalPRs)}`)
  L.push('')

  L.push('### SESSIONS')
  if (!sessions.length) L.push('(none logged)')
  for (const s of sessions) {
    L.push(`- ${s.date} · ${s.label} — ${n(s.volumeKg)} kg, ${n(s.setCount)} sets, ${n(s.durationMin)} min, ${n(s.prCount)} PR`)
    for (const e of s.exercises) {
      L.push(`    · ${e.name}: ${e.sets} sets, top ${n(e.topKg, 1)} kg, e1RM ${n(e.bestE1rm, 1)} kg`)
    }
  }
  L.push('')

  L.push('### WEEKLY VOLUME vs TARGET (direct sets)')
  for (const m of volumeByMuscle) {
    const flag = m.target > 0 && m.sets < m.target ? ' UNDER' : m.target > 0 && m.sets > m.target * 1.3 ? ' OVER' : ''
    L.push(`- ${m.muscle}: ${m.sets}/${m.target}${flag}`)
  }

  return L.join('\n')
}
