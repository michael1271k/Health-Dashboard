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
  // `adductors` / `inner_thigh` were both absent, so the hip-adduction machine
  // credited no display group at all and the Freshness map showed the legs as
  // fresher than they were.
  quads: 'Legs', quadriceps: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs',
  abductors: 'Legs', adductors: 'Legs', inner_thigh: 'Legs', legs: 'Legs',
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
  /** Which limb this row logged. A `pairId` only collapses WITH a side. */
  side?: 'L' | 'R' | null
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

/**
 * Per-row tonnage with unilateral pairs collapsed to the WEAKER side.
 *
 * `sessionVolumeKg` cannot be called directly here: this aggregator credits each
 * row to its own muscle groups, so it needs a per-ROW number, not a session
 * total. The two must still agree, so a genuine L/R pair splits its collapsed
 * total in half across its two rows — the pair then sums to exactly
 * `2 × min(weight) × min(reps)`, which is what `sessionVolumeKg` returns, while
 * each row keeps its own attribution.
 *
 * Rule 1 in this file already deduped the SET COUNT for pairs. Tonnage was never
 * deduped, so "L 5 kg × 10, R 5 kg × 14" credited 120 kg to the group here and
 * 100 kg on the session card — the same work, two answers, and the drift grew
 * with every asymmetric week.
 *
 * A lone side, and a malformed bucket of 3+ rows, score as logged — the same
 * fallbacks `sessionVolumeKg` takes.
 */
function effectiveVolumes(rows: readonly MuscleSetRow[]): Map<string, number> {
  const out = new Map<string, number>()
  const pairs = new Map<string, MuscleSetRow[]>()
  const raw = (r: MuscleSetRow) => (r.weightKg || 0) * (r.reps || 0)

  for (const r of rows) {
    if (r.pairId && (r.side === 'L' || r.side === 'R')) {
      const bucket = pairs.get(r.pairId) ?? []
      bucket.push(r)
      pairs.set(r.pairId, bucket)
      continue
    }
    out.set(r.id, raw(r))
  }

  for (const bucket of pairs.values()) {
    const left = bucket.find((x) => x.side === 'L')
    const right = bucket.find((x) => x.side === 'R')
    if (bucket.length === 2 && left && right) {
      // ONE set's tonnage, at the weaker side, landing on ONE row — the second
      // row of the pair contributes nothing. Splitting it across both rows and
      // letting the caller sum them credited the pair TWICE (2026-08-18): a
      // split single-arm raise outweighed the identical set logged unsided.
      // `sessionVolumeKg` carries the full argument.
      const one = Math.min(left.weightKg || 0, right.weightKg || 0)
        * Math.min(left.reps || 0, right.reps || 0)
      out.set(right.id, one)
      out.set(left.id, 0)
    } else {
      for (const x of bucket) out.set(x.id, raw(x))
    }
  }
  return out
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
  const effective = effectiveVolumes(rows)

  for (const r of rows) {
    const groups = new Set(r.groups)
    if (!groups.size) continue
    const week = weekStartUTC(r.date)
    const dedupeKey = r.pairId ?? r.id
    const vol = effective.get(r.id) ?? (r.weightKg || 0) * (r.reps || 0)
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
