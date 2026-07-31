/**
 * Data completeness and integrity flags.
 *
 * The report header claims a completeness percentage and lists integrity
 * concerns. Both are computed HERE rather than asked of the model: an LLM shown
 * a week with three missing days will confidently average the four it has and
 * present the result as the week's number. Stating the gap explicitly, up front,
 * is what stops every downstream verdict from being quietly wrong.
 */

export interface IntegrityDay {
  date: string
  intakeKcal: number | null
  proteinG: number | null
  steps: number | null
  sleepMin: number | null
  waterMl: number | null
  weightKg: number | null
  isTrainingDay: boolean
  hasSession: boolean
}

/** The fields that count toward completeness, and their weight. */
const TRACKED = [
  ['intakeKcal', 'Intake'],
  ['steps', 'Steps'],
  ['sleepMin', 'Sleep'],
  ['waterMl', 'Water'],
] as const

export interface IntegrityReport {
  /** 0–100, rounded. Share of tracked fields present across the week. */
  completenessPct: number
  /** Per-field presence, for the header's breakdown. */
  byField: Array<{ field: string; present: number; total: number }>
  /** Dates with no intake logged at all. */
  missingIntakeDates: string[]
  /** Scheduled training days with no session. */
  missedSessions: string[]
  /** Sessions logged on a scheduled rest day. */
  unscheduledSessions: string[]
  /** Human-readable concerns, most important first. */
  flags: string[]
}

export function integrityReport(days: readonly IntegrityDay[]): IntegrityReport {
  const total = days.length || 1

  const byField = TRACKED.map(([key, field]) => ({
    field,
    present: days.filter((d) => d[key] != null).length,
    total: days.length,
  }))

  const filled = byField.reduce((n, f) => n + f.present, 0)
  const completenessPct = Math.round((filled / (byField.length * total)) * 100)

  const missingIntakeDates = days.filter((d) => d.intakeKcal == null).map((d) => d.date)
  const missedSessions = days.filter((d) => d.isTrainingDay && !d.hasSession).map((d) => d.date)
  const unscheduledSessions = days.filter((d) => !d.isTrainingDay && d.hasSession).map((d) => d.date)
  const weighIns = days.filter((d) => d.weightKg != null).length

  const flags: string[] = []
  if (missingIntakeDates.length) {
    flags.push(
      `${missingIntakeDates.length} day${missingIntakeDates.length === 1 ? '' : 's'} without logged intake (${missingIntakeDates.join(', ')}) — weekly means are computed over the days that HAVE data and understate nothing else.`,
    )
  }
  if (weighIns < 3) {
    flags.push(`Only ${weighIns} weigh-in${weighIns === 1 ? '' : 's'} this cycle — the trend estimate is weak below 3.`)
  }
  if (missedSessions.length) {
    flags.push(`Scheduled sessions not logged: ${missedSessions.join(', ')}.`)
  }
  if (unscheduledSessions.length) {
    flags.push(`Sessions on scheduled rest days: ${unscheduledSessions.join(', ')}.`)
  }
  // Protein logged as zero on a day with real intake is almost always a
  // mis-entry rather than a genuine zero-protein day.
  const suspectProtein = days.filter((d) => d.intakeKcal != null && d.intakeKcal > 500 && (d.proteinG ?? 0) === 0)
  if (suspectProtein.length) {
    flags.push(`Intake logged without protein on ${suspectProtein.map((d) => d.date).join(', ')} — likely an incomplete entry.`)
  }
  if (completenessPct === 100 && !flags.length) flags.push('None — full week, no gaps.')

  return { completenessPct, byField, missingIntakeDates, missedSessions, unscheduledSessions, flags }
}
