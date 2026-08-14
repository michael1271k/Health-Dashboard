/**
 * Manual-override sentinel for `water_intake.hk_uuid`.
 *
 * ── WHY WATER NEEDS ITS OWN SENTINEL ─────────────────────────────────────────
 * Hydration is the one metric stored in TWO places that must agree:
 *
 *   · `daily_logs.water_ml`  — what every surface renders (dashboard, day page,
 *     nutrition page, the widget snapshot's fallback)
 *   · `water_intake`         — what `/api/compute-score` SUMS into `waterMl`,
 *     and therefore the only one that moves the hydration score
 *
 * They stay in step only because `ingestDailyLog` writes both from one payload
 * field. So a manual correction has to write both too, and — the reason this
 * file exists — HealthKit has to be told to stop writing EITHER of them for a
 * day the user has corrected by hand. Guarding one and not the other is worse
 * than guarding neither: the number on screen and the number being graded come
 * apart, and nothing in the UI can show that they have.
 *
 * `water_intake.hk_uuid` carries a UNIQUE index (`water_intake_hk_uuid_key`),
 * exactly like `nutrition_entries.hk_uuid`, so the sentinel is PER DAY rather
 * than a shared literal — a single `'manual'` string could only ever exist on
 * one date. Same lesson as {@link manualHkUuid}, learned there first.
 *
 * The prefix is distinct from the macro sentinel (`manual-` vs `manual-water-`)
 * because the two tables are checked by different call sites and a value that
 * satisfied both predicates would let a macro override silently suppress a water
 * sync. `isManualWaterHkUuid` is deliberately NOT satisfied by `manual-2026-…`.
 *
 * Pure and framework-free: the ingest route (server) and the override hook
 * (client) share one definition.
 */

const PREFIX = 'manual-water-'

/** The per-day water sentinel, e.g. `manual-water-2026-08-14`. */
export function manualWaterHkUuid(date: string): string {
  return `${PREFIX}${date}`
}

/** True only for a water sentinel — a macro sentinel (`manual-<date>`) is not one. */
export function isManualWaterHkUuid(hkUuid: string | null | undefined): boolean {
  return typeof hkUuid === 'string' && hkUuid.startsWith(PREFIX)
}
