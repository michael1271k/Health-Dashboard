/**
 * The aggregation behind FIVE charts — Muscle Balance, Volume by Body Part,
 * Muscle Freshness, Volume Stream and the Muscle Contour Map. PURE, so the
 * arithmetic can be tested without a database.
 *
 * It lived inside `useMuscleAnalytics`' queryFn, which meant the only way to
 * check any of it was to look at the rendered chart and decide whether the
 * numbers felt right.
 */

/** Canonicalize Hevy muscle tags into the 6 display groups (v5.1 aliases included). */
export const MUSCLE_MAP: Record<string, string> = {
  chest: 'Chest', pecs: 'Chest',
  back: 'Back', lats: 'Back', traps: 'Back', rhomboids: 'Back', 'upper back': 'Back', 'lower back': 'Back',
  shoulders: 'Shoulders', delts: 'Shoulders', rear_delts: 'Shoulders', side_delts: 'Shoulders', front_delts: 'Shoulders',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms', arms: 'Arms',
  quads: 'Legs', quadriceps: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', abductors: 'Legs', legs: 'Legs',
  core: 'Core', abs: 'Core', abdominals: 'Core', obliques: 'Core',
}

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const

export interface MuscleSetRow {
  /** Row identity — falls back for the dedupe key when there is no pair. */
  id: string
  weightKg: number
  reps: number
  /** Unilateral L/R rows share this. Two rows, ONE set. */
  pairId: string | null
  /** Display groups this row credits (already canonicalised, deduped). */
  groups: string[]
  /** Session date, YYYY-MM-DD. */
  date: string
}

export interface MuscleStat { group: string; sets: number; volume: number; daysSince: number | null }

export interface MuscleAggregate {
  stats: MuscleStat[]
  weekly: Array<Record<string, number | string>>
}

/** Sunday-anchored week start for a YYYY-MM-DD date. */
export function weekStartUTC(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/**
 * Fold rows into per-group set counts, tonnage and recency, plus a per-week
 * set series.
 *
 * TWO RULES THAT ARE EASY TO GET WRONG, both load-bearing:
 *
 * 1. A unilateral exercise logs left and right as separate rows sharing a
 *    `pairId`. That is ONE set for every set-count purpose (balance radar,
 *    freshness, contour map, volume stream) and TWO rows for tonnage. Counting
 *    it as two sets doubled every cable lateral raise in the volume landmarks.
 * 2. A row tagged `quads + glutes` credits a set to BOTH — but only once each,
 *    even if the same pair appears twice in the input.
 */
export function aggregateMuscleSets(rows: readonly MuscleSetRow[], todayISO: string): MuscleAggregate {
  const agg = new Map<string, { sets: number; volume: number; last: string | null }>()
  const weekMap = new Map<string, Record<string, number>>()
  const countedSets = new Set<string>()     // `${group}|${dedupeKey}`
  const countedWeekly = new Set<string>()   // `${week}|${group}|${dedupeKey}`

  for (const r of rows) {
    const groups = new Set(r.groups)
    if (!groups.size) continue
    const week = weekStartUTC(r.date)
    const dedupeKey = r.pairId ?? r.id
    const vol = (r.weightKg || 0) * (r.reps || 0)
    for (const g of groups) {
      const a = agg.get(g) ?? { sets: 0, volume: 0, last: null }
      a.volume += vol
      if (!a.last || r.date > a.last) a.last = r.date
      const setKey = `${g}|${dedupeKey}`
      if (!countedSets.has(setKey)) { countedSets.add(setKey); a.sets += 1 }
      agg.set(g, a)
      const w = weekMap.get(week) ?? {}
      const weekKey = `${week}|${g}|${dedupeKey}`
      if (!countedWeekly.has(weekKey)) { countedWeekly.add(weekKey); w[g] = (w[g] ?? 0) + 1 }
      weekMap.set(week, w)
    }
  }

  const todayMs = Date.parse(`${todayISO}T00:00:00Z`)
  const stats: MuscleStat[] = MUSCLE_GROUPS.map((g) => {
    const a = agg.get(g)
    const daysSince = a?.last
      ? Math.round((todayMs - Date.parse(`${a.last}T00:00:00Z`)) / 86_400_000)
      : null
    return { group: g, sets: a?.sets ?? 0, volume: Math.round(a?.volume ?? 0), daysSince }
  })

  const weekly = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, groups]) => ({
      week: week.slice(5),
      ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, groups[g] ?? 0])),
    }))

  return { stats, weekly }
}
