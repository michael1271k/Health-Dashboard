/**
 * Narrow a plan-wide progression queue to one training day.
 *
 * Pure and exported so the two behaviours that matter are testable without a
 * schedule: a day with a key keeps only its own lifts, and a day WITHOUT one
 * keeps everything. The keyless case is the PPL era — `scheduleDayFor` returns
 * a bare label there, and every alert carries a Helix `dayKey`, so filtering
 * would silently empty the widget for every legacy date rather than scope it.
 */
export function scopeToDay<T extends { dayKey: string | null }>(
  alerts: readonly T[],
  dayKey: string | null | undefined,
): T[] {
  if (!dayKey) return [...alerts]
  return alerts.filter((a) => a.dayKey === dayKey)
}
