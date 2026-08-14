/**
 * Framework-free measurement rules — no React, no `'use client'`, no browser.
 *
 * These four lived in `utils/units.ts`, which carries `'use client'` because it
 * also exports `useUnitSystem` and reads `localStorage`. That directive makes the
 * WHOLE module a client boundary: a server import gets a client-reference proxy,
 * and calling through it throws
 *
 *   Attempted to call validWeight() from the server but validWeight is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * which is a 500 with no error branch to catch it — the exact reason
 * `/api/widget/snapshot` returned 500 on every request it ever served and
 * `widget_tokens.last_used_at` stayed NULL from the day the endpoint shipped.
 *
 * So the rules that have nothing to do with a preference or a hook live here,
 * where both a route handler and a component can call them. `units.ts` re-exports
 * them, so the ~40 client call sites keep their import path.
 */

/**
 * Global body-weight validity rule: any reading under 50 kg is a scale/ingest
 * artifact (0 kg vacation gaps, partial syncs) and must be ignored by every
 * chart, table, and algorithm.
 */
export const MIN_VALID_WEIGHT_KG = 50

export function validWeight(kg: number | null | undefined): number | null {
  if (kg == null || !Number.isFinite(kg) || kg < MIN_VALID_WEIGHT_KG) return null
  return kg
}

/**
 * Session VOLUME → display string, ALWAYS to exactly one decimal place with
 * thousands separators (e.g. "12,102.5"). Never rounds the half-kg away —
 * quarter-kg microloads make genuine .5 volumes. Pure formatter: pass raw kg for
 * the (kg-labelled) draft badges, or `displayWeight(kg)` for unit-aware
 * committed-detail tiles. Callers append their own unit suffix.
 */
export function fmtVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0.0'
  return (Math.round(value * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Blood-oxygen unit coercion. `daily_logs.blood_oxygen` holds MIXED units:
 * HealthKit's native bridge historically wrote the raw 0–1 fraction (0.982)
 * while the legacy Shortcut wrote a real percent (97.79). Anything ≤1.5 is
 * therefore a fraction and must be scaled to a percent before display —
 * otherwise 0.982 renders as "1%". Idempotent: 97.79 passes through untouched.
 */
export function normalizeSpO2(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return v <= 1.5 ? Math.round(v * 1000) / 10 : v
}
