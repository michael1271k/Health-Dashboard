/**
 * Manual-macro sentinel for `nutrition_entries.hk_uuid`.
 *
 * THE BUG THIS FIXES. The manual override used to stamp the literal string
 * `'manual'` on every hand-entered day. `nutrition_entries.hk_uuid` carries a
 * UNIQUE index (`nutrition_entries_hk_uuid_key`), so that literal could only
 * ever exist on ONE row: saving manual macros for a second day — or racing two
 * saves from a double-tap on the Save button — hit
 *
 *   duplicate key value violates unique constraint "nutrition_entries_hk_uuid_key"
 *
 * because the upsert's conflict target is (user_id, date, meal_type) and so
 * resolves to an INSERT for the new day, which then collides on hk_uuid.
 *
 * The sentinel is now per-day (`manual-2026-07-29`), which is unique by
 * construction, and idempotent: re-saving the same day upserts the same row
 * with the same hk_uuid instead of inserting a colliding one.
 *
 * Pure + framework-free so the ingest route (server) and the override hook
 * (client) share one definition.
 */

/** The per-day manual sentinel, e.g. `manual-2026-07-29`. */
export function manualHkUuid(date: string): string {
  return `manual-${date}`
}

/** True for the per-day sentinel AND the legacy bare `'manual'` value. */
export function isManualHkUuid(hkUuid: string | null | undefined): boolean {
  return hkUuid === 'manual' || (typeof hkUuid === 'string' && hkUuid.startsWith('manual-'))
}
