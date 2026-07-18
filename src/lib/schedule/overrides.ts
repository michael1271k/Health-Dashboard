/**
 * Per-date schedule overrides ("Routine Changes" / day swaps). The source of
 * truth is the Supabase `schedule_overrides` table; this module is a synchronous
 * memory + localStorage cache so the pure schedule helpers in programs.ts stay
 * synchronous and every surface cascades instantly. SSR-safe: on the server the
 * cache is empty and callers fall back to the weekday default.
 *
 * A value is a program day key (cb_a … legs_b) placed onto that date, or the
 * literal 'rest' when a normal training day was cleared.
 */
export type OverrideValue = string
export const REST_OVERRIDE = 'rest'

const KEY = 'helix_schedule_overrides'
let cache: Record<string, OverrideValue> | null = null

function load(): Record<string, OverrideValue> {
  if (cache) return cache
  if (typeof window === 'undefined') { cache = {}; return cache }
  try { cache = (JSON.parse(window.localStorage.getItem(KEY) ?? '{}') ?? {}) as Record<string, OverrideValue> }
  catch { cache = {} }
  return cache
}

function persist(c: Record<string, OverrideValue>): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

/** The override for a date, or undefined (→ weekday default). */
export function getScheduleOverride(dateISO: string): OverrideValue | undefined {
  return load()[dateISO]
}

export function getAllScheduleOverrides(): Record<string, OverrideValue> {
  return { ...load() }
}

/** Optimistic local write (mirrors the DB upsert so the UI cascades at once). */
export function setScheduleOverrideLocal(dateISO: string, value: OverrideValue | null): void {
  const c = load()
  if (value == null) delete c[dateISO]
  else c[dateISO] = value
  persist(c)
}

/** Replace the whole cache from a DB fetch (cross-device sync on load). */
export function hydrateScheduleOverrides(rows: Array<{ date: string; day_key: string }>): void {
  const next: Record<string, OverrideValue> = {}
  for (const r of rows) next[r.date] = r.day_key
  cache = next
  persist(next)
}
