/**
 * Per-date schedule overrides ("Routine Changes" / day swaps).
 *
 * **Supabase is the source of truth.** `schedule_overrides` is the record; this
 * module is a synchronous read-through cache in front of it, so the pure
 * schedule helpers in programs.ts (`scheduleDayFor`, `isTrainingDay`) can stay
 * synchronous and every surface cascades in one render. SSR-safe: on the server
 * the cache is empty and callers fall back to the weekday default.
 *
 * A value is a program day key (cb_a … legs_b) placed onto that date, or the
 * literal 'rest' when a normal training day was cleared.
 *
 * ── WHY THERE IS A VERSION COUNTER ───────────────────────────────────────────
 * This cache used to be a bare module-level object. That is invisible to React:
 * when the DB fetch landed and replaced it, nothing re-rendered, because no
 * component was subscribed to a plain variable. The visible bug (2026-08-04):
 * a swap made on the phone was written to Supabase correctly, the desktop
 * fetched it correctly on load — and still drew the OLD day, because
 * `scheduleDayFor` had already been called during the first render and nothing
 * asked it again. Tapping "Rest Day" on the desktop appeared to "fix" it only
 * because a mutation forced a re-render.
 *
 * So the cache is now a proper external store: every write bumps a version, and
 * `useScheduleVersion()` (src/lib/hooks/useScheduleVersion.ts) subscribes any
 * component that reads the schedule during render. Reads stay synchronous;
 * React just finds out when the answer changes.
 */
export type OverrideValue = string
export const REST_OVERRIDE = 'rest'

const KEY = 'helix_schedule_overrides'
let cache: Record<string, OverrideValue> | null = null

// ── External store plumbing (useSyncExternalStore contract) ──────────────────
// The snapshot MUST be a primitive: returning the cache object itself would
// hand React a new identity on every hydrate and tear on every read.
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version += 1
  for (const l of listeners) l()
}

/** Subscribe to schedule changes. Returns an unsubscribe. */
export function subscribeScheduleOverrides(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Monotonic counter — changes exactly when the effective schedule changes. */
export function scheduleOverridesVersion(): number {
  return version
}

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
  const before = c[dateISO]
  if (value == null) delete c[dateISO]
  else c[dateISO] = value
  if (before === (value ?? undefined)) return   // no-op writes must not re-render
  persist(c)
  emit()
}

/**
 * Replace the whole cache from a DB fetch — this is the cross-device sync path.
 * Emits only when the effective schedule actually differs, so the routine
 * 5-minute revalidation that returns identical rows costs nothing.
 */
export function hydrateScheduleOverrides(rows: Array<{ date: string; day_key: string }>): void {
  const next: Record<string, OverrideValue> = {}
  for (const r of rows) next[r.date] = r.day_key
  const prev = load()
  const changed = Object.keys(next).length !== Object.keys(prev).length
    || Object.keys(next).some((d) => prev[d] !== next[d])
  cache = next
  persist(next)
  if (changed) emit()
}

/**
 * Another TAB of the same browser swapped a day. localStorage `storage` events
 * only fire in the OTHER documents, which is exactly what's wanted here: the
 * writing tab already emitted, the reading tabs learn about it now instead of
 * on their next full reload.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    try {
      cache = (JSON.parse(e.newValue ?? '{}') ?? {}) as Record<string, OverrideValue>
    } catch {
      cache = {}
    }
    emit()
  })
}
