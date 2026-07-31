/**
 * Derived cardio metrics.
 *
 * Pace is DERIVED, never stored. A stored pace drifts the moment you correct a
 * distance or duration, and then two fields in the same row disagree — the
 * classic denormalisation bug. Distance and duration are the facts; pace is a
 * view of them.
 */

/** Minutes per kilometre, or null when either input can't support the ratio. */
export function paceMinPerKm(
  distanceM: number | null | undefined,
  durationMin: number | null | undefined,
): number | null {
  if (distanceM == null || durationMin == null) return null
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationMin)) return null
  if (distanceM <= 0 || durationMin <= 0) return null
  return durationMin / (distanceM / 1000)
}

/**
 * `6:24 /km`.
 *
 * Rounds to the nearest SECOND and splits afterwards, rather than flooring the
 * minute and flooring the remainder. Flooring twice loses a second to binary
 * error whenever the fraction isn't representable: 5.05 min/km is exactly
 * 5:03, but `(5.05 - 5) * 60` evaluates to 2.9999…, which floors to 5:02.
 */
export function formatPace(minPerKm: number | null | undefined): string {
  if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm <= 0) return '—'
  // Guard the absurd: a 1 m "walk" logged over an hour is a typo, not a pace.
  if (minPerKm >= 100) return '—'
  const totalSec = Math.round(minPerKm * 60)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${mins}:${String(secs).padStart(2, '0')} /km`
}

/** Km, rounded for display. Null-safe. */
export function distanceKm(distanceM: number | null | undefined): number | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM < 0) return null
  return Math.round((distanceM / 1000) * 100) / 100
}

/**
 * Active energy for a cardio row.
 *
 * `active_kcal` is the column added when the logger grew its full field set;
 * `kcal` is the original single-number column and is still the only value on
 * every row logged before that. Reading the new one first with the old as
 * fallback keeps history intact without a data migration.
 */
export function activeKcalOf(row: { active_kcal?: number | null; kcal?: number | null }): number | null {
  return row.active_kcal ?? row.kcal ?? null
}
